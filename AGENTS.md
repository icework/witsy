# Witsy AI Assistant - Developer Guide

## UI 设计与验收标准（用户长期要求）

用中文与用户沟通。以后所有 UI 新增、修改和修复，均以 2026-09-07 的 Summon 界面整理为最低质量标准：以资深产品设计师的标准完成设计、实现和实际验收。当前实现是参考，不是不能改进的定稿。

### 设计与实现

- **先看现状再改。** 阅读相关组件和共享样式，查看运行中的实际界面，明确受影响的页面、状态及窗口尺寸。保留用户已有的功能和配置。
- **建立清楚的视觉层级。** 标题、说明、分组、字段、辅助信息和主操作要各有层级。统一间距、对齐、字体、图标、圆角和控件高度；相关表单使用一致的分组方式。不要堆叠无分组的标签、输入框和按钮。
- **复用设计系统。** 优先使用 `css/variables.css`、`css/index.css` 的现有变量和共享组件。Agent、Connection、Workflow 表单优先复用 `css/agent-forms.css`、`css/agent-settings.css`。新样式限定作用域，检查全局样式的优先级，避免影响无关页面。
- **响应式是交付条件。** 按组件实际可用宽度布局，必要时使用 container query。侧栏应给主内容让出空间；列表与详情可在窄窗口改为上下排列。下拉框按内容和可用空间伸缩，字段、按钮自然换行。正确处理 `min-width: 0`、滚动容器和长内容；不能靠隐藏溢出掩盖错位、遮挡或不可达操作。
- **让操作始终可达。** 主操作、次要操作和删除操作有明确区别。截图、文本预览及长表单中，发送、保存、取消等关键操作不能被内容挤出可操作区域；需要时使用固定或 sticky 操作栏，且不得遮挡字段或焦点。
- **控件必须完整可用。** 覆盖长名称、未配置、空列表、加载、禁用、错误和成功状态。下拉框不能出现无说明的空白选项；省略的名称要能查看完整内容。使用语义化按钮、可访问名称、键盘操作和可见焦点，保证深浅主题中的文字、占位符、边框和禁用状态仍可辨认。
- **同类流程保持一致。** Native 与外部 Runtime 的聊天输入区、Runtime／Provider／Model 选择器、上下文菜单和预览采用一致的交互与视觉规则。面向用户的文案简洁明确，技术细节只在有助于配置或决策时出现。

### 必须执行的验收

先做代码检查，再做相关测试，并在实际运行的 App 中完成视觉和交互检查。测试通过不能代替视觉验收；看到问题后继续修改，再验证受影响部分。

| 验收维度 | 要求 |
| --- | --- |
| 窗口与内容宽度 | 检查至少一个宽窗口和一个半屏／窄窗口；涉及截图或快速聊天时还须检查真实紧凑窗口。在布局断点两侧检查换行，记录实际检查尺寸，不只看默认宽度。 |
| 主题 | 检查浅色和深色主题，特别关注页面背景、卡片、文字、下拉箭头、占位符、焦点和禁用状态。 |
| 内容与状态 | 对受影响组件检查真实配置、长名称、空／未配置状态，以及适用的加载、错误、成功、禁用状态。数据不能只依赖简短占位文本。 |
| 交互 | 实际操作受影响的下拉框、菜单、切换、编辑、取消和滚动；检查键盘可达性和焦点。无关的真实发送、删除或配置覆盖不属于视觉验收；这类行为用隔离数据和单元测试验证。 |
| 流程范围 | 检查修改涉及的所有入口和变体。聊天修改应覆盖适用的 Native／外部 Runtime；上下文修改应覆盖截图／文本预览；不能只验收一张静态截图。 |
| 回归 | 确认布局变化没有破坏选择、保存、取消、事件传递、数据持久化或原有功能。优先测试用户行为，不编写只复述 CSS 数值或实现细节的测试。 |
| 收尾 | 恢复为验收临时修改的主题、窗口和草稿状态；核对已有配置仍在。交付时说明改动、实际检查的范围和测试结果，必要时把 App 留在更新后的页面。 |

**完成门槛：** 不存在已知的错位、重叠、异常留白、意外横向溢出、关键文字不可辨认或操作不可达。没有完成的视觉检查必须明确说明，不能声称整体验收通过。发现问题要持续修正，不能以“功能能用”或“单元测试全绿”作为完成依据。

