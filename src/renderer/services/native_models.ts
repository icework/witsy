import { Configuration } from '../../types/config'
import { RuntimeCatalog, RuntimeModelVisibility } from '../../types/runtime'
import { ILlmManager } from '../../types/llm'

// Visibility changes picker choices, never the stored catalog or an existing chat.
export const nativeProviders = (config: Configuration, manager: ILlmManager, includeHidden = false) => manager.getChatEngines().filter(id => {
  if (!manager.getEngineName(id) || !manager.isEngineConfigured(id)) return false
  return includeHidden || !config.nativeRuntime?.modelVisibility?.providers || config.nativeRuntime.modelVisibility.providers.includes(id)
})
export const nativeModels = (config: Configuration, manager: ILlmManager, provider: string, includeHidden = false) => {
  const allowed = config.nativeRuntime?.modelVisibility?.models?.[provider]
  return manager.getChatModels(provider).filter(model => includeHidden || !allowed || allowed.includes(model.id))
}
export const nativeCatalog = (config: Configuration, manager: ILlmManager, includeHidden = false): RuntimeCatalog => {
  const providers = nativeProviders(config, manager, includeHidden)
  const models = providers.flatMap(provider => nativeModels(config, manager, provider, includeHidden).map(model => ({ provider, id: model.id, name: model.name || model.id })))
  const preferred = models.find(m => m.provider === config.nativeRuntime?.defaultProvider && m.id === config.nativeRuntime?.defaultModel)
    || models.find(m => m.provider === config.llm.engine && m.id === config.engines[config.llm.engine]?.model?.chat) || models[0]
  return {
    defaults: preferred ? { provider: preferred.provider, model: preferred.id } : undefined,
    providers: providers.map(id => ({ id, name: manager.getEngineName(id) })), agents: [], profiles: [],
    models,
  }
}
export const nativeDefault = (config: Configuration, manager: ILlmManager): { engine: string; model: string } => {
  const catalog = nativeCatalog(config, manager)
  const saved = config.nativeRuntime
  const explicit = catalog.models.find(m => m.provider === saved?.defaultProvider && m.id === saved?.defaultModel)
  if (explicit) return { engine: explicit.provider, model: explicit.id }
  const legacy = manager.getChatEngineModel()
  const preferred = catalog.models.find(m => m.provider === legacy.engine && m.id === legacy.model) || catalog.models[0]
  return { engine: preferred?.provider || '', model: preferred?.id || '' }
}

export const copyVisibility = (visibility: RuntimeModelVisibility) => JSON.parse(JSON.stringify(visibility)) as RuntimeModelVisibility
