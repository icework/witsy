# Witsy macOS Agent Launcher 执行规格

日期：2026-09-06。产品名：Summon（召见）。状态：需求已确认，待实施；本文不表示任何新功能已经实现或通过测试。

## 1. 产品目标与优先级

基于现有 Witsy，提供 Main Chat、全局 Action、Quick Chat、多个独立 Agent Runtime，以及自动保存到用户文件系统的开放聊天记录。

用户确认的最高优先级：

1. 区域截图，向 Hermes 或 Witsy Native Chat 提问，浮窗查看并继续对话。
2. 把截图、选区、剪贴板或文件作为上下文，让 Hermes/OpenCode 快速执行任务。
3. 保留普通多 Provider 聊天、现有 Witsy 功能和本地可读历史。

首版面向用户自己的 macOS 环境，无硬期限。Hermes、OpenCode 都进入首版，先验证 Hermes。支持选择多个 Agent，不新增跨 Runtime 多 Agent 编排；Runtime 内置委派能力保留。

本文记录用户对上一轮 56 个边界问题的确认：“Incognito 只要 Witsy 不保存；其他默认；优先截图与上下文任务；无硬期限；开发者使用 Computer Use 实测”。未明确的实现参数由开发者选择并记录，不能据此静默扩大产品范围。

## 2. 开发与验证授权

- 用户本次明确允许运行开发应用，并通过 Computer Use 验证功能。这覆盖根 AGENTS.md 中禁止运行应用的规则，适用于本项目本次功能开发。
- 允许 `npm start` 及其必需的开发编译、热更新。仍不执行独立生产构建、打包、发布或自动化 E2E 测试。
- 后续授权（同日）：用户要求为新应用命名、用 imagegen 制作图标并“编译运行”。本次品牌预览允许必要的编译与运行；不代表发布授权，也不代表下述 Runtime 功能已完成。
- 每个实现增量先执行 `npm run lint`，再执行 `npm run test:ai -- <相关测试路径>`；界面或 macOS 集成功能随后用 Computer Use 实测。
- 开发者负责实际功能验证，不把全部验证转交用户。系统权限或服务认证确需用户操作时，只请求该必要操作并说明阻塞点。
- 使用隔离 WITSY_HOME、测试聊天目录和可控测试文件；不覆盖现有配置、聊天和项目文件。先核实隔离开关的实际作用，再启动测试实例。
- 修改代码时遵守原有 IPC、事件、Vue、CSS 变量、英文新增翻译和测试约定。
- 本文是实施规格；本轮交付文档，代码实现状态从零开始。

## 3. 已确认的产品边界

| 原问题 | 决策 |
| --- | --- |
| 1–4 | 个人自用优先；两个 Runtime 都要；不新增协作编排；可重组 UI，保留现有功能 |
| 5–8 | 架构支持本机与远程、多个命名连接；首版本机优先；连接已有服务；故障提示重试，不自动换 Runtime |
| 9–10 | 外部 Runtime 管理自己的认证；普通 Provider 保留 Witsy 认证；OpenCode Go 首版经 OpenCode 使用 |
| 11–13 | Agent 默认绑定 Runtime；外部配置先继承和展示；Experts 可转换；工作流 Agent 独立保留 |
| 14–16 | Native 设置系统提示；外部默认追加指令；会话保存配置快照；旧会话主动应用 Agent 更新 |
| 17–18 | Agent 可设工作目录，新会话可覆盖且始终可见；展示 Runtime 原生权限选项，不默认自动批准 |
| 19–21 | 默认 Agent 可配置；模型按能力切换；Runtime/Profile/OpenCode Agent/目录变化创建分支；默认带可读历史，超限提示摘要 |
| 22–26 | Quick Chat 恢复上次会话，Action 可指定新建；与 Main Chat 共享；隐藏继续执行；后台完成通知可关闭；首版不导入外部会话 |
| 27–28 | 快捷键绑定可复用 Action；首版不做任意多步工作流编辑器 |
| 29–31 | 新 Action 默认不采集上下文；无选区打开输入；每个 Action 可选预览或直接发送 |
| 32–33 | 不同会话可并发，同会话排队；重复快捷键恢复进行中的任务；提供常用预置 Action |
| 34–36 | 不支持的 App 有明确回退；默认点击回填；自动回填需确认目标有效；采集后恢复剪贴板 |
| 37–40 | 区域与当前显示器截图；支持预览、重截和多图；首版图片、文本/代码、PDF；不兼容和超限发送前提示 |
| 41–45 | 按本次修改：Incognito 仅保证 Witsy 不持久保存；外部 Runtime 的会话、Memory、日志和工具产物遵循其原有行为；隐藏保留，关闭会话/退出销毁本地临时状态；可主动转普通会话 |
| 46–48 | 默认 ~/Documents/Witsy/Conversations，可改目录；不默认绑定 Vault；Markdown 阅读副本加结构化记录；首版无外部编辑反向同步 |
| 49–50 | 工具摘要进入 Markdown，详细数据按大小分文件；附件复制归档，超大附件提示 |
| 51–53 | 备份后迁移现有历史；删除先入本地回收区，远端删除单独选择；首版提供可读文件，不自动索引或 Git 提交 |
| 54–56 | 截图提问及上下文任务优先；无期限；开发者 Computer Use 实测 |

