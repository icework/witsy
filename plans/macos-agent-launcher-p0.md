# P0 实施与验证记录

日期：2026-09-06；基线提交：83931d71（加本轮工作区修改）。
环境：macOS 26.5.2、Electron 38.2.0、Hermes 0.21.0（local 96ed0e71）、OpenCode 1.18.25。

**状态：P0 尚未达到完整阶段出口；用户随后指定先实现 Chat Runtime 接入，P1 的聊天子集已实施，详见 [Chat Runtime 增量](macos-agent-launcher-runtime-chat.md)。整体阶段尚未验收。**

## 已实施

- `WITSY_HOME` 改为在启动早期调用 Electron 原生路径设置；配置、窗口状态、Chromium session/cache、日志、crash dumps 位于指定目录。未设置变量时保持现有路径行为。
- electron-log 使用独立的路径解析器，因此额外指定其 `main.log` 路径；只设置 Electron logs 不足以隔离 electron-log。
- 首次安装尚无模型目录时，图片能力判断不再因 null model 抛异常，继续使用既有不兼容提示及原有视觉模型回退设置。
- 增加路径创建、重复使用不覆盖已有配置、失败不切换路径及空模型能力判断的单元测试。

隔离目录：`/tmp/summon-p0-20260906/app`；受控任务目录：`/tmp/summon-p0-20260906/task`。
启动命令（仓库根目录）：

```sh
WITSY_HOME=/tmp/summon-p0-20260906/app npm start
```

临时目录可能被系统清理；复测时可新建专用目录。不要复制真实 settings、apiKeys 或历史到仓库。
这不是 Incognito 实现：OS 权限、外部 Runtime 数据、用户主动选择的文件，以及现有功能自己的系统集成，不因 `WITSY_HOME` 自动隔离。

## 验证记录

