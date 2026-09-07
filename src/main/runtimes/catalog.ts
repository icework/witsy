import { RuntimeCatalog, RuntimeModelVisibility } from '../../types/runtime'

export function normalizeVisibility(value: RuntimeModelVisibility): RuntimeModelVisibility {
  const strings = (items: unknown): string[] => {
    if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.trim())) throw new Error('Invalid model visibility selection.')
    return [...new Set(items.map(item => item.trim()))]
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model visibility selection.')
  const result: RuntimeModelVisibility = {}
  if (value.providers !== undefined) result.providers = strings(value.providers)
  if (value.models !== undefined) {
    if (!value.models || typeof value.models !== 'object' || Array.isArray(value.models)) throw new Error('Invalid model visibility selection.')
    result.models = Object.fromEntries(Object.entries(value.models).map(([provider, models]) => [provider, strings(models)]))
  }
  return result
}

export function visibleCatalog(catalog: RuntimeCatalog, visibility?: RuntimeModelVisibility): RuntimeCatalog {
  const providerVisible = (id: string) => !visibility?.providers || visibility.providers.includes(id)
  const models = catalog.models.filter(model => providerVisible(model.provider) &&
    (!Object.hasOwn(visibility?.models || {}, model.provider) || visibility.models[model.provider].includes(model.id)))
  return { ...catalog, models, providers: catalog.providers?.filter(provider => providerVisible(provider.id)) }
}

export function hermesCatalog(payload: any, profiles: string[]): RuntimeCatalog {
  if (!Array.isArray(payload?.providers)) throw new Error('Hermes returned an invalid provider catalog.')
  const providers: NonNullable<RuntimeCatalog['providers']> = []
  const models: RuntimeCatalog['models'] = []
  for (const row of payload.providers) {
    if (row.authenticated !== true || typeof row.slug !== 'string' || !row.slug) continue
    providers.push({ id: row.slug, name: typeof row.name === 'string' ? row.name : row.slug })
    for (const model of Array.isArray(row.models) ? row.models : []) {
      const id = typeof model === 'string' ? model : model?.id
      if (typeof id !== 'string' || !id || models.some(m => m.provider === row.slug && m.id === id)) continue
      models.push({ provider: row.slug, id, name: typeof model?.name === 'string' ? model.name : id })
    }
  }
  return { agents: [], profiles, providers, models, ...(typeof payload.provider === 'string' && typeof payload.model === 'string' ? { defaults: { provider: payload.provider, model: payload.model } } : {}) }
}

export function opencodeCatalog(payload: any, agents: any): RuntimeCatalog {
  if (!Array.isArray(payload?.all) || !Array.isArray(payload?.connected) || !Array.isArray(agents)) throw new Error('OpenCode returned an invalid provider catalog.')
  const connected = payload.all.filter((p: any) => payload.connected.includes(p.id))
  return {
    profiles: [], agents: agents.filter((a: any) => a.mode !== 'subagent' && !a.hidden).map((a: any) => a.name),
    providers: connected.map((p: any) => ({ id: p.id, name: p.name || p.id })),
    models: connected.flatMap((p: any) => Object.values(p.models || {}).map((m: any) => ({ provider: p.id, id: m.id, name: m.name || m.id, vision: m.modalities?.input?.includes('image') ?? m.capabilities?.input?.image ?? false }))),
  }
}