实现默认：翻译目标语言为简体中文，可在 Action 中修改；这是开发默认值，不是额外用户要求。

## 4. 核心对象与职责

### 4.1 分离概念

- Provider：模型推理来源，如 OpenRouter、Ollama、OpenAI-compatible API。
- Runtime：执行、会话、工具和权限所属的系统：Witsy Native、Hermes、OpenCode。
- Chat Agent：用户保存的执行预设。代码使用 ChatAgent 等独立名称，避免改变现有工作流 Agent 语义。
- Action：输入采集、Agent 选择、任务提示、会话策略和输出行为；可由快捷键、菜单、命令面板调用。
- Conversation：Witsy 会话身份及本地记录，关联 Runtime session。
- Run：一次提交及其事件、审批、取消、完成状态。

### 4.2 建议数据契约

下列是必须覆盖的字段，具体 TypeScript 声明在第一阶段落地；所有持久对象包含 schemaVersion。

| 对象 | 必需字段与含义 |
| --- | --- |
| RuntimeConnection | id、kind、name、endpoint、credentialRef、enabled、服务版本与能力缓存；凭证不进入聊天文件 |
| ChatAgent | id、name、runtimeConnectionId、externalAgentRef/profile、providerId/modelId、instructions、instructionsMode、workingDirectory、contextDefaults、原生工具/权限配置或外部继承说明 |
| Action | id、name、enabled、shortcut、agentId、overrides、contextPolicy、promptTemplate、sendMode、conversationPolicy、resultPolicy、incognito、notifyOnComplete |
| Conversation | id、parentId、title、timestamps、agentSnapshot、effectiveConfig、runtimeBinding、messages、attachmentRefs；普通会话才持久化 |
| RuntimeBinding | connectionId、profile/externalAgentRef、workingDirectory、sessionId、最近可恢复事件游标；不把本机文件路径当远端可访问路径 |
| ContextItem | id、kind(selection/clipboard/screenshot/file)、mimeType、来源信息、采集时间、内存数据或受管附件引用 |
| Run | id、conversationId、runtimeRunId、submissionId、状态、事件游标、待处理权限；明确 terminal 状态与 stopping |
| RuntimeCapabilities | 模型枚举、图片/文件、续聊、取消、权限响应、指令覆盖、事件重放等逐项能力，不支持项在 UI 禁用并解释 |

配置解析顺序：本次显式选择 > 已有会话配置 > Action 覆盖 > Agent 默认 > Runtime 默认。Action 的覆盖用于创建会话；恢复旧会话时不会悄悄覆盖旧配置。若 Action 明确要求不同 Runtime/Profile/目录，则新建分支。

普通会话保存有效配置快照和变更记录；模型展示以服务实际返回为准，不仅展示用户请求值。追加指令与 Action 任务正文分别传递，不能把选区内容拼成系统指令。

### 4.3 Runtime 适配边界

