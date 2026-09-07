# Chat Agent 与截图提问增量

日期：2026-09-06。状态：已实现本增量，开发验证见下；等待用户有时间时验收。本记录不代表 P1/P2 整体完成。

后续入口与配置结构已调整，以 [Custom Agents 与 Context Workflows](macos-agent-launcher-context-workflows.md) 为准；本页保留截图增量的历史验证证据。

## 本次功能

- Chat Agent 统一保存 Native、Hermes Profile、OpenCode Agent。Native 保存 Provider、模型、系统指令和工具选择；外部 Agent 引用命名 Runtime 连接，并保存 Profile/Agent 与可选模型。
- 会话保存 Agent 配置快照。修改预设不改变旧聊天；选择另一个预设开启新聊天。外部预设不保存会话 ID 或凭证。Hermes 继续使用自身/Profile 的工作目录。
- `Screenshot ask` 隐藏应用窗口，冻结鼠标所在屏幕，再由用户拖选区域。只有裁剪图片进入预览；取消不发送、不创建聊天，原始屏幕仅短暂驻留内存。
- 预览中可选择任意已保存 Agent、修改问题、重截、取消或选择临时聊天。点击 `Ask this agent` 才提交。Native/OpenCode 在发送前检查所选模型的图片能力；Hermes 由实际 Profile/模型处理，不保证所有模型支持图片。
- 图片通过 Hermes user 消息的 content parts 或 OpenCode file part 传送实际字节，不使用远端无法读取的本地路径。普通会话沿用原有附件与历史存储；临时会话跳过 Summon 附件和历史写入，外部 Runtime 仍可能保存记录。
- 浮窗复用主聊天窗口及执行宿主，可隐藏、续聊和展开到 Main Chat；不会因展开而另开远端会话。当前是同一个窗口的紧凑模式，尚未实现两个窗口同时展示。
- `Screenshot shortcut` 可保存默认 Agent 和快捷键。冲突时保留旧快捷键；执行中重复调用恢复当前任务，防止重复提交。

## 开发验证

使用隔离目录 `/tmp/summon-p0-20260906/app`，通过 Computer Use 操作界面；只发送自制红蓝测试图片的裁剪区域。

| 路径 | 证据 |
| --- | --- |
| 区域截图与预览 | Preview 打开 `tests/fixtures/agent-launcher/colors.png`，拖选色块后浮窗仅显示裁剪图；截图发送前可以更换 Agent |
| Hermes Vision | Hermes 默认 Profile，`opencode-go/gpt-5.6-luna`；回答 `Red, blue`；同一会话追问逆序，展开主窗口后显示 `Blue, red`；session `run_0940ae972ec04905944d9c3ec36daf66` |
| OpenCode Plan | 在截图预览中从 Hermes 切换到 OpenCode plan，`opencode-go/gpt-5.6-luna`；回答 `Red and blue.`；发送追问后隐藏浮窗，再检查得到 `Blue and red.`；session 保持 `ses_f867d10c3ffeCpLYihjWt4ZGym` |
| Native | 单元交互测试通过选择预设、输入问题及点击 Ask，验证指定模型/指令与图片传入现有 Assistant；临时会话不调用文件保存且不加入历史。隔离实例未配置 Native Provider，因此尚未进行真实 Native 模型收图验证 |
| 快捷键 | 界面成功保存 `Command+Shift+2` 与默认 Agent；单元测试覆盖冲突保留与执行中重复激活。尚未确认用户实际按全局快捷键唤起的验收结果 |

验证中修复：Hermes 多模态消息包装、Vue 响应式对象不能跨 IPC 克隆、截图预览被欢迎页/旧消息挤出浮窗、Native 预设被全局默认模型覆盖、临时 Native 截图保存附件的问题。

`npm run lint` 通过（ESLint、TypeScript、CSS）；9 个相关测试文件共 79 项测试通过，覆盖 Agent 保存与快照、截图取消/裁剪/冲突、两种外部图片协议、Native 截图交互、Runtime Chat 与 ChatArea 回归。`git diff --check` 通过。代码检查结果记录于 `/tmp/summon-agent-screenshot-lint.log`，测试结果记录于 `/tmp/summon-agent-screenshot-tests.log`。未运行生产打包或 E2E 测试。

## 稍后用户验收

1. 在 `Settings → Custom Agents` 选择左侧已有 Agent，或点 `+` 新建预设。Native 先在原有模型设置中配置一个支持图片的模型。
2. 点击 `Screenshot ask`，框选一处区域，在预览中切换 Agent，输入问题并发送。
3. 追问、隐藏浮窗、展开 Main Chat，确认回答和上下文延续。
4. 在 `Settings → Context Workflows → Screenshot Ask` 保存常用组合键和默认 Agent，实际按键验证全局唤起。

## 设置入口调整（同日后续）

用户要求将 Agent 管理、Custom chat / connection、截图快捷键设置统一放到 Settings。新增 Chat Agents 设置页；聊天页只保留 Agent 选择、截图提问和运行会话控件。手动连接配置可从设置页开启新聊天，保存预设不会自动创建聊天或修改旧会话；保存后的 Agent 列表和截图默认值在同一窗口内即时刷新。

`npm run lint` 和 5 个相关测试文件的 57 项测试通过，`git diff --check` 通过。Computer Use 确认聊天页移除三个配置入口、设置页三项入口可访问、原有快捷键和默认 Agent 保留。开发窗口缓存的新增翻译需要重启后刷新；由于用户有未发送截图，本次未重启该窗口。

本增量之后仍需推进：完整 Action 管理、多图与其他上下文来源、排队/并发策略、开放 Markdown 归档、迁移，以及完整 Incognito 生命周期验收。用户验收前不把这些项目标记为完成。
