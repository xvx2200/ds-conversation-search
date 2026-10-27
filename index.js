/**
 * Host half of the Conversation Search bundle.
 *
 * It owns two authenticated Fetch routes:
 * - `POST /api/conversation.search` scans the current conversation or every
 *   conversation of the current workspace and returns grouped hits.
 * - `POST /api/conversation.context` returns the target event plus a small
 *   surrounding window, so the browser can show exactly where a hit lives.
 *
 * Search deliberately covers only three kinds of text: the Session title,
 * human input (`user/message` from the user), and the assistant's answer body
 * (`text` blocks only). Reasoning, tool calls, tool results, system prompts,
 * compaction summaries, and other event families are not searched.
 *
 * Matching modes:
 * - `fuzzy`   — characters of each whitespace-separated term must appear in
 *               order; terms may appear in any order.
 * - `regex`   — JavaScript regular expression syntax.
 * - `literal` — case-insensitive (by default) substring.
 *
 * @module @local/conversation-search
 */

/** Loader entry name; keep it equal to the package's single row id. */
export const name = 'ds-conversation-search'

/**
 * The routes need Connection's authenticated Fetch carrier and the unified
 * Session query service. Both are present in the shipped Web composition;
 * without them the plugin stays inactive instead of throwing at request time.
 */
export const inject = ['connection', 'sessionQuery']

/** Absolute pathname of the search route. */
const SEARCH_PATH = '/api/conversation.search'
/** Absolute pathname of the bounded-context route. */
const CONTEXT_PATH = '/api/conversation.context'

/** Longest accepted query, in UTF-16 code units. */
const MAX_QUERY_CHARS = 400
/** Most Sessions one request may scan (newest first). */
const MAX_SESSIONS_SCANNED = 60
/** Most Sessions with at least one hit a request may return. */
const MAX_SESSIONS_WITH_HITS = 30
/** Most hits a request may return across all Sessions. */
const MAX_HITS = 80
/** Most hits kept per Session (the match count still counts every document). */
const MAX_HITS_PER_SESSION = 5
/** Most highlight ranges kept for one document. */
const MAX_RANGES_PER_DOCUMENT = 80
/** Prefix of a document that matching may inspect, in UTF-16 code units. */
const MAX_DOCUMENT_CHARS = 240_000
/** Characters of context before the first match in a search snippet. */
const SNIPPET_BEFORE = 48
/** Characters of context after the last match in a search snippet. */
const SNIPPET_AFTER = 160
/** Characters shown for one context record. */
const MAX_CONTEXT_TEXT = 4_000
/** Characters shown for one surrounding context record. */
const MAX_CONTEXT_NEIGHBOUR = 2_000
/** Most context records returned for one hit. */
const MAX_CONTEXT_RECORDS = 24
/** Events read before and after the target event. */
const CONTEXT_EVENT_WINDOW = 2
/** Most Sessions whose folded title is read for the result list. */
const MAX_TITLED_SESSIONS = 25
/** Largest accepted JSON request body. */
const MAX_REQUEST_BYTES = 64 * 1024

/** Error carrying a stable code, a user-facing message, and an HTTP status. */
class SearchRequestError extends Error {
  /**
   * @param {string} code - stable machine-readable failure code.
   * @param {string} message - user-facing description.
   * @param {number} status - HTTP status the route should answer with.
   * @param {string | undefined} detail - optional implementation detail, such as a regex syntax error.
   */
  constructor(code, message, status = 400, detail = undefined) {
    super(message)
    this.name = 'SearchRequestError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/**
 * Compare two workspace directories as the same workspace.
 * @param {unknown} value - a Session header's `cwd`.
 * @returns {string | undefined} a normalized directory, or undefined when absent.
 */
function normalizeCwd(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(/\\/gu, '/').replace(/\/+$/u, '')
  if (normalized === '') return undefined
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Sort and merge overlapping or adjacent highlight ranges.
 * @param {Array<[number, number]>} ranges - code-unit ranges.
 * @returns {Array<[number, number]>} sorted, non-overlapping ranges.
 */
function mergeRanges(ranges) {
  if (ranges.length <= 1) return ranges
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last !== undefined && range[0] <= last[1]) {
      if (range[1] > last[1]) last[1] = range[1]
    } else {
      merged.push([range[0], range[1]])
    }
  }
  return merged
}

/**
 * Join non-empty text parts with newlines.
 * @param {Array<string | undefined>} parts - candidate parts.
 * @returns {string} joined text.
 */
function joinText(parts) {
  return parts
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n')
}

/**
 * Extract ordinary text from message content blocks. Reasoning and tool-call
 * blocks are intentionally ignored.
 * @param {unknown} content - a message content array.
 * @returns {string} joined text.
 */
function textFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return joinText(parts)
}