统一契约至少包含：健康/版本检查、能力发现、列出 Agent/Profile 和模型、创建/恢复会话、提交输入、订阅事件、取消、回复权限请求、读取执行结果；删除外部会话为可选能力。

统一事件至少包含：started、textDelta、toolStarted、toolResult、permissionRequested、usage、completed、failed、cancelled。每个事件携带 connection/conversation/run 身份，避免多会话串流。事件有稳定 ID 时去重；重连能力不足时读取状态/结果，绝不以重发任务代替恢复。

外部 Runtime 自己执行 Tools/Skills/MCP，Witsy 展示和转发审批，不重复执行同一工具。Native 复用现有 LLM/Plugin/MCP/Skills 路径。

连接、凭证和外部会话协调由主进程负责。Native 现有执行路径先包装，不立即整体迁移；运行所有者不得是会隐藏/销毁的 Quick Chat 组件，需明确稳定执行宿主以支持隐藏后继续和多窗口订阅。

参考官方协议入口（实现前以实际安装版本能力和 schema 复核）：

- Hermes：https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- OpenCode：https://opencode.ai/docs/server/
- OpenCode Provider：https://opencode.ai/docs/providers/

协议探测必须验证 Profile 认证、模型选择实际生效、图片传递、权限等待、取消、恢复与附件传输。不假定兼容聊天端点包含全部原生能力。

## 5. 用户流程与状态规则

### 5.1 截图提问（最高优先级）

1. 用户绑定 Screenshot Ask Hermes 或 Screenshot Ask Native。
2. 记录来源 App/显示器；必要时采集选区；隐藏可能遮挡的 Witsy 窗口，再进入区域选取。
3. 取消截图即结束本次 Action，不发送、不创建空历史。
4. 预览截图和任务输入；Action 开启直接发送时，使用已配置提示词。
5. 验证目标 Agent/模型图片能力，传递真实图片内容；远端不能只收到本机路径。
6. Quick Chat 展示流式文字、工具进度、权限请求、停止按钮；允许多图和追问。
7. 普通会话自动归档；Incognito 不进入持久化存储。

预置 Screenshot Ask 提示要求解释/回答截图内容，不擅自修改文件；Context Task Action 的提示要求执行用户明确指定的任务。两者共用上下文管线。

### 5.2 根据上下文执行任务

采集选区/截图/文件 → 展示任务和工作目录 → 提交 Hermes/OpenCode → 展示工具执行与原生审批 → 查看结果或继续会话。没有选区时进入输入框，不自动读取剪贴板。

### 5.3 Quick Chat 与并发

- 普通唤起恢复上次 Quick Chat；新建按钮和 Action 的 new 策略创建新会话。
- 同一会话只允许一个运行中的提交；后续输入排队，可取消尚未执行的项。
- 不同会话并发受 Runtime 能力和服务限制约束；达到上限显示排队状态。
- 同一 Action 已运行时再次按快捷键，恢复其浮窗，不重复采集或执行；用户仍可显式新建。
- 隐藏浮窗不取消；明确停止进入 stopping，服务确认后 cancelled。
- Main Chat 与 Quick Chat 共享同一会话数据源和执行订阅，不能各自产生一次请求。
- 后台完成通知只包含必要标题/状态；Incognito 使用通用通知文案，不泄露正文。
- 服务离线或断线显示真实状态；无可靠恢复机制时标记执行状态未知，提供检查/手动重试，不自动重复副作用。

### 5.4 回填、剪贴板及快捷键

- 回填默认由用户点击 Copy、Replace、Insert；自动回填由 Action 单独启用。
- 仅在来源目标仍有效时自动回填；App、窗口或可验证的目标位置变化则回退 Copy。无法验证时不自动粘贴。
- 采集时临时改写的剪贴板应恢复；若期间用户主动更新剪贴板，不覆盖用户的新内容。
- 快捷键可增删、启用、停用；检查与现有 Witsy 入口冲突、系统注册失败及快捷键修改后的旧绑定清理。
- 首版新 Action 使用普通组合键；现有 modifier-only 等原生快捷键保持原行为，不扩展新的手势编辑器。
- 首版截图支持区域与当前显示器；当前窗口/全部显示器、标注、打码后置。

## 6. Incognito：仅 Witsy 不保存

