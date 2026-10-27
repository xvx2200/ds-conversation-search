/**
 * Browser half of the Conversation Search bundle.
 *
 * Registers a labeled search chip in the composer dock, a compact magnifier in
 * the composer tool row, and one frame-wide search dialog. The dialog calls the
 * Host routes `POST /api/conversation.search` and
 * `POST /api/conversation.context` with the same-origin browser cookie; all
 * matching happens on the Host.
 */

window.__ModuleLoader__.load({
  id: 'ds-conversation-search',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'conversationSearch'
    const ROUTE = 'api/conversation.search'
    const CONTEXT_ROUTE = 'api/conversation.context'
    const DEBOUNCE_MS = 320
    const HEADING_ID = 'dsh-conversation-search-heading'
    const SHORTCUT_ID = 'conversation-search.open'
    const HIGHLIGHT_NAME = 'conversation-search-hit'

    const EN = {
      title: 'Conversation Search',
      placeholder: 'Search the conversation record…',
      dockLabel: 'Search',
      scopeLabel: 'Scope',
      scopeSession: 'This conversation',
      scopeWorkspace: 'This workspace',
      modeLabel: 'Match',
      modeFuzzy: 'Fuzzy',
      modeFuzzyTitle: 'Characters in order; every space-separated term must appear',
      modeRegex: 'Regex',
      modeRegexTitle: 'JavaScript regular expression syntax',
      modeLiteral: 'Keyword',
      modeLiteralTitle: 'Literal substring',
      caseSensitive: 'Match case',
      hint: 'Search only conversation titles, your own messages, and assistant answer text. Reasoning, tools, system prompts, and compaction are excluded. Fuzzy matches characters in order; Regex uses JavaScript syntax.',
      searching: 'Searching…',
      noResults: 'No matches',
      error: 'Search failed',
      invalidRegex: 'Invalid regular expression',
      errorNoWorkspace: 'This conversation has no workspace directory.',
      errorSessionNotFound: 'This conversation no longer exists.',
      results: '{count} matches in {sessions} conversations',
      scanned: 'Scanned {count} conversations',
      truncated: 'Results truncated',
      warnings: 'Some conversations could not be read: ',
      open: 'Locate this hit',
      close: 'Close',
      untitled: 'Untitled conversation',
      kindUser: 'You',
      kindAssistant: 'Assistant',
      kindAssistantText: 'Assistant',
      kindAssistantReasoning: 'Thinking',
      kindToolCall: 'Tool call',
      kindToolResult: 'Tool result',
      kindSystem: 'System prompt',
      kindDeveloper: 'Context',
      kindTodo: 'Todo',
      kindTurnError: 'Turn error',
      kindCompaction: 'Compaction',
      kindCompactionError: 'Compaction error',
      kindTitle: 'Title',
      kindOther: 'Record',
      detailTitle: 'Hit location',
      back: 'Back to results',
      locate: 'Locate in conversation',
      locateFailed: 'Could not locate this text in the rendered conversation. The highlighted context above is the exact event.',
      contextLoading: 'Loading context…',
      contextError: 'Could not load context',
      contextNote: 'Context from the Session log. Surrounding records are dimmed.',
      openConversation: 'Open conversation',
      matchLabel: 'Match',
    }

    const ZH = {
      title: '对话检索',
      placeholder: '检索对话记录…',
      dockLabel: '检索',
      scopeLabel: '检索范围',
      scopeSession: '当前对话',
      scopeWorkspace: '当前工作区',
      modeLabel: '匹配方式',
      modeFuzzy: '模糊',
      modeFuzzyTitle: '按字符顺序匹配，空格分隔的每个词都需出现',
      modeRegex: '正则',
      modeRegexTitle: '使用 JavaScript 正则表达式语法',
      modeLiteral: '关键词',
      modeLiteralTitle: '按字面子串匹配',
      caseSensitive: '区分大小写',
      hint: '只检索会话名称、你的输入和模型回答正文；思考、工具调用与结果、系统提示、压缩摘要等不参与检索。模糊模式按字符顺序匹配，正则模式使用 JavaScript 语法。',
      searching: '检索中…',
      noResults: '没有匹配结果',
      error: '检索失败',
      invalidRegex: '正则表达式无效',
      errorNoWorkspace: '当前对话没有可用的工作区目录。',
      errorSessionNotFound: '当前对话不存在或尚未保存。',
      results: '{count} 条命中 · {sessions} 个对话',
      scanned: '已扫描 {count} 个对话',
      truncated: '结果已截断',
      warnings: '部分对话无法读取：',
      open: '定位这条命中',
      close: '关闭',
      untitled: '未命名对话',
      kindUser: '你',
      kindAssistant: '助手',
      kindAssistantText: '助手',
      kindAssistantReasoning: '思考',
      kindToolCall: '工具调用',
      kindToolResult: '工具结果',
      kindSystem: '系统提示',
      kindDeveloper: '上下文',
      kindTodo: '待办',
      kindTurnError: '回合错误',
      kindCompaction: '压缩摘要',
      kindCompactionError: '压缩错误',
      kindTitle: '标题',
      kindOther: '记录',
      detailTitle: '命中位置',
      back: '返回结果',
      locate: '在对话中定位',
      locateFailed: '未能在已渲染的对话中定位这段文字；上方高亮的上下文就是精确命中位置。',
      contextLoading: '正在读取上下文…',
      contextError: '读取上下文失败',
      contextNote: '上下文来自会话记录；相邻记录已淡化。',
      openConversation: '打开对话',
      matchLabel: '命中',
    }

    const CSS = `
.dsh-cs-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-cs-trigger:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
  color: var(--dsw-alias-label-primary);
}
.dsh-cs-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-cs-dock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh-cs-dock:hover {
  border-color: var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  color: var(--dsw-alias-label-primary);
}
.dsh-cs-dock:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-cs-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 24px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 46%, transparent);
  pointer-events: auto;
}
.dsh-cs-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: 78vh;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 24px 64px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent);
  font-size: 13px;
}
.dsh-cs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh-cs-heading {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-cs-close,
.dsh-cs-back,
.dsh-cs-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.dsh-cs-close {
  width: 26px;
  padding: 0;
  font-size: 18px;
}
.dsh-cs-action {
  border-color: var(--dsw-alias-border-l1);
}
.dsh-cs-close:hover,
.dsh-cs-back:hover,
.dsh-cs-action:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
  color: var(--dsw-alias-label-primary);
}
.dsh-cs-action:disabled {
  cursor: default;
  opacity: 0.5;
}
.dsh-cs-close:focus-visible,
.dsh-cs-back:focus-visible,
.dsh-cs-action:focus-visible,
.dsh-cs-hit:focus-visible,
.dsh-cs-seg button:focus-visible,
.dsh-cs-toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-cs-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
}
.dsh-cs-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  outline: none;
}
.dsh-cs-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-cs-input::placeholder {
  color: var(--dsw-alias-label-secondary);
}
.dsh-cs-seg {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-cs-seg button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-cs-seg button[aria-pressed="true"] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.dsh-cs-toggle {
  flex: none;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-cs-toggle[aria-pressed="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dsh-cs-scope {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dsh-cs-scope .dsh-cs-seg button {
  height: 24px;
  padding: 0 8px;
}
.dsh-cs-body {
  flex: 1;
  min-height: 128px;
  overflow: auto;
  padding: 4px 8px 8px;
  scrollbar-width: thin;
}
.dsh-cs-status {
  padding: 28px 16px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  line-height: 1.6;
}
.dsh-cs-status[role="status"] {
  white-space: pre-wrap;
}
.dsh-cs-error {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-cs-session + .dsh-cs-session {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-cs-session-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 8px 4px;
}
.dsh-cs-session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-cs-session-time {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh-cs-hit {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-cs-hit:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.dsh-cs-hit-kind {
  flex: none;
  max-width: 84px;
  margin-top: 1px;
  overflow: hidden;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-cs-snippet-text {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.dsh-cs-mark {
  border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent);
  color: inherit;
}
.dsh-cs-ellipsis {
  color: var(--dsw-alias-label-secondary);
}
.dsh-cs-context {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 4px 8px;
}
.dsh-cs-context-record {
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
}
.dsh-cs-context-record + .dsh-cs-context-record {
  margin-top: 0;
}
.dsh-cs-context-target {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent);
}
.dsh-cs-context-neighbour {
  opacity: 0.72;
}
.dsh-cs-context-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.dsh-cs-context-text {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 12px;
}
.dsh-cs-context-more {
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh-cs-jump-note {
  color: var(--dsw-alias-state-warn-primary);
}
.dsh-cs-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh-cs-warn {
  color: var(--dsw-alias-state-warn-primary);
}
`

    /** Small external store shared by the composer entries and the frame-wide dialog. */
    const store = (() => {
      let state = {
        open: false,
        sessionId: null,
        query: '',
        mode: 'fuzzy',
        scope: 'session',
        caseSensitive: false,
        status: 'idle',
        error: null,
        value: null,
        detail: null,
        detailStatus: 'idle',
        detailError: null,
        detailValue: null,
        jumpNote: null,
      }
      const listeners = new Set()
      const emit = () => {
        for (const listener of listeners) listener()
      }
      return {
        getSnapshot: () => state,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        set: (patch) => {
          state = { ...state, ...patch }
          emit()
        },
        open: (sessionId) => {
          clearHighlight()
          state = {
            ...state,
            open: true,
            sessionId: String(sessionId),
            query: '',
            status: 'idle',
            error: null,
            value: null,
            detail: null,
            detailStatus: 'idle',
            detailError: null,
            detailValue: null,
            jumpNote: null,
          }
          emit()
        },
        close: () => {
          if (!state.open) return
          state = { ...state, open: false }
          emit()
        },
      }
    })()

    /**
     * Translate through the slot-provided seat when present, otherwise bind the
     * plugin namespace and re-render on locale changes.
     * @param {object} ctx - browser plugin context.
     * @param {((key: string) => string) | undefined} given - slot-provided translate seat.
     * @returns {(key: string) => string} translate function.
     */
    function useTranslate(ctx, given) {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => {
        if (given !== undefined) return undefined
        return ctx.locale.subscribe(() => force())
      }, [ctx, given])
      return given === undefined ? ctx.locale.bind(NS) : given
    }

    /** Latest keycaps for the search shortcut, updated from the shortcut catalog. */
    const shortcutKeysStore = (() => {
      let value = null
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        set: (next) => {
          value = next
          for (const listener of listeners) listener()
        },
      }
    })()

    /**
     * Resolve the current shortcut keycaps for the button tooltip.
     * @returns {string | null} formatted keys, or null when unbound/unavailable.
     */
    function useShortcutKeys() {
      return React.useSyncExternalStore(
        shortcutKeysStore.subscribe,
        shortcutKeysStore.getSnapshot,
        shortcutKeysStore.getSnapshot,
      )
    }

    /**
     * Fill `{name}` placeholders in one translated template.
     * @param {string} template - translated template.
     * @param {Record<string, string | number>} values - replacement values.
     * @returns {string} filled text.
     */
    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/gu, (match, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
      )
    }

    /**
     * Localized short label for one searchable document type.
     * @param {string} type - synthetic document type.
     * @param {(key: string) => string} t - translate function.
     * @returns {string} label.
     */
    function kindLabel(type, t) {
      switch (type) {
        case 'user/message':
          return t('kindUser')
        case 'assistant/text':
        case 'assistant/message':
          return t('kindAssistantText')
        case 'session/title':
          return t('kindTitle')
        default:
          return t('kindOther')
      }
    }

    /**
     * Format a Session activity timestamp compactly.
     * @param {number} value - epoch milliseconds.
     * @returns {string} short time.
     */
    function formatTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const now = new Date()
      const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      return sameDay
        ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
    }

    /**
     * Human-readable message for a failed request payload or network error.
     * @param {(key: string) => string} t - translate function.
     * @param {unknown} error - failure value.
     * @returns {string} description.
     */
    function describeError(t, error) {
      if (error === null || error === undefined) return t('error')
      if (typeof error === 'string') return error
      if (error.code === 'INVALID_REGEX') {
        return `${t('invalidRegex')}${error.detail === undefined ? '' : `：${String(error.detail)}`}`
      }
      if (error.code === 'NO_WORKSPACE') return t('errorNoWorkspace')
      if (error.code === 'SESSION_NOT_FOUND') return t('errorSessionNotFound')
      return typeof error.message === 'string' && error.message !== '' ? error.message : t('error')
    }

    /** The compact magnifier glyph. */
    const SearchIcon = () =>
      h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          'aria-hidden': true,
          focusable: false,
        },
        h('circle', {
          cx: 7,
          cy: 7,
          r: 4.25,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
        }),
        h('path', {
          d: 'M10.2 10.2 13.5 13.5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )

    /**
     * Render text with highlighted code-unit ranges.
     * @param {{ text: string, ranges: Array<[number, number]>, prefix?: boolean, suffix?: boolean, className?: string }} props - text and ranges.
     * @returns {import('react').ReactNode} highlighted content.
     */
    function HighlightedText(props) {
      const { text, ranges, prefix = false, suffix = false, className = 'dsh-cs-snippet-text' } = props
      const children = []
      let cursor = 0
      for (let index = 0; index < ranges.length; index += 1) {
        const [start, end] = ranges[index]
        if (start > cursor) children.push(text.slice(cursor, start))
        children.push(h('mark', { key: `mark-${index}`, className: 'dsh-cs-mark' }, text.slice(start, end)))
        cursor = end
      }
      if (cursor < text.length) children.push(text.slice(cursor))
      return h(
        'span',
        { className },
        prefix ? h('span', { className: 'dsh-cs-ellipsis' }, '…') : null,
        children,
        suffix ? h('span', { className: 'dsh-cs-ellipsis' }, '…') : null,
      )
    }

    /** Composer entry: a compact tool-row icon or a labeled dock chip. */
    function SearchButton(props) {
      const ctx = props.ctx
      const t = useTranslate(ctx, props.t)
      const shortcutKeys = useShortcutKeys()
      const sessionId = String(props.sessionId)
      const dock = props.variant === 'dock'
      const tooltip = shortcutKeys === null ? t('title') : `${t('title')} (${shortcutKeys})`

      return h(
        React.Fragment,
        null,
        h('style', { key: 'css' }, CSS),
        h(
          'button',
          {
            key: 'button',
            type: 'button',
            className: dock ? 'dsh-cs-dock' : 'dsh-cs-trigger',
            'aria-label': t('title'),
            title: tooltip,
            onClick: () => store.open(sessionId),
          },
          h(SearchIcon),
          dock ? h('span', null, t('dockLabel')) : null,
        ),
      )
    }

    /** Grouped result list. */
    function Results(props) {
      const { value, t, onOpen } = props
      return h(
        'div',
        { className: 'dsh-cs-results' },
        value.sessions.map((session) =>
          h(
            'section',
            { key: session.sessionId, className: 'dsh-cs-session' },
            h(
              'div',
              { className: 'dsh-cs-session-head' },
              h('span', { className: 'dsh-cs-session-title' }, session.title || t('untitled')),
              h('span', { className: 'dsh-cs-session-time' }, formatTime(session.updatedAt)),
            ),
            session.hits.map((hit) =>
              h(
                'button',
                {
                  key: `${session.sessionId}-${hit.seq}-${hit.type}`,
                  type: 'button',
                  className: 'dsh-cs-hit',
                  title: t('open'),
                  onClick: () => onOpen(session.sessionId, hit),
                },
                h('span', { className: 'dsh-cs-hit-kind' }, kindLabel(hit.type, t)),
                h(HighlightedText, {
                  text: hit.snippet,
                  ranges: hit.ranges,
                  prefix: hit.prefix,
                  suffix: hit.suffix,
                }),
              ),
            ),
          ),
        ),
      )
    }

    /** One context record inside the hit-location view. */
    function ContextRecord(props) {
      const { record, t } = props
      return h(
        'div',
        {
          className: `dsh-cs-context-record${record.isTarget ? ' dsh-cs-context-target' : ' dsh-cs-context-neighbour'}`,
          ...(record.isTarget ? { 'data-conversation-search-target': '' } : {}),
        },
        h(
          'div',
          { className: 'dsh-cs-context-meta' },
          h('span', { className: 'dsh-cs-hit-kind' }, kindLabel(record.type, t)),
          record.isTarget ? h('span', { className: 'dsh-cs-hit-kind' }, t('matchLabel')) : null,
          h('span', { className: 'dsh-cs-session-time' }, formatTime(record.time)),
        ),
        h(HighlightedText, {
          text: record.text,
          ranges: record.ranges,
          prefix: record.prefix,
          suffix: record.suffix,
          className: 'dsh-cs-context-text',
        }),
        record.truncated ? h('div', { className: 'dsh-cs-context-more' }, '…') : null,
      )
    }

    /**
     * Resolve the Session displayed by the main conversation panel.
     * @returns {string | undefined} current Session id.
     */
    function currentSessionId() {
      const nodes = document.querySelectorAll('[data-conversation-session]')
      for (const node of nodes) {
        const id = node.getAttribute('data-conversation-session')
        if (typeof id === 'string' && id !== '' && node.getClientRects().length > 0) return id
      }
      return undefined
    }

    /**
     * Wait for a short interval.
     * @param {number} ms - milliseconds.
     * @returns {Promise<void>} resolved after the delay.
     */
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Ask the browser's built-in text finder to scroll to and select a text run.
     * @param {string} text - exact text to find.
     * @returns {boolean} whether the browser found the text.
     */
    function findTextInPage(text) {
      if (typeof window.find !== 'function') return false
      try {
        return window.find(text, false, false, true, false, true, false)
      } catch {
        return false
      }
    }

    /**
     * Reduce a matched run to one searchable line for the browser finder.
     * @param {unknown} value - matched text.
     * @returns {string | undefined} a line with at least two characters.
     */
    function findableText(value) {
      if (typeof value !== 'string') return undefined
      const line = value
        .split(/\r?\n/u)
        .map((part) => part.trim())
        .find((part) => part.length >= 2)
      return line === undefined ? undefined : line.slice(0, 140)
    }

    /**
     * Collapse whitespace for cross-DOM comparisons.
     * @param {string} value - raw text.
     * @returns {string} normalized text.
     */
    function normalizeSpace(value) {
      return value.replace(/\s+/gu, ' ').trim()
    }

    /**
     * Collect visible text nodes under one root, skipping chrome and form controls.
     * @param {Node} root - search root.
     * @returns {Text[]} visible text nodes in document order.
     */
    function textNodesIn(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement
          if (parent === null) return NodeFilter.FILTER_REJECT
          if (parent.closest('script, style, textarea, [contenteditable="true"], [contenteditable=""], [data-composer-seat], [data-composer-card]')) {
            return NodeFilter.FILTER_REJECT
          }
          if (parent.getClientRects().length === 0) return NodeFilter.FILTER_REJECT
          return node.nodeValue !== null && node.nodeValue.trim() !== ''
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        },
      })
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      return nodes
    }

    /**
     * Build a whitespace-normalized text projection and a map back to DOM positions.
     * @param {Node} root - search root.
     * @returns {{ text: string, map: Array<{ node: Text, offset: number }> }} projection.
     */
    function buildTextIndex(root) {
      const nodes = textNodesIn(root)
      const chars = []
      const map = []
      for (const node of nodes) {
        const value = node.nodeValue ?? ''
        for (let offset = 0; offset < value.length; offset += 1) {
          const char = value[offset]
          if (/\s/u.test(char)) {
            if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
              chars.push(' ')
              map.push({ node, offset })
            }
          } else {
            chars.push(char)
            map.push({ node, offset })
          }
        }
      }
      return { text: chars.join(''), map }
    }

    /**
     * Locate one normalized text run and return a DOM Range for highlighting.
     * @param {Node} root - search root.
     * @param {string} needle - matched text.
     * @returns {Range | null} the first matching range.
     */
    function rangeForText(root, needle) {
      const normalized = normalizeSpace(needle)
      if (normalized === '') return null
      const index = buildTextIndex(root)
      const at = index.text.indexOf(normalized)
      if (at < 0) return null
      const start = index.map[at]
      const end = index.map[at + normalized.length - 1]
      if (start === undefined || end === undefined) return null
      const range = document.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset + 1)
      return range
    }

    /** Remove the previous search highlight. */
    function clearHighlight() {
      try {
        if (typeof CSS !== 'undefined' && CSS.highlights !== undefined) CSS.highlights.delete(HIGHLIGHT_NAME)
      } catch {
        // Unsupported highlight implementations are ignored.
      }
    }

    /**
     * Paint one range with the browser highlight API, falling back to a selection.
     * @param {Range} range - range to paint.
     * @returns {boolean} whether a highlight was applied.
     */
    function highlightRange(range) {
      try {
        if (typeof CSS !== 'undefined' && CSS.highlights !== undefined && typeof Highlight === 'function') {
          CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
          return true
        }
      } catch {
        // Fall through to the selection fallback.
      }
      try {
        const selection = window.getSelection()
        if (selection === null) return false
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      } catch {
        return false
      }
    }

    /**
     * Find the visible conversation scrollport.
     * @returns {HTMLElement | null} scrollport.
     */
    function findScrollport() {
      const ports = [...document.querySelectorAll('[data-conversation-scroll]')]
      return ports.find((port) => port.getClientRects().length > 0) ?? null
    }

    /** Select the Chat view when another conversation view (such as Trajectory) is active. */
    function selectChatView() {
      const tabs = [...document.querySelectorAll('[data-conversation-tabs] [role="tab"]')]
      const chat = tabs[0]
      if (chat !== undefined && chat.getAttribute('aria-selected') !== 'true') chat.click()
    }

    /**
     * Center one range inside the conversation scrollport.
     * @param {Range} range - located range.
     * @param {HTMLElement} port - conversation scrollport.
     */
    function scrollRangeIntoView(range, port) {
      const rect = range.getBoundingClientRect()
      const portRect = port.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const delta = rect.top - portRect.top - portRect.height / 2
      const target = port.scrollTop + delta
      port.scrollTop = Math.max(0, Math.min(port.scrollHeight - port.clientHeight, target))
    }

    /**
     * Wait until the main conversation shows the expected Session.
     * @param {string} sessionId - expected Session id.
     * @returns {Promise<boolean>} whether it became visible in time.
     */
    async function waitForSession(sessionId) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const nodes = document.querySelectorAll('[data-conversation-session]')
        for (const node of nodes) {
          if (node.getAttribute('data-conversation-session') === sessionId && node.getClientRects().length > 0) {
            return true
          }
        }
        await delay(50)
      }
      return false
    }

    /**
     * Load history through the target event, scroll near it, and highlight the
     * matched text. Title hits highlight the conversation header instead.
     * @param {object} ctx - browser plugin context.
     * @param {{ sessionId: string, seq: number, type: string, progress?: number }} detail - target coordinates.
     * @param {string} text - matched text.
     * @returns {Promise<boolean>} whether the text was found and highlighted.
     */
    async function jumpToHit(ctx, detail, text) {
      clearHighlight()
      const sessions = ctx.get('sessions')
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const binding = sessions?.binding(detail.sessionId)
        if (binding !== undefined) {
          try {
            await Promise.race([binding.session.loadThrough(detail.seq), delay(5_000)])
          } catch {
            // Loading history is best-effort; the search below still gets a chance.
          }
          break
        }
        await delay(100)
      }
      if (!(await waitForSession(detail.sessionId))) return false
      await delay(100)

      if (detail.type === 'session/title') {
        const root = document.querySelector('[data-conversation-header], header') ?? document.body
        const range = rangeForText(root, text)
        if (range !== null && highlightRange(range)) return true
        return findTextInPage(text)
      }

      selectChatView()
      await delay(100)
      const port = findScrollport()
      if (port === null) return findTextInPage(text)
      const originalScrollTop = port.scrollTop
      const progress = typeof detail.progress === 'number' ? Math.max(0, Math.min(1, detail.progress)) : 0.5
      const max = Math.max(0, port.scrollHeight - port.clientHeight)
      port.scrollTop = max * progress
      await delay(120)

      let range = rangeForText(port, text)
      if (range !== null) {
        highlightRange(range)
        scrollRangeIntoView(range, port)
        await delay(120)
        const settled = rangeForText(port, text)
        if (settled !== null) highlightRange(settled)
        return true
      }

      const step = Math.max(200, port.clientHeight * 0.8)
      for (const direction of [-1, 1]) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          port.scrollTop = Math.max(0, Math.min(max, port.scrollTop + direction * step))
          await delay(70)
          range = rangeForText(port, text)
          if (range !== null) {
            highlightRange(range)
            scrollRangeIntoView(range, port)
            await delay(120)
            const settled = rangeForText(port, text)
            if (settled !== null) highlightRange(settled)
            return true
          }
        }
      }
      port.scrollTop = originalScrollTop
      return findTextInPage(text)
    }

    /** Frame-wide search dialog. */
    function SearchOverlay(props) {
      const ctx = props.ctx
      const t = useTranslate(ctx, props.t)
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
      const dialogRef = React.useRef(null)
      const inputRef = React.useRef(null)
      const bodyRef = React.useRef(null)
      const previousFocus = React.useRef(null)
      const [hidden, setHidden] = React.useState(false)
      const inDetail = state.detail !== null

      React.useEffect(() => {
        if (!state.open) return undefined
        previousFocus.current = document.activeElement
        const timer = setTimeout(() => {
          const input = inputRef.current
          if (input !== null) {
            input.focus()
            input.select()
          }
        }, 0)
        return () => {
          clearTimeout(timer)
          const previous = previousFocus.current
          if (previous !== null && typeof previous.focus === 'function') previous.focus()
        }
      }, [state.open])

      React.useEffect(() => {
        if (!state.open) return undefined
        const query = state.query.trim()
        if (query === '') {
          store.set({ status: 'idle', error: null, value: null })
          return undefined
        }
        if (state.mode === 'regex') {
          try {
            new RegExp(query, state.caseSensitive ? 'u' : 'iu')
          } catch (error) {
            store.set({
              status: 'error',
              error: {
                code: 'INVALID_REGEX',
                detail: error instanceof Error ? error.message : String(error),
              },
              value: null,
            })
            return undefined
          }
        }

        const controller = new AbortController()
        const timer = setTimeout(async () => {
          store.set({ status: 'loading', error: null, value: null })
          try {
            const response = await fetch(ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                sessionId: state.sessionId,
                scope: state.scope,
                query,
                mode: state.mode,
                caseSensitive: state.caseSensitive,
              }),
              signal: controller.signal,
              credentials: 'same-origin',
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok || payload === null || payload.ok !== true) {
              const failure = new Error(payload?.error?.message ?? `HTTP ${response.status}`)
              failure.code = payload?.error?.code
              failure.detail = payload?.error?.detail
              throw failure
            }
            if (controller.signal.aborted) return
            store.set({ status: 'done', error: null, value: payload.value })
          } catch (error) {
            if (controller.signal.aborted) return
            if (error !== null && typeof error === 'object' && error.name === 'AbortError') return
            store.set({
              status: 'error',
              error:
                error !== null && typeof error === 'object'
                  ? { code: error.code, detail: error.detail, message: error.message }
                  : { message: String(error) },
              value: null,
            })
          }
        }, DEBOUNCE_MS)

        return () => {
          clearTimeout(timer)
          controller.abort()
        }
      }, [
        state.open,
        state.query,
        state.mode,
        state.scope,
        state.caseSensitive,
      ])

      React.useEffect(() => {
        if (!state.open || state.detail === null) return undefined
        const controller = new AbortController()
        store.set({ detailStatus: 'loading', detailError: null, detailValue: null, jumpNote: null })
        ;(async () => {
          try {
            const response = await fetch(CONTEXT_ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                sessionId: state.detail.sessionId,
                seq: state.detail.seq,
                query: state.query,
                mode: state.mode,
                caseSensitive: state.caseSensitive,
              }),
              signal: controller.signal,
              credentials: 'same-origin',
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok || payload === null || payload.ok !== true) {
              const failure = new Error(payload?.error?.message ?? `HTTP ${response.status}`)
              failure.code = payload?.error?.code
              failure.detail = payload?.error?.detail
              throw failure
            }
            if (controller.signal.aborted) return
            store.set({ detailStatus: 'ready', detailError: null, detailValue: payload.value })
          } catch (error) {
            if (controller.signal.aborted) return
            if (error !== null && typeof error === 'object' && error.name === 'AbortError') return
            store.set({
              detailStatus: 'error',
              detailError:
                error !== null && typeof error === 'object'
                  ? { code: error.code, detail: error.detail, message: error.message }
                  : { message: String(error) },
              detailValue: null,
            })
          }
        })()
        return () => controller.abort()
      }, [state.open, state.detail, state.query, state.mode, state.caseSensitive])

      React.useEffect(() => {
        if (!state.open || state.detail === null) return
        dialogRef.current?.focus()
      }, [state.open, state.detail])

      React.useEffect(() => {
        if (state.detailStatus !== 'ready') return
        const target = bodyRef.current?.querySelector('[data-conversation-search-target]')
        target?.scrollIntoView({ block: 'center' })
      }, [state.detailStatus, state.detailValue])

      if (!state.open) return null

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          store.close()
          return
        }
        if (event.key !== 'Tab') return
        const dialog = dialogRef.current
        if (dialog === null) return
        const focusables = dialog.querySelectorAll(
          'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }

      const runJump = async (detail) => {
        const text = findableText(detail.locateText ?? detail.matchText)
        if (text === undefined) {
          store.set({ jumpNote: t('locateFailed') })
          return
        }
        setHidden(true)
        await delay(80)
        let found = false
        try {
          found = await jumpToHit(ctx, detail, text)
        } catch (error) {
          console.error('[conversation-search] failed to locate hit', error)
        }
        setHidden(false)
        if (found) store.close()
        else store.set({ jumpNote: t('locateFailed') })
      }

      const openDetail = (sessionId, hit) => {
        try {
          ctx.uiWorkspace.openSession(sessionId)
        } catch (error) {
          console.error('[conversation-search] failed to open session', error)
        }
        const detail = {
          sessionId: String(sessionId),
          seq: hit.seq,
          type: hit.type,
          matchText: hit.matchText,
          locateText: hit.locateText,
          progress: hit.progress,
        }
        store.set({
          sessionId: String(sessionId),
          detail,
          detailStatus: 'loading',
          detailError: null,
          detailValue: null,
          jumpNote: null,
        })
        void runJump(detail)
      }

      const back = () => {
        clearHighlight()
        store.set({
          detail: null,
          detailStatus: 'idle',
          detailError: null,
          detailValue: null,
          jumpNote: null,
        })
      }

      const locate = () => {
        if (state.detail === null) return
        void runJump({
          ...state.detail,
          matchText: state.detailValue?.matchText ?? state.detail.matchText,
        })
      }

      const openConversation = () => {
        if (state.detail === null) return
        try {
          ctx.uiWorkspace.openSession(state.detail.sessionId)
        } catch (error) {
          console.error('[conversation-search] failed to open session', error)
        }
        store.close()
      }

      const scopeOptions = [
        { value: 'session', label: t('scopeSession') },
        { value: 'workspace', label: t('scopeWorkspace') },
      ]
      const modeOptions = [
        { value: 'fuzzy', label: t('modeFuzzy'), title: t('modeFuzzyTitle') },
        { value: 'literal', label: t('modeLiteral'), title: t('modeLiteralTitle') },
        { value: 'regex', label: t('modeRegex'), title: t('modeRegexTitle') },
      ]

      let body
      if (inDetail) {
        if (state.detailStatus === 'loading') {
          body = h('div', { className: 'dsh-cs-status', role: 'status' }, t('contextLoading'))
        } else if (state.detailStatus === 'error') {
          body = h(
            'div',
            { className: 'dsh-cs-status dsh-cs-error', role: 'status' },
            `${t('contextError')}：${describeError(t, state.detailError)}`,
          )
        } else if (state.detailValue !== null) {
          body = h(
            'div',
            { className: 'dsh-cs-context' },
            state.detailValue.records.map((record, index) =>
              h(ContextRecord, {
                key: `${record.seq}-${record.type}-${index}`,
                record,
                t,
              }),
            ),
          )
        } else {
          body = h('div', { className: 'dsh-cs-status', role: 'status' }, t('contextLoading'))
        }
      } else if (state.status === 'loading') {
        body = h('div', { className: 'dsh-cs-status', role: 'status' }, t('searching'))
      } else if (state.status === 'error') {
        body = h('div', { className: 'dsh-cs-status dsh-cs-error', role: 'status' }, describeError(t, state.error))
      } else if (state.status === 'done' && state.value !== null && state.value.sessions.length > 0) {
        body = h(Results, { value: state.value, t, onOpen: openDetail })
      } else if (state.status === 'done') {
        body = h('div', { className: 'dsh-cs-status', role: 'status' }, t('noResults'))
      } else {
        body = h('div', { className: 'dsh-cs-status', role: 'status' }, t('hint'))
      }

      const footer = inDetail
        ? h('div', { className: 'dsh-cs-foot' }, t('contextNote'))
        : state.value === null
          ? null
          : h(
              'div',
              { className: 'dsh-cs-foot' },
              h('span', null, format(t('results'), {
                count: state.value.totalMatches,
                sessions: state.value.sessions.length,
              })),
              h('span', null, format(t('scanned'), { count: state.value.scannedSessions })),
              h('span', null, `${state.value.elapsedMs} ms`),
              state.value.truncated ? h('span', { className: 'dsh-cs-warn' }, t('truncated')) : null,
            )

      const warning =
        !inDetail && state.value !== null && Array.isArray(state.value.warnings) && state.value.warnings.length > 0
          ? h('div', { className: 'dsh-cs-foot dsh-cs-warn' }, `${t('warnings')}${state.value.warnings[0]}`)
          : null

      const jumpNote =
        inDetail && state.jumpNote !== null
          ? h('div', { className: 'dsh-cs-foot dsh-cs-jump-note' }, state.jumpNote)
          : null

      return h(
        React.Fragment,
        null,
        h('style', { key: 'css' }, CSS),
        h(
          'div',
          {
            key: 'overlay',
            className: 'dsh-cs-overlay',
            style: hidden ? { display: 'none' } : undefined,
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) store.close()
            },
          },
          h(
            'div',
            {
              className: 'dsh-cs-dialog',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': HEADING_ID,
              'data-shortcut-modal': 'conversation-search',
              tabIndex: -1,
              ref: dialogRef,
              onKeyDown,
            },
            h(
              'div',
              { className: 'dsh-cs-head' },
              inDetail
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-cs-back',
                      onClick: back,
                    },
                    `← ${t('back')}`,
                  )
                : null,
              h(
                'h2',
                { id: HEADING_ID, className: 'dsh-cs-heading' },
                inDetail ? state.detailValue?.title || t('detailTitle') : t('title'),
              ),
              inDetail
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-cs-action',
                      disabled: state.detailStatus !== 'ready',
                      title: t('locate'),
                      onClick: locate,
                    },
                    t('locate'),
                  )
                : null,
              inDetail
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-cs-action',
                      title: t('openConversation'),
                      onClick: openConversation,
                    },
                    t('openConversation'),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-cs-close',
                  'aria-label': t('close'),
                  title: t('close'),
                  onClick: () => store.close(),
                },
                '×',
              ),
            ),
            inDetail
              ? null
              : h(
                  'div',
                  { className: 'dsh-cs-search' },
                  h('input', {
                    ref: inputRef,
                    className: 'dsh-cs-input',
                    type: 'search',
                    value: state.query,
                    placeholder: t('placeholder'),
                    'aria-label': t('placeholder'),
                    autoComplete: 'off',
                    spellCheck: false,
                    onChange: (event) => store.set({ query: event.target.value }),
                  }),
                  h(
                    'div',
                    { className: 'dsh-cs-seg', role: 'group', 'aria-label': t('modeLabel') },
                    modeOptions.map((option) =>
                      h(
                        'button',
                        {
                          key: option.value,
                          type: 'button',
                          'aria-pressed': state.mode === option.value,
                          title: option.title,
                          onClick: () => store.set({ mode: option.value }),
                        },
                        option.label,
                      ),
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-cs-toggle',
                      'aria-pressed': state.caseSensitive,
                      'aria-label': t('caseSensitive'),
                      title: t('caseSensitive'),
                      onClick: () => store.set({ caseSensitive: !state.caseSensitive }),
                    },
                    'Aa',
                  ),
                ),
            inDetail
              ? null
              : h(
                  'div',
                  { className: 'dsh-cs-scope' },
                  h('span', null, t('scopeLabel')),
                  h(
                    'div',
                    { className: 'dsh-cs-seg', role: 'group', 'aria-label': t('scopeLabel') },
                    scopeOptions.map((option) =>
                      h(
                        'button',
                        {
                          key: option.value,
                          type: 'button',
                          'aria-pressed': state.scope === option.value,
                          onClick: () => store.set({ scope: option.value }),
                        },
                        option.label,
                      ),
                    ),
                  ),
                ),
            h('div', { className: 'dsh-cs-body', ref: bodyRef }, body),
            warning,
            jumpNote,
            footer,
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: EN, zh: ZH }),
          'conversation-search: locale',
        )

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'conversation-search', order: 10, locale: NS },
            (props) => h(SearchButton, { ...props, ctx }),
          ),
        )

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'conversation-search', order: 2, locale: NS },
            (props) => h(SearchButton, { ...props, ctx, variant: 'dock' }),
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'conversation-search', order: 40, locale: NS },
            (props) => h(SearchOverlay, { ...props, ctx }),
          ),
        )

        ctx.inject(['shortcuts'], (scope) => {
          scope.effect(() => {
            const t = ctx.locale.bind(NS)
            const candidates = [
              { code: 'KeyK', modifiers: ['primary', 'shift'] },
              { code: 'KeyJ', modifiers: ['primary', 'shift'] },
              { code: 'KeyK', modifiers: ['primary', 'alt'] },
              { code: 'KeyJ', modifiers: ['primary', 'alt'] },
            ]
            let disposeCommand
            let lastError
            for (const candidate of candidates) {
              try {
                disposeCommand = scope.shortcuts.register({
                  id: SHORTCUT_ID,
                  label: () => t('title'),
                  aliases: ['conversation search', 'search conversations', '对话检索', '搜索历史'],
                  defaults: {
                    'desktop:macos': candidate,
                    'desktop:windows': candidate,
                    'desktop:linux': candidate,
                    'web:macos': candidate,
                    'web:windows': candidate,
                  },
                  regions: ['page', 'editable', 'terminal'],
                  modals: ['conversation-search'],
                  resolve: ({ modal }) => {
                    if (modal !== null && modal !== 'conversation-search') {
                      return { status: 'blocked', reason: 'modal' }
                    }
                    const sessionId = currentSessionId()
                    if (sessionId === undefined) return { status: 'pass' }
                    if (modal === 'conversation-search') {
                      return { status: 'handled', run: () => store.close() }
                    }
                    return { status: 'handled', run: () => store.open(sessionId) }
                  },
                })
                break
              } catch (error) {
                lastError = error
              }
            }
            if (disposeCommand === undefined) {
              console.warn('[conversation-search] shortcut unavailable:', lastError)
              return () => {}
            }
            const readKeys = () => {
              const row = scope.shortcuts.catalog.getSnapshot().find((entry) => entry.id === SHORTCUT_ID)
              const list = Array.isArray(row?.keys) ? row.keys : []
              const separator = scope.shortcuts.platform === 'linux' ? ' ' : ''
              shortcutKeysStore.set(list.length === 0 ? null : list.join(separator))
            }
            readKeys()
            const off = scope.shortcuts.catalog.subscribe(readKeys)
            return () => {
              off()
              shortcutKeysStore.set(null)
              disposeCommand()
            }
          }, 'conversation-search: shortcut')
        })
      },
    }
  },
})