### 开发环境与数据保护

- UI 任务可以复用已运行的开发版；为完成实际验收，必要时可启动或重启本地开发版。不要为每个小步骤重复请求确认。
- 启动前确认正在使用的数据目录和 `WITSY_HOME`，沿用当前工作所用目录。不能因启动方式变化导致用户的 Connection、Agent 或其他设置看起来丢失。
- 涉及数据目录切换、迁移、导入或可能改写配置的调试前，先建立可恢复的本地备份。普通样式编辑不必重复备份。备份留在仓库外，不提交凭据、个人配置或用户截图。
- 仍然禁止自行构建发布包和运行 E2E 测试。优先用实际 App 的界面检查和相关单元测试完成验收。
- 仅修改文档时，无需启动 App 或运行与文档无关的代码测试；检查内容、引用路径及 `git diff --check` 即可。

## Project Overview

Witsy is a cross-platform Electron-based desktop AI assistant that serves as a universal MCP (Model Context Protocol) client. Built with Electron, TypeScript, Vue 3, and Vite, it integrates multiple LLM providers and supports features like chat completion, image generation, speech-to-text, text-to-speech, document search (RAG), and automation capabilities.

## Architecture & Key Components

### Core Structure
- **Main Process** (`src/main/`): Electron main process handling system integration, IPC, and native APIs
- **Renderer Process** (`src/renderer`): Vue 3 frontend with Vite bundling 
- **Preload Scripts** (`src/preload.ts`): Secure IPC bridge between main and renderer
- **LLM Integration** (`src/renderer/services/llms/`): Multi-provider LLM abstraction layer using `multi-llm-ts`
- **Plugin System** (`src/renderer/services/plugins/`): Extensible tools for search, filesystem, python execution, etc.
- **Automation** (`src/main/automations/`): Cross-platform automation for "Prompt Anywhere" and AI commands

### Build System (Electron Forge + Vite)
- **Development**: `npm start` - runs with hot reload
- **Testing**: `npm test` (Vitest unit tests), `npm run test:e2e` (E2E tests)
- **Building**: `make mac-arm64`, `make win-x64`, etc. - platform-specific builds via Makefile
- **Configuration**: `forge.config.ts` handles Electron Forge setup, Vite configs handle bundling

## Development Workflows

In all cases, implementation should be done in small increments: code, lint, test. Always break down tasks into small, manageable pieces. This allows for easier debugging and testing, and ensures that the codebase remains stable. At the end of each task, ensure that the code is properly tested and linted before moving on to the next task. For UI work, also complete the visual and interaction acceptance requirements above, then report the result and verified coverage to the user.

Tests should be written or updated as soon as possible and kept passing before moving on to the next task. This ensures that the codebase remains stable and maintainable. Always assume when starting a new feature, that the code is already in a good state and that all existing tests are passing. Be mindful of that when fixing non-passing tests.

Linting can be done with `npm run lint`, which will also check for Vue type errors. It is mandatory to run this command before running tests to ensure code quality. When this command produces no output, it means that the code is properly formatted and does not contain any linting errors.

Tests can be run using `npm run test:ai --` followed by the test name or path.

Never run end-to-end tests during your process.
Never try to build the application during your process.
For UI acceptance, reuse or start the local development application as described above. For other tasks, do not start the application unless the user requests it.

## Key Patterns & Conventions

### State Management

In the renderer process, the state is managed through the store object: 

```typescript
import { store } from '@services/store'
```

This store is a Vue 3 reactive object that holds the application state, including user preferences, conversation history and other relevant data.

### Configuration Management
```typescript
// Centralized config in src/types/config.ts with backwards compatibility
export type Configuration = {
  engines: Record<string, EngineConfig>, // LLM provider configs
  plugins: Record<string, PluginConfig>, // Plugin settings
  // ... other sections
}
```

### IPC Communication
```typescript
// Organized constants in src/ipc_consts.ts
export const CHAT = {
  STREAM: 'chat-stream',
  CANCEL: 'chat-cancel'
} as const
// Main process handlers in src/main/ipc.ts
// Preload exposures in src/preload.ts
```

### Event System