产品说明：此会话不会保存在 Witsy 中；所选 Runtime、模型服务及工具可能保留数据。所有 Runtime 都可选，不实现严格无痕能力门槛或自动禁止 Memory。

实现必须保证：

- 不写聊天历史、最近列表、搜索索引、Markdown/JSON/event 归档、备份或自动恢复文件。
- 正文、截图、附件优先内存保存；Witsy 控制的日志、错误上报和缓存不得持久记录会话内容。
- 必须采用临时文件的 API 应在实施前审查；不能把“退出后删除”当作“从未保存”。优先改为内存传输；确实无法避免时应明确限制，不静默违背本地不保存目标。
- 隐藏期间保留内存会话；明确关闭时终止/脱离运行并释放本地数据，退出应用后不恢复。外部执行若无法取消，需要显示结果并说明仍可能运行。
- 用户主动保存为普通会话时才创建目录、归档附件并进入最近列表。
- 用户主动 Copy 或要求工具生成文件属于明确产物操作，不视为 Witsy 自动保存历史。
- 不尝试删除 Runtime Memory，也不保证 Runtime/Provider 无保留。系统交换内存等操作系统行为不属于应用级保证。

## 7. 本地会话记录

默认根目录：`~/Documents/Witsy/Conversations`，用户可设置。多 workspace 通过 metadata 和稳定 workspace ID 隔离，切换 workspace 不泄露或混合会话。

```text
Conversations/
  2026-09-06_<uuid>/
    conversation.md
    conversation.json
    events.jsonl
    attachments/
    tool-results/
  .trash/
```

- conversation.json 是本地完整记录的主版本；Markdown 是自动生成、可独立阅读的副本。外部 Runtime 保留其执行状态，本地文件不承诺完整重建 Runtime 内部状态。
- Markdown 包含标题、UUID、workspace、时间、Agent、Runtime、Provider/Model、会话分支关系、用户/助手正文、工具摘要、相对附件链接。
- 结构化文件包含消息 ID、配置快照、外部 session/run 映射、工具参数与结果；大结果独立文件引用。只记录服务实际提供的信息。
- 附件复制到会话目录，用稳定 ID/安全文件名，保留可读原名 metadata；不依赖原绝对路径。用户选择的普通文件保持原件不变。
- 图片、文本/代码和 PDF 为首版输入；Native 的解析方式及外部附件能力逐项验证。大小/数量限制在 UI 明示，不静默截断。
- 原子写入 JSON，单会话写入队列；普通会话流式期间节流 checkpoint，回合终结时 flush。写入失败保留内存并提示重试，不显示虚假“已保存”。
- JSON 提交后再生成 Markdown；中断后可重建副本及索引。events 使用稳定事件 ID，容忍尾部不完整记录，避免重复导出。
- 外部修改 Markdown 不同步回会话；检测到副本被改动时先保留冲突副本再重新生成，避免静默覆盖外部编辑。
- 删除移到 .trash，默认搜索/最近列表和文档化的索引入口排除回收区。永久删除与远端删除是独立操作；回收区仍然是本地可读数据。
- 不做自动 Miyo/Hermes 索引、Vault 写入或 Git 提交；文档给出如何读取会话根目录。

迁移：备份旧 history.json 和附件 → 按原 UUID 逐会话转换 → 比对数量、消息、附件引用 → 写入可恢复迁移状态 → 切换新读写路径。迁移须幂等；失败不覆盖旧历史。回滚只恢复原记录和入口，不把新格式会话默默丢弃。

## 8. 仓库改动范围

以下“新增”是建议路径，按实际目录约定实施；现有模块先复用再增量改造。