/**
 * Project one raw Session event onto searchable documents.
 *
 * Only three kinds of text are searchable:
 * - the Session title;
 * - human input (`user/message` whose source is the user, not an injected
 *   compact checkpoint or another context producer);
 * - the assistant's answer body (`text` blocks only; reasoning and tool calls
 *   are excluded).
 * @param {{ type: string, seq: number, time: number, data: unknown }} event - durable Session event.
 * @returns {Array<{ type: string, text: string }>} searchable documents.
 */
function documentsForEvent(event) {
  const data = /** @type {Record<string, any>} */ (event.data ?? {})
  switch (event.type) {
    case 'session/title':
      return typeof data.title === 'string' && data.title.trim() !== ''
        ? [{ type: 'session/title', text: data.title.trim() }]
        : []
    case 'user/message': {
      if (data.source !== undefined && data.source?.kind !== 'user') return []
      const text = textFromContent(data.content)
      return text === '' ? [] : [{ type: 'user/message', text }]
    }
    case 'assistant/message': {
      const text = textFromContent(data.message?.content)
      return text === '' ? [] : [{ type: 'assistant/text', text }]
    }
    default:
      return []
  }
}

/**
 * Collect regular-expression matches without allowing zero-length loops.
 * @param {string} text - document text.
 * @param {RegExp} pattern - a global regular expression.
 * @returns {{ start: number, end: number, ranges: Array<[number, number]> } | null} match summary.
 */
function regexMatch(text, pattern) {
  pattern.lastIndex = 0
  const ranges = []
  let first = -1
  let last = -1
  let match
  let guard = 0
  while ((match = pattern.exec(text)) !== null) {
    guard += 1
    if (guard > MAX_RANGES_PER_DOCUMENT * 4) break
    const length = match[0].length
    if (length === 0) {
      pattern.lastIndex += 1
      if (pattern.lastIndex > text.length) break
      continue
    }
    const start = match.index
    const end = start + length
    if (first < 0) first = start
    last = end
    if (ranges.length < MAX_RANGES_PER_DOCUMENT) ranges.push([start, end])
    if (ranges.length >= MAX_RANGES_PER_DOCUMENT) break
  }
  if (first < 0) return null
  return { start: first, end: last, ranges: mergeRanges(ranges) }
}

/**
 * Match fuzzy terms: each term's characters must appear in order, and every
 * term must match somewhere in the document.
 * @param {string} text - document text.
 * @param {readonly string[]} terms - normalized terms with at least one character each.
 * @param {boolean} caseSensitive - whether comparison preserves case.
 * @returns {{ start: number, end: number, ranges: Array<[number, number]> } | null} match summary.
 */
function fuzzyMatch(text, terms, caseSensitive) {
  const haystack = caseSensitive ? text : text.toLowerCase()
  const ranges = []
  let first = -1
  let last = -1
  for (const term of terms) {
    let matched = 0
    for (let index = 0; index < haystack.length; index += 1) {
      if (haystack[index] !== term[matched]) continue
      const start = index
      ranges.push([start, start + 1])
      if (first < 0 || start < first) first = start
      if (start + 1 > last) last = start + 1
      matched += 1
      if (matched === term.length) break
    }
    if (matched < term.length) return null
  }
  if (first < 0) return null
  return { start: first, end: last, ranges: mergeRanges(ranges) }
}

/**
 * Compile one matcher for a normalized query.
 * @param {string} query - non-empty query.
 * @param {'fuzzy' | 'regex' | 'literal'} mode - matching mode.
 * @param {boolean} caseSensitive - whether matching preserves case.
 * @returns {(text: string) => ({ start: number, end: number, ranges: Array<[number, number]> } | null)} matcher.
 * @throws {SearchRequestError} when a regular expression is invalid.
 */
