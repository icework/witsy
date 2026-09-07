import { onBeforeUnmount, ref, watch } from 'vue'
import useIpcListener from './ipc_listener'
import { RuntimeBinding, RuntimeCatalog } from '../../types/runtime'

export default function useRuntimeCatalog(binding: () => RuntimeBinding | undefined) {
  const catalog = ref<RuntimeCatalog>({ providers: [], profiles: [], agents: [], models: [] })
  const loading = ref(false)
  const error = ref('')
  let revision = 0
  const reload = async (refresh = false) => {
    const current = binding()
    const request = ++revision
    error.value = ''
    catalog.value = { providers: [], profiles: [], agents: [], models: [] }
    if (!current?.connectionId) { loading.value = false; return }
    loading.value = true
    try {
      const result = await window.api.runtime.catalog({ ...current }, refresh ? { refresh: true } : undefined)
      if (request === revision) catalog.value = result
    } catch (e) {
      if (request === revision) error.value = e instanceof Error ? e.message : String(e)
    } finally { if (request === revision) loading.value = false }
  }
  watch(() => {
    const b = binding()
    return JSON.stringify([b?.kind, b?.connectionId, b?.profile, b?.directory])
  }, () => { void reload() }, { immediate: true })
  const { onIpcEvent } = useIpcListener()
  onIpcEvent('runtime-connections-changed', () => { void reload() })
  onBeforeUnmount(() => { revision++ })
  return { catalog, loading, error, reload }
}
