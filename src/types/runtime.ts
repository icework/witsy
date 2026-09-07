export type RuntimeKind = 'hermes' | 'opencode'
// Omitted lists mean all available entries. Empty lists deliberately show none.
export interface RuntimeModelVisibility {
  providers?: string[]
  models?: Record<string, string[]>
}
export interface RuntimeCatalogOptions { includeHidden?: boolean; refresh?: boolean }
export interface RuntimeConnection {
  id: string
  name: string
  kind: RuntimeKind
  endpoint: string
  defaultProfile?: string
  hasSecret?: boolean
  modelVisibility?: RuntimeModelVisibility
}
export interface RuntimeBinding {
  connectionId: string
  kind: RuntimeKind
  profile?: string
  agent?: string
  provider?: string
  model?: string
  actualModel?: string
  actualProvider?: string
  directory?: string
  sessionId?: string
}
export interface RuntimeApproval {
  id: string
  description: string
  choices: string[]
}
export interface RuntimeRun {
  chatId: string
  id: string
  binding: RuntimeBinding
  status: 'running' | 'waiting' | 'stopping' | 'completed' | 'failed' | 'cancelled'
  text: string
  detail: string
  error?: string
  approval?: RuntimeApproval
}
export interface RuntimeCatalog {
  agents: string[]
  profiles: string[]
  models: { provider: string; id: string; name: string; vision?: boolean }[]
  providers?: { id: string; name: string }[]
  defaults?: { provider: string; model: string }
}
export interface RuntimeAPI {
  list(): Promise<RuntimeConnection[]>
  save(connection: RuntimeConnection, secret?: string, localProfile?: string): Promise<RuntimeConnection>
  catalog(binding: RuntimeBinding, options?: RuntimeCatalogOptions): Promise<RuntimeCatalog>
  setModelVisibility(connectionId: string, visibility: RuntimeModelVisibility): Promise<RuntimeConnection>
  start(chatId: string, binding: RuntimeBinding, text: string, images?: string[]): Promise<RuntimeRun>
  get(chatId: string): Promise<RuntimeRun | null>
  cancel(chatId: string): Promise<void>
  approve(chatId: string, requestId: string, choice: string): Promise<void>
}