function compileMatcher(query, mode, caseSensitive) {
  if (mode === 'regex') {
    let pattern
    try {
      pattern = new RegExp(query, caseSensitive ? 'gu' : 'giu')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new SearchRequestError('INVALID_REGEX', '正则表达式无效。', 400, message)
    }
    return (text) => regexMatch(text, pattern)
  }
  if (mode === 'literal') {
    const needle = caseSensitive ? query : query.toLowerCase()
    return (text) => {
      const haystack = caseSensitive ? text : text.toLowerCase()
      const index = haystack.indexOf(needle)
      if (index < 0) return null
      return { start: index, end: index + needle.length, ranges: [[index, index + needle.length]] }
    }
  }
  const terms = query
    .split(/\s+/u)
    .filter((term) => term.length > 0)
    .map((term) => (caseSensitive ? term : term.toLowerCase()))
  return (text) => fuzzyMatch(text, terms, caseSensitive)
}

/**
 * Build one bounded, highlightable snippet around a match.
 * @param {string} text - complete document text (already length-capped by the caller).
 * @param {{ start: number, end: number, ranges: Array<[number, number]> }} match - match summary.
 * @returns {{ snippet: string, ranges: Array<[number, number]>, prefix: boolean, suffix: boolean }} snippet.
 */
function buildSnippet(text, match) {
  const start = Math.max(0, match.start - SNIPPET_BEFORE)
  const end = Math.min(text.length, Math.max(match.end, match.start + 1) + SNIPPET_AFTER)
  const snippet = text.slice(start, end)
  const ranges = []
  for (const [rangeStart, rangeEnd] of match.ranges) {
    const localStart = Math.max(rangeStart, start) - start
    const localEnd = Math.min(rangeEnd, end) - start
    if (localEnd > localStart) ranges.push([localStart, localEnd])
  }
  return {
    snippet,
    ranges: mergeRanges(ranges),
    prefix: start > 0,
    suffix: end < text.length,
  }
}

/**
 * Validate and normalize one search request body.
 * @param {unknown} input - parsed JSON body.
 * @returns {{ sessionId: string, query: string, mode: 'fuzzy' | 'regex' | 'literal', scope: 'session' | 'workspace', caseSensitive: boolean }} normalized request.
 * @throws {SearchRequestError} when a field is missing or invalid.
 */
function validateSearchInput(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SearchRequestError('INVALID_REQUEST', '请求体必须是 JSON 对象。')
  }
  const candidate = /** @type {Record<string, unknown>} */ (input)
  const sessionId = typeof candidate.sessionId === 'string' ? candidate.sessionId.trim() : ''
  if (sessionId === '') throw new SearchRequestError('INVALID_REQUEST', '缺少当前对话标识。')

  const query = typeof candidate.query === 'string' ? candidate.query.trim() : ''
  if (query === '') throw new SearchRequestError('INVALID_REQUEST', '检索内容不能为空。')
  if (query.length > MAX_QUERY_CHARS) {
    throw new SearchRequestError('INVALID_REQUEST', `检索内容不能超过 ${MAX_QUERY_CHARS} 个字符。`)
  }

  const mode = candidate.mode === undefined ? 'fuzzy' : candidate.mode
  if (mode !== 'fuzzy' && mode !== 'regex' && mode !== 'literal') {
    throw new SearchRequestError('INVALID_REQUEST', '未知的匹配方式。')
  }

  const scope = candidate.scope === undefined ? 'session' : candidate.scope
  if (scope !== 'session' && scope !== 'workspace') {
    throw new SearchRequestError('INVALID_REQUEST', '未知的检索范围。')
  }

  return {
    sessionId,
    query,
    mode,
    scope,
    caseSensitive: candidate.caseSensitive === true,
  }
}

/**
 * Validate and normalize one context request body.
 * @param {unknown} input - parsed JSON body.
 * @returns {{ sessionId: string, seq: number, query: string, mode: 'fuzzy' | 'regex' | 'literal', caseSensitive: boolean }} normalized request.
 * @throws {SearchRequestError} when a field is missing or invalid.
 */
