# 对话检索（Conversation Search）

在当前对话或当前工作区的所有对话中检索 **会话名称、用户输入内容、模型回答正文** 三类文字，支持**模糊**、**正则**和**关键词**三种匹配方式。思考、工具调用、工具结果、系统提示、压缩摘要等其他内容一律不检索。

![使用位置示意图](docs/usage-guide.svg)

> 上图为示意图，不是运行界面的截图。

## 入口与快捷键

- **输入框下方的「检索」胶囊**（和「活动」「用量」在同一行）。
- 对话输入框左侧工具栏中的放大镜按钮。
- 全局命令：默认 **`⌘⇧K`**（macOS）或 **`Ctrl+Shift+K`**（Windows/Linux）。它通过 Harness 快捷键服务注册，会出现在 **设置 → 快捷键** 中，可自行改键或解绑；默认组合冲突时会自动尝试 `⌘⇧J`、`⌥⌘K` 等备用组合，全部冲突时按钮仍可用。

旧版 `⌘⇧F` 已移除，因为它只是页面级监听，macOS 桌面端可能被原生菜单拦截。

## 使用

1. 打开任意一个已有消息的对话。
2. 点击「检索」胶囊，或按当前快捷键。
3. 输入检索内容（至少一个非空白字符），自动搜索。
4. 选择范围：**当前对话**（默认）或 **当前工作区**。只有切到“当前工作区”才会跨对话检索。
5. 选择方式：
   - **模糊**：按字符顺序匹配，例如 `dsrch` 可以匹配 `deep search`；多个空格分隔的词都需要出现。
   - **正则**：使用 JavaScript 正则表达式语法，例如 `错误\s*码\s*\d+`。
   - **关键词**：字面量子串匹配，默认忽略大小写，`Aa` 可切换。
6. **点击任意结果会自动完成定位**：
   - 切换到对应会话并切回 Chat 视图；
   - 通过 `loadThrough(seq)` 加载到命中事件所在位置；
   - 按事件在会话中的大致进度滚动，并在附近逐步扫描 Chat 文本；
   - 找到后用浏览器 Highlight API 给命中文本加高亮，并把它滚动到视口中央。
   - 如果命中在折叠过程组、虚拟化未挂载的行或尚未加载的旧历史里，自动定位可能失败；此时面板会显示「命中位置」上下文视图，目标事件及前后各 2 条记录会高亮，作为精确位置的兜底。
7. 「命中位置」视图中的 **「在对话中定位」** 可以再次尝试自动定位；**「打开对话」** 只切换会话。

## 检索范围

只读取并索引以下事件：

- `session/title` —— 会话名称；
- `user/message` —— 用户输入（跳过 `compact-checkpoint` 等非用户来源的 user 消息）；
- `assistant/message` —— 只取 `text` 块，即模型回答正文。

**不检索**：思考/reasoning、工具调用参数、工具结果、系统提示、开发者消息、待办、回合错误、压缩摘要、目标/工作流/子代理记录、附件二进制、流式 `assistant/attempt` 增量。

## 结果与上限

- 结果按对话分组，显示标题、最后活动时间、命中类型（你/助手/标题）和高亮片段。默认只搜当前对话，避免在 A 会话中意外看到 B 会话的内容。
- 单次检索最多扫描 60 个对话、返回 80 条命中、每个对话最多 5 条；状态栏会标明结果是否被截断。
- 单条文档最多检查前 240,000 个 UTF-16 代码单元。
- 命中上下文中，目标记录最多显示 4,000 字符，相邻记录最多 2,000 字符。
- 正则表达式最长 400 个字符；复杂或灾难性回溯的正则仍可能让 Host 卡顿。
- 工作区范围扫描工作目录相同的普通对话，跳过子代理会话；已归档的对话仍会被检索到。

## 实现

- Host 端 [index.js](index.js) 注册两个认证路由：
  - `POST /api/conversation.search`：`listSessions()` + `readSession()`，只解析 title、用户输入、助手正文三类文本；
  - `POST /api/conversation.context`：`readEvent()` 读取目标事件前后各 2 条，返回带高亮范围的上下文。
- Web 端 [client.js](client.js) 在 `conversation.composer.dock` 注册「检索」胶囊、在 `conversation.input.left` 注册放大镜、在 `shell.overlay` 注册搜索/命中位置面板；快捷键通过 `ctx.shortcuts.register()` 注册为可编辑命令。
- 自动定位使用：会话切换 + `loadThrough(seq)` + Chat 文本索引扫描 + `CSS.highlights` 高亮；`window.find` 仅作后备。
- UI 文本通过 `ctx.locale` 的 `conversationSearch` 命名空间提供（zh/en），颜色使用 `--dsw-alias-*` 主题令牌。

## 验证状态

- Host 检索核心的 Node 单元测试 **10/10 通过**：范围、大小写、模糊、正则、关键词、只索引 title/用户/助手正文、上下文、错误路径与路由 JSON 信封。
- 已通过 `plugin_manager` 安装到 `desktop` profile；插件行 `include:conversation-search` 为 `fiberPhase: active`。
- Client 槽位实测已注册且 active：`conversation.composer.dock`、`conversation.input.left`、`shell.overlay`。
- 未在本环境取得浏览器控制权，自动滚动/高亮的实际效果、快捷键按键与设置页条目仍需人工在 Web UI 中确认；带 Cookie 的 Host 路由调用也未由本环境直接执行。

## 安装

在 Harness 的「插件」页选择安装 bundle，输入 `ds-conversation-search`；安装后刷新页面或重启 Harness。

本地工作区里的 `@local/conversation-search` 是开发时的 link 版本，与 npm 包不是同一个包名。**不要同时启用两者**，否则两个客户端模块会注册相同的槽位 id。

## 卸载

在「插件」设置中关闭或移除 `ds-conversation-search` 即可；Host 路由、Client 槽位和快捷键命令都会随插件生命周期一起撤销。
