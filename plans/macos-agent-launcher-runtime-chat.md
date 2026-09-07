# Chat Runtime 增量与验收

日期：2026-09-06。状态：实现及开发者实测完成，等待用户验收；不是整个 P1 完成。

## 本轮范围

现有 Chat 页面可选择保存的 Hermes/OpenCode 连接。Hermes 可指定 Profile，并继承该 Profile 的模型和工作目录；客户端不会发送 directory/cwd 覆盖。OpenCode 可选择 primary Agent、provider/model 和可选工作目录。改变目标需点 `Use target in a new chat` 新建会话，避免把已有会话误路由到另一目标。

会话绑定及 session ID 随既有聊天历史保存；后续消息复用外部会话。主进程负责执行、事件订阅、状态轮询、停止和原生审批按钮；密钥由 Electron safeStorage 加密，聊天记录不保存密钥。临时聊天不调用 Summon 的历史持久化，外部 Runtime 仍有自己的记录。

## 验证记录

通过计划授权的开发应用及 Computer Use 操作，未使用自动化 E2E 或生产构建。

| 场景 | 实际结果 |
| --- | --- |
| Hermes default，8642 | 两轮 UI 对话返回 SUMMON-UI-HERMES-619；reload 后历史和远端 session 保留。session run_f0389152ce564857a77791d8517c7c5f |
| Hermes 指定 nsfw Profile，8643 | 使用该 Profile 独立认证；首轮返回 SUMMON-PROFILE-573；完全重启开发应用后追问仍正确返回；实际模型显示 deepseek-v4-flash。session run_f95a31d3d2fe49ef9a9d7cf3baa1301d |
| OpenCode plan，4096 | 指定 opencode-go/gpt-5.6-luna，两轮返回 SUMMON-UI-OPENCODE-946；完全重启应用后第三轮仍正确返回。session ses_f86b90957ffeLlBqSVwWJJyMlM |
| Hermes 停止 | 在 UI 点击 Stop 后进入 Cancelled，run_00efb8f0ea6d49b0b5766a501750dd5e |
| OpenCode 模型失败 | 默认继承的本地模型请求失败，界面显示 Failed；另建指定可用模型的会话后正常完成 |
| 界面与回归 | 已检查最终聊天布局和消息可见性；lint、TypeScript、CSS 检查通过；相关 9 个测试文件、151 个测试通过 |

测试使用隔离目录 `/tmp/summon-p0-20260906/app`，OpenCode 受控任务目录 `/tmp/summon-p0-20260906/task`。不修改用户 Runtime 全局模型、权限或工作目录。独立审批测试实例 18642 已退出；原有 8642/8643/4096 服务保持不变。

## 用户验收

1. 在当前 Summon 开发窗口的 Chat 页面，`Chat with` 选 `Hermes` 或 `Hermes nsfw`。模型/provider 留空即可沿用 Profile 配置；无需填写工作目录。
2. 点击 `Use target in a new chat`，发送一条消息，再追问前文，确认上下文连贯。
3. 切换 `OpenCode`，选 `plan` 或自己的 Agent；本轮已实测的模型是 `opencode-go/gpt-5.6-luna`。点 `Use target in a new chat` 后测试两轮对话。
4. 从左侧历史切换回来继续提问；可用已有测试会话检查恢复情况。

## 本轮边界

- 本轮交付文字对话。截图、选区、文件附件、Action、独立 Markdown 归档及完整 ChatAgent 对象仍属于后续增量。
- 已实现工具进度及原生审批入口；真实人工审批协议证据见 P0 记录，本轮尚未对每个审批按钮做完整 UI 验收。
- 已完成的会话可在应用重启后续聊；执行中的 run 快照仍存主进程内存，退出整个应用后自动恢复未完成任务尚未实现。
- 断线后查询已有任务，不自动重发；首次提交丢失响应的幂等恢复、完整事件重放仍待补齐。OpenCode 当前服务的部分审批列表请求可能返回 400，界面会提示。

用户验收这一增量后再继续下一阶段。