function validateContextInput(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SearchRequestError('INVALID_REQUEST', '请求体必须是 JSON 对象。')
  }
  const candidate = /** @type {Record<string, unknown>} */ (input)
  const sessionId = typeof candidate.sessionId === 'string' ? candidate.sessionId.trim() : ''
  if (sessionId === '') throw new SearchRequestError('INVALID_REQUEST', '缺少当前对话标识。')
  const seq = candidate.seq
  if (!Number.isSafeInteger(seq) || seq < 0) throw new SearchRequestError('INVALID_REQUEST', '缺少有效的事件位置。')
  const query = typeof candidate.query === 'string' ? candidate.query.trim() : ''
  if (query === '') throw new SearchRequestError('INVALID_REQUEST', '检索内容不能为空。')
  const mode = candidate.mode === undefined ? 'fuzzy' : candidate.mode
  if (mode !== 'fuzzy' && mode !== 'regex' && mode !== 'literal') {
    throw new SearchRequestError('INVALID_REQUEST', '未知的匹配方式。')
  }
  return {
    sessionId,
    seq,
    query,
    mode,
    caseSensitive: candidate.caseSensitive === true,
  }
}

/**
 * Resolve the current conversation's effective workspace directory.
 * @param {object} ctx - Host context.
 * @param {string} sessionId - current conversation id.
 * @param {{ header: { cwd?: string } }} record - listed record for that conversation.
 * @returns {string | undefined} normalized directory.
 */
function resolveWorkspaceDirectory(ctx, sessionId, record) {
  const fromHeader = normalizeCwd(record.header.cwd)
  if (fromHeader !== undefined) return fromHeader
  try {
    const sessions = ctx.get('sessions')
    const workingDirectory = ctx.get('workingDirectory')
    if (sessions === undefined || workingDirectory === undefined) return undefined
    const session = sessions.get(sessionId)
    if (session === undefined) return undefined
    return normalizeCwd(workingDirectory.get(session))
  } catch {
    return undefined
  }
}

/**
 * Read folded titles for the Sessions that produced hits. Title folding reads
 * a Session log, so it is bounded and its failures never fail the search.
 * @param {object} ctx - Host context.
 * @param {string[]} sessionIds - Sessions whose titles are wanted.
 * @param {AbortSignal | undefined} signal - request cancellation.
 * @returns {Promise<Map<string, string>>} session id to title.
 */
async function readTitles(ctx, sessionIds, signal) {
  const titles = new Map()
  if (sessionIds.length === 0) return titles
  try {
    const observations = await ctx.sessionQuery.readTitleSnapshots(sessionIds.slice(0, MAX_TITLED_SESSIONS), signal)
    for (const observation of observations) {
      if (observation.status !== 'fulfilled') continue
      const title = observation.value?.title?.title
      if (typeof title === 'string' && title.trim() !== '') titles.set(String(observation.sessionId), title.trim())
    }
  } catch (error) {
    if (signal?.aborted) throw error
  }
  return titles
}

/**
 * Search one conversation or the current workspace conversation corpus.
 * @param {object} ctx - Host context carrying `sessionQuery` (and optionally `sessions`/`workingDirectory`).
 * @param {unknown} input - request body.
 * @param {AbortSignal | undefined} signal - request cancellation.
 * @returns {Promise<object>} grouped, snippet-bearing results.
 * @throws {SearchRequestError} for invalid requests and missing conversations.
 */
