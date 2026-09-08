import { LlmModelOpts } from 'multi-llm-ts'
import { ToolSelection } from './llm'
import { RuntimeBinding } from './runtime'

export interface ChatAgent {
  id: string
  name: string
  description?: string
  kind: 'native' | 'hermes' | 'opencode'
  native?: { engine: string; model: string; instructions?: string; tools: ToolSelection; modelOpts?: LlmModelOpts }
  binding?: RuntimeBinding
}

export interface ScreenshotState {
  capturing: boolean
  compact: boolean
  image?: string
  error?: string
  chatId?: string
  busy: boolean
  contextKind?: 'screenshot' | 'selected-text' | 'none'
  contextText?: string
  requestId?: string
  agentId?: string
  prompt?: string
  workflowName?: string
  workflowMode?: 'chat' | 'task'
}
export const hasPendingContext = (state: Pick<ScreenshotState, 'image' | 'contextKind'>): boolean =>
  !!state.image || state.contextKind === 'selected-text' || state.contextKind === 'none'

export interface ContextWorkflow {
  schemaVersion: 1
  id: string
  name: string
  contextInput: 'screenshot' | 'selected-text' | 'none'
  mode?: 'chat' | 'task'
  agentId?: string
  prompt: string
  accelerator: string
  enabled: boolean
}
export interface ScreenshotSettings { accelerator: string; agentId?: string }
export interface ChatAgentAPI {
  list(): Promise<ChatAgent[]>
  save(agent: ChatAgent): Promise<ChatAgent>
  remove(id: string): Promise<void>
  workflows(): Promise<ContextWorkflow[]>
  saveWorkflow(workflow: ContextWorkflow): Promise<ContextWorkflow>
  removeWorkflow(id: string): Promise<void>
  runWorkflow(id?: string): Promise<void>
  screenshotSettings(settings?: ScreenshotSettings): Promise<ScreenshotSettings>
  capture(fresh?: boolean): Promise<void>
  screenshotSource(): Promise<string>
  screenshotFinish(region?: { x: number; y: number; width: number; height: number }): Promise<void>
  screenshotState(): Promise<ScreenshotState>
  screenshotUpdate(update: { manualText?: boolean; dismiss?: boolean; chatId?: string; busy?: boolean; expand?: boolean; hide?: boolean }): Promise<void>
}
