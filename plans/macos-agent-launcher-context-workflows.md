# Custom Agents 与 Context Workflows

日期：2026-09-06。按用户提供的 UI 参考重组设置页面。参考图片只用于布局，不复制其中的系统提示内容或运行参数。

## 页面与对象

- **Settings → Custom Agents**：左侧列出现有 Agent 名称和类型，右侧编辑所选 Agent 的配置；`+` 打开空白草稿，保存后才加入列表。编辑已有 Agent 保留 ID；不创建聊天、不修改旧聊天快照。支持名称、描述，以及对应 Runtime 现有接入能力允许的配置。
- **Settings → Context Workflows**：独立的左侧列表与右侧编辑器。每条 Workflow 保存上下文输入（截图／选中文本）、Agent、任务提示、可选全局快捷键和启用状态。配置保存与实际执行分离。
- **Settings → Connections**：保留手动连接管理与手动开启聊天入口。Workflow 不存凭证，外部 Agent 仍引用现有命名连接。
- **Context Workflows 运行页**：主导航中的独立页面，列出现有 Workflow；Open in chat 只准备聊天草稿，不提交。设置页只负责配置。
- **聊天页**：手动选择 Agent、添加截图或文本上下文；Runtime / Provider / Model 在聊天页展示。选 Agent 立即预填配置，发送时使用当前聊天值，修改不会写回保存的 Agent。Native 的 Provider / Model 可修改，Hermes 和 OpenCode 暂时只读。切换 Runtime 创建新聊天，避免串入旧外部 session。

选中文本通过 macOS `AXSelectedText` 获取，读取过程不使用剪贴板、不记录文本日志。不支持该属性或没有选择时打开空预览，可手动粘贴。通过 Workflows 运行页打开预览时，前台通常已经是 Summon；跨应用选区应在源应用中按 Workflow 快捷键触发。

## 迁移与边界

- 首次创建 `context-workflows.json` 时，将旧 `screenshot-action.json` 的快捷键和默认 Agent 导入 Screenshot Ask；旧文件保留。后续以 Workflow 文件为准，不重复导入。
- 每条 Workflow 独立注册快捷键；保存冲突时保留原设置；磁盘写入失败时回滚新快捷键；禁用或删除只注销对应快捷键。
- 预览保留触发时的 Workflow 名称、Agent 和提示词。已有待发送上下文或进行中任务时，重复触发恢复该任务，不覆盖上下文或重复提交。
- 所有输入均先预览。本次没有新增多步编排、自动发送、多上下文组合或外部 Runtime 原生 Agent 配置文件编辑。
- Hermes 的工作目录仍由自身/Profile 管理。Native 和外部 Runtime 的可配置字段遵循各自现有能力；参考图中的全部模型参数不代表本次均已支持。

## 验证

- `npm run lint`：ESLint、TypeScript、CSS 通过。
- 13 个相关测试文件，91 项测试通过；覆盖 Agent 列表编辑／新增草稿／保存、Workflow 选区与 Agent 配置、迁移、快捷键冲突和磁盘失败回滚、选中文本预览、截图与 Runtime 聊天回归。
- Computer Use：Custom Agents 左右栏渲染正常；新建 UI Workflow Test 后总数从 2 变为 3，删除测试 Agent 后恢复为 2，原有 Hermes Vision 和 OpenCode Plan 保留。
- Computer Use：Context Workflows 显示迁移后的 Screenshot Ask，保留 Command+Shift+2 与 Hermes Vision。另建 Selected Text Ask，选择文本输入、Hermes Vision 和任务指令，保存后出现在列表。测试用 Command+Shift+7 已清除，供用户自行设置。
- Computer Use：通过文本预览输入可控测试 `12 + 9` 后，Hermes 回答 `21`，session 为 `run_e86aa04f2d464c9f9045f88c06495603`。这是手动填写预览的验证，不能当作跨应用选区自动读取的证据。
- 自动化按键未触发 macOS 全局快捷键；真实跨应用选区及物理快捷键唤起仍待用户验收。无选区时曾显示 AppleScript 的 `missing value`，已在读取端改为空值处理。
- 最后重启实测确认两条 Workflow 与 Agent 设置保留、测试快捷键已清除，无选区时显示空白文本框与可粘贴提示，不再出现 `missing value`。

开发记录：`/tmp/summon-workflows-lint.log`、`/tmp/summon-workflows-tests.log`。未运行生产构建或 E2E 测试。本增量不表示原总计划的所有 P1/P2 项目完成。

## 用户验收

1. Custom Agents 左侧选择现有 Agent，确认右侧配置对应；点 `+` 填写一个新 Agent，保存并确认出现在左栏。
2. Context Workflows 新建一条 Workflow，选择上下文输入、Agent、任务提示和自己的快捷键，保存。
3. 在其他应用框选文本或触发截图，按该快捷键；确认浮窗中的上下文、默认 Agent 和任务提示，再发送与追问。

## 聊天预填增量（同日）

- Workflow 不再是聊天工具栏里的运行下拉框；独立运行页与 Settings 编辑页分开。
- 手动添加上下文不要求先保存 Agent，也不读取默认截图 Workflow；可向当前聊天继续添加上下文。
- Native 模型手动修改后，发送不会重新套用 Agent 模板。重截截图保留手动修改的任务和聊天配置。
- 回归验证：ESLint、TypeScript、CSS 与 git diff --check 通过；9 个相关单测文件共 74 项通过。涵盖 Workflow 预填不发送、Native 模型覆盖、无 Agent 手动文本、外部下拉框只读、截图重截、Runtime 聊天及快捷键回归。
- Computer Use：独立页面显示 Screenshot Ask、Selected Text Ask；打开后预填 Hermes Vision，不自动发送。Hermes / OpenCode Provider、Model 置灰；切换 Native 后可编辑且任务提示仍保留。新聊天未选 Agent 时 Add text context 可打开空白上下文编辑器。
- 此轮未新增真实模型请求；发送路由由单测验证。跨应用选区及物理全局快捷键仍按上一增量待用户验收。
- 开发验证记录：/tmp/summon-chat-prefill-lint.log、/tmp/summon-chat-prefill-tests.log、/tmp/summon-chat-prefill-dev.log。

验收重点：独立 Workflows 页面打开聊天；确认预填后可修改 Runtime；Native 可手动修改 Provider / Model；普通 Chat 可直接添加上下文。