export async function searchConversationHistory(ctx, input, signal) {
  const started = Date.now()
  const request = validateSearchInput(input)
  signal?.throwIfAborted()

  const records = await ctx.sessionQuery.listSessions(signal)
  const current = records.find((record) => String(record.header.id) === request.sessionId)
  if (current === undefined) {
    throw new SearchRequestError('SESSION_NOT_FOUND', '当前对话不存在或尚未保存。', 404)
  }

  let candidates
  if (request.scope === 'session') {
    candidates = [current]
  } else {
    const cwd = resolveWorkspaceDirectory(ctx, request.sessionId, current)
    if (cwd === undefined) {
      throw new SearchRequestError('NO_WORKSPACE', '当前对话没有可用的工作区目录，无法按工作区检索。', 400)
    }
    candidates = records.filter((record) => {
      if (String(record.header.id) === request.sessionId) return true
      if (record.header.origin === 'subagent') return false
      return normalizeCwd(record.header.cwd) === cwd
    })
  }

  const matcher = compileMatcher(request.query, request.mode, request.caseSensitive)
  const sessions = []
  const warnings = []
  let scannedSessions = 0
  let totalMatches = 0
  let returnedHits = 0
  let truncated = false

  for (let index = 0; index < candidates.length; index += 1) {
    if (index >= MAX_SESSIONS_SCANNED || sessions.length >= MAX_SESSIONS_WITH_HITS || returnedHits >= MAX_HITS) {
      truncated = true
      break
    }
    signal?.throwIfAborted()
    const record = candidates[index]
    scannedSessions += 1

    let snapshot
    try {
      snapshot = await ctx.sessionQuery.readSession(record.header.id)
    } catch (error) {
      if (signal?.aborted) throw error
      if (warnings.length < 3) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`无法读取对话 ${String(record.header.id)}：${message}`)
      }
      continue
    }
    signal?.throwIfAborted()

    const hits = []
    let matchCount = 0
    let lastActivity = typeof record.header.createdAt === 'number' ? record.header.createdAt : 0
    const totalEvents = snapshot.events.length
    for (const event of snapshot.events) {
      for (const document of documentsForEvent(event)) {
        if (document.text.length === 0) continue
        const inspectable = document.text.length > MAX_DOCUMENT_CHARS ? document.text.slice(0, MAX_DOCUMENT_CHARS) : document.text
        const match = matcher(inspectable)
        if (match === null) continue
        matchCount += 1
        if (event.time > lastActivity) lastActivity = event.time
        if (hits.length < MAX_HITS_PER_SESSION) {
          const firstRange = match.ranges[0]
          hits.push({
            seq: event.seq,
            type: document.type,
            time: event.time,
            progress: totalEvents <= 1 ? 0 : event.seq / (totalEvents - 1),
            ...buildSnippet(inspectable, match),
            matchText: inspectable.slice(firstRange[0], firstRange[1]),
            locateText: inspectable.slice(match.start, Math.min(match.end, match.start + 200)),
          })
        }
      }
    }
    if (matchCount === 0) continue

    hits.sort((a, b) => b.time - a.time)
    totalMatches += matchCount
    returnedHits += hits.length
    sessions.push({
      sessionId: String(record.header.id),
      title: undefined,
      updatedAt: lastActivity,
      matchCount,
      hits,
    })
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  const titles = await readTitles(ctx, sessions.map((session) => session.sessionId), signal)
  for (const session of sessions) session.title = titles.get(session.sessionId)

  return {
    query: request.query,
    mode: request.mode,
    scope: request.scope,
    caseSensitive: request.caseSensitive,
    sessions,
    totalMatches,
    returnedHits,
    scannedSessions,
    truncated,
    elapsedMs: Date.now() - started,
    warnings,
  }
}

/**
 * Return the target event plus a bounded surrounding window, with the query
 * highlighted in every document that contains it.
 * @param {object} ctx - Host context.
 * @param {unknown} input - context request body.
 * @param {AbortSignal | undefined} signal - request cancellation.
 * @returns {Promise<object>} target and neighbor records.
 */
