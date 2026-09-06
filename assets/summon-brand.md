# Summon · 召见

个人 macOS AI Launcher：随时唤起 Agent，让它根据当前上下文行动。

图标由内置 imagegen 生成。原始输出复制为 `assets/summon.png`；macOS 图标通过 sips 缩放和 iconutil 封装为 `assets/summon.icns`，原有 Witsy 资源保留。

最终生成提示词：

```text
Use case: logo-brand
Asset type: production macOS application icon for Summon, a personal AI launcher that summons agents using screenshots and context.
Primary request: one striking polished macOS app icon: a sculptural luminous folded ribbon forming an abstract S and an open portal, suggesting instant invocation. A single memorable bold silhouette readable at 32 pixels.
Style: premium restrained dimensional icon, smooth porcelain-metal material, subtle depth, crisp edges, no busy details.
Composition: centered front view, large mark on a midnight ink rounded-square tile, tile occupies about 88% of square canvas with macOS-friendly rounded corners. Electric jade/sea-glass ribbon with a soft pale mint highlight. Transparent outside the tile, actual alpha, no surrounding scene.
Constraints: square 1024x1024; no letters, no text, no watermark, no robot face, no chat bubble, no generic sparkles, no mockup, no extra icons. Deliver the icon asset alone.
```

生成器实际输出尺寸以 PNG 文件为准，iconset 各尺寸由原图生成。

## 开发预览验证（2026-09-06）

- 原图：1254 × 1254，含 alpha；ICNS 含 macOS 常用尺寸。
- `npm run lint`：ESLint、TypeScript、CSS 均通过。
- 相关测试：i18n_locales、onboarding、modal_dialog，共 73 项通过。
- `WITSY_HOME='/Users/kaiwu/Library/Application Support/Summon-preview' npm start` 完成开发编译并启动。
- Computer Use 确认实际欢迎页显示新图标、Welcome to Summon 和 Summon v3.6.0。开发宿主进程仍显示 Electron，未制作独立分发安装包。
- 首次启动修复：绑定 WITSY_HOME 包装中的 app.getPath；删除 Agent 编辑页未使用、指向未公开依赖路径的导入。
- 安装修复：补齐锁文件缺失依赖；为已有固定版本依赖记录安装脚本许可。系统 Node 26 下完整 npm rebuild 的旧 macos-alias 模块失败，针对运行依赖的 rebuild 成功，实际开发启动通过；独立打包尚未验证。
- 此版本是品牌预览；Hermes/OpenCode 新 Runtime 功能尚未实施。