**IPC Events (main→renderer):** Use `emitIpcEvent`/`emitIpcEventToAll`/`emitIpcEventToFocused` from main and the `useIpcListener` composable in renderer. Handlers are auto-cleaned on component unmount.
```typescript
import useIpcListener from '@composables/ipc_listener'
const { onIpcEvent } = useIpcListener()
onIpcEvent('docrepo-modified', (data) => { /* handle */ })
```

**Bus Events (renderer↔renderer):** Use `useEventBus` for cross-branch communication between Vue components. Prefer Vue emit/provide-inject for parent-child communication.
```typescript
import useEventBus from '@composables/event_bus'
const { onBusEvent, emitBusEvent } = useEventBus()
onBusEvent('fullscreen', (data) => { /* handle */ })
emitBusEvent('new-chat', payload)
```

### Window API Types

If you encounter `window.api.*` lint errors, add the method signature to `declare global { interface Window {` in `src/types/index.ts`.

### CSS classes

The project includes a variety of CSS classes available globally:
- variables.css + index.css = base variables and styles
- form.css = styling of form and form elements
- split-pane.css + master-detail.css = common layouts
- panel.css + artifact.css + tooltip.css = common components
- swal2.css = dialog styling

Make sure you use globally available CSS variables and don't create your own styles.

CSS variable usage is validated with Stylelint. Run `npm run lint:css` to check that all `var(--...)` references use defined variables. The linter imports variable definitions from `css/variables.css` and `css/index.css`.

### Testing Patterns
- **Unit Tests**: `tests/unit/` using Vitest + Vue Test Utils
- **Mocking**: LLM providers mocked in tests via `LlmMock` class
- **Coverage**: Excludes platform-specific automation code and vendor files
- **E2E Tests**: `tests/e2e/` using Playwright

When writing tests, prioritize testing user interactions by triggering HTML events and then checking state updates, whether on the UI itself or updats to store. As much possible avoid injecting data in Vue `vm` and call methods on it. We want to test as if the user is interacting with the application, so prefer using `trigger` or `setValue` to simulate user actions.

Never use simulated `wait` statements using an "await Promise" pattern. In most cases awaiting `nextTick` should be sufficient to ensure the UI is updated before assertions. If really needed you can use `vi.waitFor` or `vi.waitUntil` to wait for a specific condition, but this should be avoided unless absolutely necessary and always using a reasonable timeout.


All the IPC methods are mocked in `tests/mocks/window.ts`. In most cases, if you need to test IPC calls, you should

```typescript
import { useWindowMock } from '@tests/mocks/window'
```

and use the `windowMock` in `beforeAll` (or maybe `beforeEach`).

### Localization

Witsy is localized using `vue-i18n`. All translations are stored in `./locales/*.json` and can be added or modified as needed. The main language is English, and other languages can be added by creating new JSON files in the locales directory. Only add translation for English when creating a new feature. If asked to add translations for other languages you can run `./tools/i18n_check.ts --fix` but never run this based on your own initiative.

In the renderer process, always `import { t } from '@services/i18n'`.

### CSS Variables

The design tokens are defined in `./css/variables.css`, with application aliases and overrides in `./css/index.css`. Use existing variables rather than inventing new tokens or hardcoding visual values. If you need to add a new variable, please discuss it with the team first.

## Common Tasks

### Running Tests
```bash
npm run test:ai            # Unit tests
npm run test:ci            # With coverage
```

### Analyzing Coverage Gaps
To identify files with the most uncovered lines and prioritize testing efforts:

```bash
node tools/coverage_gaps.js                          # Show top 20 files with most uncovered lines
node tools/coverage_gaps.js --limit 10               # Show top 10 files
node tools/coverage_gaps.js --filter src/components  # Filter to specific directory
node tools/coverage_gaps.js --show-lines             # Show which lines are uncovered
```

This script runs coverage analysis and outputs files sorted by absolute number of uncovered lines, making it easy to identify the biggest testing gaps. Unlike percentage-based coverage, this helps find files where adding tests will have the most impact (e.g., a 1000-line file at 80% coverage has more uncovered code than a 10-line file at 0%).

Use `--show-lines` to see exactly which line numbers are not covered, formatted as ranges (e.g., "132,361-367,372-375").