export async function readConversationContext(ctx, input, signal) {
  const request = validateContextInput(input)
  const matcher = compileMatcher(request.query, request.mode, request.caseSensitive)
  let window
  try {
    window = await ctx.sessionQuery.readEvent({
      sessionId: request.sessionId,
      seq: request.seq,
      before: CONTEXT_EVENT_WINDOW,
      after: CONTEXT_EVENT_WINDOW,
    }, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    const missing = /not found|no event/iu.test(message)
    throw new SearchRequestError(
      missing ? 'EVENT_NOT_FOUND' : 'CONTEXT_FAILED',
      missing ? '找不到该条命中事件。' : '无法读取命中事件的上下文。',
      missing ? 404 : 500,
      message,
    )
  }

  let title
  try {
    const observation = await ctx.sessionQuery.readTitleSnapshot(request.sessionId, signal)
    title = observation?.title?.title
  } catch (error) {
    if (signal?.aborted) throw error
  }

  const records = []
  for (const event of window.events) {
    if (records.length >= MAX_CONTEXT_RECORDS) break
    const documents = documentsForEvent(event)
    if (documents.length === 0) continue
    const isTarget = event.seq === request.seq
    let selected = documents
    if (isTarget) {
      const matching = documents.filter((document) => matcher(document.text) !== null)
      if (matching.length > 0) selected = matching
    }
    for (const document of selected) {
      if (records.length >= MAX_CONTEXT_RECORDS) break
      const match = matcher(document.text)
      const limit = isTarget ? MAX_CONTEXT_TEXT : MAX_CONTEXT_NEIGHBOUR
      let start = 0
      if (match !== null && match.start > limit - 400) {
        start = Math.max(0, Math.min(match.start - 400, document.text.length - limit))
      }
      const text = document.text.slice(start, start + limit)
      const ranges = []
      if (match !== null) {
        for (const [rangeStart, rangeEnd] of match.ranges) {
          const localStart = Math.max(rangeStart, start) - start
          const localEnd = Math.min(rangeEnd, start + text.length) - start
          if (localEnd > localStart) ranges.push([localStart, localEnd])
        }
      }
      records.push({
        seq: event.seq,
        type: document.type,
        time: event.time,
        text,
        ranges: mergeRanges(ranges),
        prefix: start > 0,
        suffix: start + text.length < document.text.length,
        truncated: start + text.length < document.text.length,
        isTarget,
      })
    }
  }

  const targetRecord = records.find((record) => record.isTarget)
  return {
    sessionId: request.sessionId,
    title: typeof title === 'string' ? title : undefined,
    targetSeq: request.seq,
    matchText: targetRecord !== undefined && targetRecord.ranges.length > 0
      ? targetRecord.text.slice(targetRecord.ranges[0][0], targetRecord.ranges[0][1])
      : undefined,
    records,
  }
}

/**
 * Answer one HTTP request with a JSON response.
 * @param {unknown} body - JSON-serializable body.
 * @param {number} status - HTTP status.
 * @returns {Response} response.
 */
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Read and validate a JSON request body.
 * @param {Request} request - browser request.
 * @returns {Promise<unknown>} parsed body.
 * @throws {SearchRequestError} when the body is missing, too large, or invalid.
 */
async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new SearchRequestError('REQUEST_TOO_LARGE', '请求体过大。', 413)
  }
  try {
    return await request.json()
  } catch {
    throw new SearchRequestError('INVALID_JSON', '请求体必须是合法 JSON。', 400)
  }
}

/**
 * Build one JSON route handler with shared method and failure handling.
 * @param {(ctx: object, input: unknown, signal: AbortSignal) => Promise<unknown>} operation - business operation.
 * @returns {(ctx: object, request: Request) => Promise<Response>} route handler.
 */
function jsonRoute(operation) {
  return async (ctx, request) => {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST。' } }, 405)
    }
    try {
      const input = await readJsonBody(request)
      const value = await operation(ctx, input, request.signal)
      return jsonResponse({ ok: true, value }, 200)
    } catch (error) {
      if (error instanceof SearchRequestError) {
        return jsonResponse({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.detail === undefined ? {} : { detail: error.detail }),
          },
        }, error.status)
      }
      if (request.signal.aborted) {
        return jsonResponse({ ok: false, error: { code: 'CANCELLED', message: '检索已取消。' } }, 499)
      }
      const message = error instanceof Error ? error.message : String(error)
      return jsonResponse({ ok: false, error: { code: 'INTERNAL', message: `检索失败：${message}` } }, 500)
    }
  }
}

/**
 * Serve `POST /api/conversation.search`.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated browser request.
 * @returns {Promise<Response>} JSON result or a typed failure.
 */
export async function conversationSearchResponse(ctx, request) {
  return jsonRoute(searchConversationHistory)(ctx, request)
}

/**
 * Serve `POST /api/conversation.context`.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated browser request.
 * @returns {Promise<Response>} JSON result or a typed failure.
 */
export async function conversationContextResponse(ctx, request) {
  return jsonRoute(readConversationContext)(ctx, request)
}

/**
 * Register the authenticated search and context routes for this plugin's lifetime.
 * @param {object} ctx - Host context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SEARCH_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => jsonRoute(searchConversationHistory)(ctx, request),
      }),
    'conversation-search: search route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: CONTEXT_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => jsonRoute(readConversationContext)(ctx, request),
      }),
    'conversation-search: context route',
  )
}