| ID | 操作与预期 | 实际结果 | 状态/证据 |
| --- | --- | --- | --- |
| P0-D01 | 隔离启动，配置和缓存落到测试目录 | settings.json、window.json、session 缓存均在测试目录；lsof 核对 Chromium 打开的文件 | pass |
| P0-D02 | 日志隔离 | 初次探测发现 electron-log 仍用默认路径；补充解析器后日志首行确认 `/private/tmp/summon-p0-20260906/app/logs/main.log` | pass，原问题已修复 |
| P0-U01 | Computer Use 操作新实例 | 用户关闭旧实例后重新启动唯一实例；关闭 DevTools、前进首次启动向导、关闭向导、进入主聊天、展开附件菜单 | pass；当前开发地址 localhost:5173 |
| P0-U02 | 无模型目录时添加 colors.png | 修复前出现 `Cannot read properties of null (reading 'capabilities')`；修复后单元测试通过；Computer Use 使用文件对话框键盘选择 colors.png，主输入框出现图片预览，无 null 异常。当前设置存在视觉回退，不能据此声称无回退配置的 UI 提示也通过 | pass（图片预览路径） |
| P0-H01 | Hermes 健康与认证 | `/health` 200；无 key 的 `/v1/models` 401；现有 key 200；不输出凭证 | pass |
| P0-H02 | Profile 路由边界 | `/p/default/v1/models` 200；不存在的 profile 404 | pass（仅默认 Profile；多 Profile 独立认证未测） |
| P0-H03 | 文字及续聊 | 第一次保存 SUMMON-P0-731，第二次仅通过 session_id 追问，正确复述标记 | pass；runs `run_2b65afa1b8064419abc2cf85877e09fd` / `run_7cd138c3735644609f46008c913412fd` |
| P0-H04 | 默认模型接收图片 | 默认选择 opencode-go/deepseek-v4-flash；两次不同 content 格式均未成功识别，模型报告图像路由 404。不能把 completed 当成图片能力成功 | fail；非视觉模型不可用于 Screenshot Ask |
| P0-H05 | 显式视觉模型接收真实图片字节 | `/v1/runs` 指定 provider=opencode-go、model=gpt-5.6-luna；input 使用 text/image_url content parts 和 PNG data URL；答复 Left: Red / Right: Blue；`/api/sessions/{id}` 内 session.model 确认 gpt-5.6-luna | pass；`run_933fdc2a20cf4dcfbeb8c40378ad7f51` |
| P0-H06 | 取消状态 | `/stop` 返回 stopping，随后 GET run 确认 cancelled；仅测提交后立即取消，未证明执行中所有子进程的终止 | pass（限定范围）；`run_705964afb947449585504d9ed711bfb4` |
| P0-H08 | 人工审批允许/拒绝 | 临时独立 Profile，approvals.mode=manual；GET run 返回 waiting_for_approval 和 request_id；deny 后 fixture 保留，once 后工具成功删除本轮创建的 fixture | pass；run_581bd585c662495d821651a7359e2db1 / run_37037409501546b6813aff2cd62ad84d |
| P0-H09 | 审批断线恢复 | 收到审批事件后主动关闭 SSE；GET run 仍含待审批请求，凭恢复的 request_id 拒绝；任务结束，fixture 保留，无重复提交 | pass；run_e81a7be82e854dd6aad893a26ea5ef4d |
| P0-H10 | Hermes 自身工作目录 | 独立 Profile 配置 terminal.cwd=/tmp/summon-p0-20260906/task；工具执行 pwd 返回该路径 | pass；run_c109f4a115914c97b9ae212f17c3dd8f；用户接受不提供客户端目录覆盖 |
| P0-O01 | OpenCode 健康、模型和工作目录 | `/global/health` healthy；获取运行服务 `/doc` schema；新建独立测试 session，directory 返回 `/private/tmp/summon-p0-20260906/task` | pass；`ses_f8703f46effehnOzcfhr7kDEaZ` |
| P0-O02 | 文字及续聊 | build Agent、opencode-go/gpt-5.6-luna；两轮正确复述 SUMMON-P0-842；assistant metadata 确认实际 Agent/provider/model | pass |
| P0-O03 | 工具读取文件及审批 | 测试 session 设置 permission ask；read marker.txt 进入等待，GET /permission 获取真实请求；reply=once 后 read completed，答复 SUMMON-FILE-963 | pass |
| P0-O04 | 写文件审批与拒绝 | 实时 `/event` 收到 permission.asked，使用其 id 回复 reject 后 deny-test.txt 不存在；另一次回复 once 后 allow-test.txt 内容为 SUMMON-WRITE-105。GET /permission 在 apply_patch 等待时仍返回 HTTP 400 | 实时允许/拒绝 pass；断连后的审批列表恢复仍有兼容问题 |
| P0-H07 | Hermes 工具事件流 | 实际 SSE 收到 tool.started、tool.completed、message.delta、reasoning.available、run.completed；字段为 event。受控删除仅针对本轮创建的 approval-fixture，被智能审批自动允许，没有人工等待事件 | 事件传输 pass；人工审批由 H08/H09 补齐；run_dc3410a1b3b34023bb06e26ce6ac0835 |
| P0-O06 | OpenCode 文本附件 | file part 使用 text/plain、filename=input.txt 及 data URL；模型正确返回仅存在于附件的新标记 SUMMON-ATTACHMENT-527 | pass；也是此前取消后继续使用原 session 的验证 |
| P0-U04 | 全局快捷键 | 用户在其他 App 使用真实键盘按 ⌘⇧P，确认 Prompt Anywhere 浮窗弹出 | pass（用户实测）；该入口现有代码不采集选区 |
| P0-U03 | 系统权限 | 用户添加 Electron 权限后，Settings > Advanced 实际显示 Accessibility Granted、Automation Granted | pass；屏幕录制权限未验证 |
| P0-O05 | 审批等待中取消 | `/session/{id}/abort` 返回 200 true；消息返回 MessageAbortedError；deny-test.txt 不存在 | pass；这不等同于拒绝审批成功 |

原有 Runtime 服务、默认模型、Profile 和全局权限均未修改。另启动了临时独立 Hermes 测试实例（127.0.0.1:18642，HERMES_HOME=/tmp/summon-p0-20260906/hermes-isolated/profiles/summon-p0），仅此实例设置人工审批及受控目录；凭证通过进程环境传递，不写入测试配置。测试 session 的 ask 策略仅作用于该测试 session。测试会话可能保留在外部 Runtime，符合原计划边界。

本地临时证据：`/tmp/summon-p0-20260906/dev.log`、上述 app/logs/main.log，以及 `/tmp/summon-hermes-*.json`、`/tmp/summon-opencode-session.json`。这些文件仅含受控测试标识/元数据；仓库不保存完整模型上下文或凭证。

## 协议结论与未完成项