| 模块 | 现有入口/建议新增 | 工作 |
| --- | --- | --- |
| 类型与配置 | src/types/config.ts、index.ts；新增 runtime.ts、chat_agent.ts、action.ts | 独立聊天 Agent、版本化配置、能力与事件 |
| 会话模型 | src/models/chat.ts、message/attachment 相关模型 | 配置快照、Runtime 绑定、上下文与分支 |
| Runtime | 新增 src/main/runtimes/；src/renderer/services/llms/ | 外部 adapter、Native wrapper、稳定执行宿主 |
| IPC | src/ipc_consts.ts、src/main/ipc.ts、src/preload.ts、src/types/index.ts | 类型化命令与事件；凭证留主进程 |
| Action 与捕获 | src/main/shortcuts.ts、keymonitor.ts、automations/、computer.ts | 动态 Action、上下文快照、截图与回填 |
| 界面 | src/main/windows/anywhere.ts、src/renderer/services/prompt.ts；新增对应设置与选择器 | Quick/Main 共享会话，Agent/模型/目录/审批 |
| 存储 | src/main/history.ts、workspace.ts、src/renderer/services/store.ts；新增 conversation repository | 新格式、迁移、写入队列、隐私持久化门禁 |
| 兼容 | src/types/agents.ts、src/models/expert.ts、现有 agent/ | 保留工作流 Agent，显式转换 Expert |
| 测试 | tests/unit/、tests/mocks/window.ts | adapter、生命周期、存储及用户交互测试 |

## 9. 分阶段执行任务

每阶段提交小增量并记录检查结果；阶段完成以验收证据为准，不以界面已有按钮为准。

### P0：协议和 macOS 验证底座

- [ ] 确认开发数据隔离、当前启动路径、现有聊天/截图/快捷键/Temporary 行为。
- [ ] 记录实际 Hermes/OpenCode 版本、健康、认证与能力；不打印凭证。
- [ ] Hermes 验证文字、图片、Profile、实际模型、工具事件、审批、取消、续聊。
- [ ] OpenCode 验证 Agent/模型/目录、文件上下文、执行、审批、取消、续聊。
- [ ] 记录不支持能力和可接受回退；无法实现的首版关键要求不能标完成。
- [ ] 建立 Computer Use 实测记录模板和可控测试素材。

出口：两个外部 Runtime 的核心执行链证据齐全；实际协议决定 adapter 类型细节。

### P1：统一对象、执行和存储基础

- [ ] 实现 ChatAgent、RuntimeConnection、Conversation/Run 契约及配置迁移。
- [ ] 包装 Native，增加 Hermes/OpenCode adapter 和能力过滤。
- [ ] 实现运行状态机、事件隔离/去重、排队、取消与权限回复。
- [ ] 实现普通会话文件存储与 Incognito 内存门禁；此阶段仅用隔离数据验证迁移。
- [ ] Main Chat 可选择 Agent/模型，展示实际生效配置和工作目录。

出口：Native/Hermes/OpenCode 均可在 Main Chat 完成多轮任务；普通会话可独立读取；临时会话无 Witsy 持久内容。

### P2：最高优先级截图闭环

- [ ] 抽取统一 Context 采集，处理来源、截图取消、预览和图片能力。
- [ ] Quick Chat 使用共享会话和稳定执行宿主，支持隐藏后继续与打开主窗口。
- [ ] 实现动态 Action/快捷键及冲突处理。
- [ ] 预置 Screenshot Ask Hermes、Screenshot Ask Native、Context Task Hermes/OpenCode。
- [ ] 实测截图 → 提问 → 流式/工具 → 追问 → 归档/Incognito 的完整流程。

出口：用户主要日常路径可用；直接发送只在 Action 明确配置时生效。

### P3：管理界面和选区效率

- [ ] 完成连接、Agent、Action 的增删改、启停和默认值设置。
- [ ] 实现外部配置继承展示、原生配置、Experts 显式转换。
- [ ] 补齐 Ask/Explain/Translate/Rewrite/Summarize、自定义任务。
- [ ] 实现 Copy/Replace/Insert、目标有效性检查和 Clipboard 恢复。
- [ ] 实现分支、配置更新、后台通知、保存临时会话为普通会话。

出口：全部首版配置均有可操作 UI，无需编辑内部 JSON 完成日常操作。

### P4：迁移、恢复与首版验收

- [ ] 完成异常退出、断网重连、磁盘失败、重复触发和多窗口并发验证。
- [ ] 完成旧历史迁移 dry-run 报告与备份，再执行实际迁移并验证。
- [ ] 覆盖既有 Main Chat、Prompt Anywhere、AI Commands、Experts、工作流 Agent、MCP/Plugins/Skills 的相关回归。
- [ ] 完成 Computer Use 验收矩阵、缺陷修复和使用说明。