官方入口：[Hermes API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)、[OpenCode Server](https://opencode.ai/docs/server/)。以下具体支持范围以本机探测及安装源码为准。

- Hermes 使用 `/v1/runs` 执行与控制，不能简单包装成无状态 Chat Completions。`/v1/models` 的 hermes-agent 是虚拟名称，实际模型从会话详情核对；丰富模型列表来自 `/api/model/options`。
- Hermes 本机源码中的 run SSE 使用消费队列，断开会清理 transport，不能假设 Last-Event-ID 可重放。P1 应由主进程单一订阅后分发；恢复通过状态/结果，不重发任务。事件流真实传输已测；审批断线恢复已测，完整中间事件重放仍不保证。当前 CLI 提示运行中的 gateway 可能使用更新前模块，所以源码结论须与运行服务实测区分。
- Hermes `/v1/runs` 源码未读取 workingDirectory/cwd；不能把传入任意目录字段当成目录已生效。已通过独立测试 Profile 的 terminal.cwd 配置及实际 pwd 验证。用户明确接受 Hermes 自身工作目录，Summon 不指定或覆盖；这一差异不再阻塞接入。
- Hermes 人工审批的真实等待/允许一次/拒绝以及断开事件流后的待审批恢复已在独立测试 Profile 通过；执行中取消与多 Profile 独立认证随后在 Chat Runtime 增量中实测；PDF/文件传输仍未完成。capabilities 宣称支持不等于实测通过。
- OpenCode `/doc` 是本机版本依据；`prompt_async` 返回 204，结果经 message 接口读取。权限列表在 read 请求下成功，在 apply_patch 请求下出现序列化错误，首版不能隐藏这个差异。
- OpenCode 文本 file parts、实时事件订阅、写入允许/拒绝及取消后续聊已通过；图片/PDF 和丢失审批事件后的恢复仍未完成。
- 现有选区/回填代码仅保存与恢复 clipboard.readText()/writeText()，没有完整保留图片、富文本等剪贴板格式；异常路径也未统一使用 finally 恢复。P2/P3 上下文采集需补齐，不能把现有文字恢复等同于完整剪贴板恢复。
- Native 现有 Temporary 由 Chat.vue 控制不加入 history；store.saveHistory 本身没有统一 temporary 门禁，不能据此承诺 Witsy-only Incognito。
- 现有截图能力主要在 computer plugin：按屏幕名称挑选缩略图；尚无计划要求的区域截图 Action。Prompt Anywhere 有独立预备窗口，尚未实现共享 Conversation/Run 的稳定执行宿主。
- Accessibility 和 Automation 已在应用设置中确认 Granted。Computer Use 向 TextEdit 发送 ⌘⇧P 打开了其页面设置，不能作为系统全局快捷键的有效测试；用户已用真实键盘确认 Prompt Anywhere 弹出；再次选中文字后触发，用户确认没有带入。源码核对：automations/anywhere.ts 只记录 sourceApp 并打开窗口，不调用 grabSelectedText；实际采集入口在 Commander.initCommand。此前要求 ⌘⇧P 自动带入选区的测试预期有误，不能据此判为权限/采集故障。带选区 Action 按计划在 P2 实现；现有 AI Commands 选区采集、回填及屏幕录制权限尚未验证。

## 检查结果

- `npm run lint`：ESLint、Vue/TypeScript、CSS 全通过。
- `npm run test:ai -- tests/unit/main/data_paths.test.ts tests/unit/main/workspace.test.ts tests/unit/main/history.test.ts tests/unit/renderer/services/llms/llm2.test.ts`：4 文件、40 测试通过。
- `git diff --check`：通过。
- 运行了计划授权的 `npm start` 开发编译与 Computer Use；未执行生产构建、打包、发布或自动化 E2E。

## 用户可复测的本轮增量

1. 使用上述命令打开隔离实例，确认看不到原有聊天和密钥。
2. 尚未配置模型时，点输入框 `+` → `Add photos & files`，选择 `tests/fixtures/agent-launcher/colors.png`；预期显示图片预览，或在没有可用视觉模型及回退时显示既有不兼容提示；不能出现 null capabilities 异常。
3. 检查隔离目录中的 settings.json、window.json、session 和 logs/main.log；退出并重开后仍使用该目录。

以上是早期基础增量复测步骤。后续新增的 Hermes/OpenCode 聊天选择器按 [Chat Runtime 验收步骤](macos-agent-launcher-runtime-chat.md) 测试；截图 Action 尚未实现。用户指定先交付聊天子集，不代表 P0 或 P1 整体已通过验收。

## 后续 Computer Use 记录模板

| 日期/代码版本 | 场景 ID | 系统/Runtime 版本 | 前置条件 | 操作 | 预期 | 实际 | 截图/日志 | 状态 | 缺陷 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 待填写 | A01 | 待填写 | 待填写 | 待执行 | 见主规格 | 未执行 | 无 | pending | 无 |