出口：所有首版必需项通过，阻塞项为零；后置功能明确列出，不冒充已支持。

后置：Pi、Runtime 自动安装升级、外部所有配置编辑、外部会话导入、跨 Runtime 协作、任意工作流编辑器、截图标注/打码、Office 文件专用处理、历史双向同步、自动索引/Git、公开分发。

## 10. 验收矩阵

| ID | 场景/操作 | 必须观察到的结果 |
| --- | --- | --- |
| A01 | 在其他 App 按截图 Hermes 快捷键 | 正确区域截图；浮窗回答确实依赖图片；可连续追问 |
| A02 | 同样截图改用 Native | 支持视觉模型正常回答；不支持模型发送前提示 |
| A03 | 带选区/截图让 Hermes 执行明确任务 | 上下文正确、工具进度可见、结果符合任务；无重复执行 |
| A04 | OpenCode 在测试目录按上下文改测试文件 | 指定 Agent/模型/目录生效；实际文件改动与结果一致 |
| A05 | 触发待审批工具并拒绝/允许 | UI 显示真实请求；拒绝无对应副作用；允许后继续 |
| A06 | 停止运行，随后追问 | stopping 与最终状态准确；新输入不会串入旧 run |
| A07 | 隐藏浮窗后完成，再打开 Main Chat | 后台执行继续、通知符合配置、同一会话仅一份输出 |
| A08 | 新增/修改/停用快捷键；重复按键 | 绑定正确且旧键清理；冲突提示；不重复提交 |
| A09 | 无选区、截图取消、权限缺失 | 输入回退或明确提示；无空历史、意外 Clipboard 读取或发送 |
| A10 | 回答期间切换目标窗口再 Replace/Insert | 不误写另一 App；回退 Copy；原 Clipboard 按规则恢复 |
| A11 | 普通会话含图片和工具，关闭并重开 | 会话恢复；目录内 Markdown 可独立阅读；相对附件有效 |
| A12 | Incognito 文字/图片/工具运行，关闭并重开 | Witsy 历史、索引、日志、缓存、附件目录无会话内容；Runtime 保留不判失败 |
| A13 | Incognito 主动转普通 | 仅操作后产生完整文件并进入最近会话 |
| A14 | 切换 Runtime/Profile/目录 | 创建分支并关联父会话；保留可读上下文，不伪造内部状态继承 |
| A15 | 断开/恢复服务或模拟写盘失败 | 不自动换 Runtime 或重发副作用；状态真实；写入失败可见可恢复 |
| A16 | 旧历史迁移重复运行和中途失败 | 无重复会话、附件可达、旧数据和备份可用，可继续或回滚 |
| A17 | 回归现有工作流 Agent/Experts/MCP/Skills | 保留入口和核心行为，与新聊天 Agent 无命名/执行冲突 |

Computer Use 在真实开发窗口操作，以 UI 证据加文件/服务状态验证结果；不能只模拟接口返回即认定整条路径完成。完整内容可用可控测试数据，避免将真实敏感截图放入测试报告。

每条记录：日期、代码版本、macOS/Runtime 版本、前置条件、操作步骤、预期、实际、必要截图或日志位置、pass/fail/blocked、关联缺陷。测试矩阵的待执行项不得填 pass。

性能记录：测量热启动浮窗可交互时间、截图完成到预览时间、提交到首个事件时间；分别记录 Witsy 耗时与 Runtime/模型耗时，首轮建立基线后制定合理回归阈值，不预先承诺未经验证的延迟。

## 11. 完成定义

首版完成必须同时满足：两个外部 Runtime 与 Native 的真实调用、最高优先级截图与上下文任务闭环、动态 Action 和共享 Quick Chat、可靠本地记录及迁移、Witsy-only Incognito、相关 lint/单元测试与 Computer Use 验收通过。

阶段报告给出已完成内容、测试证据、未解决问题和下一阶段；不得用“已写 adapter”“按钮可点击”替代功能完成。没有部署/发布要求，本文不包含分发工作。
