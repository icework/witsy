<template>
  <div class="chat-configuration">
    <button ref="trigger" type="button" class="model-trigger" :class="{ 'has-error': !!catalogError }" :title="summaryTitle" :aria-label="`${t('chat.modelConfiguration')}: ${runtimeLabel} · ${summaryLabel}`" aria-haspopup="dialog" :aria-expanded="expanded" :disabled="disabled" @click="togglePanel">
      <span class="runtime-label">{{ runtimeLabel }}</span><span class="model-separator" aria-hidden="true">·</span>
      <AlertCircleIcon v-if="catalogError" aria-hidden="true" />
      <span class="model-label">{{ summaryLabel }}</span><ChevronDownIcon class="chevron" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <section v-if="expanded" ref="panel" class="model-configuration-panel" role="dialog" :aria-label="t('chat.modelConfiguration')" :style="panelPosition">
        <header><h2>{{ t('chat.modelConfiguration') }}</h2><button type="button" :aria-label="t('common.close')" @click="closePanel(true)"><XIcon /></button></header>
        <label class="runtime-control">
          <span>{{ t('runtime.type') }}</span>
          <select :aria-label="t('runtime.type')" :value="runtimeKey" :disabled="disabled" @change="changeRuntime">
            <option value="native">Native</option>
            <option v-if="!connections.some(c => c.kind === 'hermes')" disabled>{{ t('runtime.unconfigured', { name: 'Hermes' }) }}</option>
            <option v-if="!connections.some(c => c.kind === 'opencode')" disabled>{{ t('runtime.unconfigured', { name: 'OpenCode' }) }}</option>
            <option v-if="chat.runtime && !connections.some(c => c.id === chat.runtime.connectionId)" :value="runtimeKey" disabled>{{ chat.runtime.kind }}</option>
            <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}</option>
            <option value="configure-runtimes">{{ t('runtime.configureConnections') }}</option>
          </select>
        </label>
        <RuntimeModelPicker v-if="chat.runtime" :binding="chat.runtime" :catalog="catalog" :loading="catalogLoading" :error="catalogError" :disabled="disabled" @change="changeExternalModel" @refresh="reloadCatalog(true)" />
        <template v-else>
          <label class="provider-control">
            <span>{{ t('chatAgent.provider') }}</span>
            <select :aria-label="t('chatAgent.provider')" :value="nativeEngine || ''" :disabled="disabled" @change="changeProvider">
              <option value="" disabled>{{ t('chatAgent.provider') }}</option>
              <option v-for="engine in engines" :key="engine" :value="engine">{{ manager.getEngineName(engine) }}</option>
            </select>
          </label>
          <label class="model-control" :title="models.find(m => m.id === chat.model)?.name || chat.model">
            <span>{{ t('runtime.model') }}</span>
            <select :aria-label="t('runtime.model')" :value="nativeEngine ? chat.model || '' : ''" :disabled="disabled || !nativeEngine" @change="changeModel">
              <option value="" disabled>{{ t('chat.chooseModel') }}</option>
              <option v-if="nativeEngine && chat.model && !models.some(m => m.id === chat.model)" :value="chat.model" disabled>{{ t('runtimeModels.unavailable') }}</option>
              <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
            </select>
          </label>
        </template>
      </section>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { AlertCircleIcon, ChevronDownIcon, XIcon } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch, type CSSProperties } from 'vue'
import Chat from '@models/chat'
import LlmFactory from '@services/llms/llm'
import { store } from '@services/store'
import { t } from '@services/i18n'
import { connectionBinding } from '@services/runtime_defaults'
import { nativeDefault, nativeModels, nativeProviders } from '@services/native_models'
import useEventBus from '@composables/event_bus'
import useEventListener from '@composables/event_listener'
import useIpcListener from '@composables/ipc_listener'
import useRuntimeCatalog from '@composables/runtime_catalog'
import RuntimeModelPicker from './RuntimeModelPicker.vue'
import { RuntimeBinding, RuntimeConnection } from '../../types/runtime'
const props = defineProps<{ chat: Chat; disabled?: boolean }>()
const emit = defineEmits<{ change: [config: { runtime?: RuntimeBinding; engine?: string; model?: string }] }>()
const manager = LlmFactory.manager(store.config)
const connections = ref<RuntimeConnection[]>([])
const engines = computed(() => nativeProviders(store.config, manager))
const nativeEngine = computed(() => engines.value.includes(props.chat.engine) ? props.chat.engine : '')
const models = computed(() => nativeEngine.value ? nativeModels(store.config, manager, nativeEngine.value) : [])
const runtimeKey = computed(() => props.chat.runtime?.connectionId || 'native')
const runtimeLabel = computed(() => props.chat.runtime ? { hermes: 'Hermes', opencode: 'OpenCode' }[props.chat.runtime.kind] : 'Native')
const { catalog, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useRuntimeCatalog(() => props.chat.runtime)
const summaryLabel = computed(() => {
  if (props.chat.runtime) {
    if (catalogLoading.value) return t('runtimeModels.loading')
    if (catalogError.value) return t('runtimeModels.loadFailed')
    const model = catalog.value.models.find(m => m.id === props.chat.runtime.model && m.provider === props.chat.runtime.provider)
    return model?.name || (props.chat.runtime.model ? t('runtimeModels.unavailable') : t('runtime.inherit'))
  }
  return models.value.find(m => m.id === props.chat.model)?.name || t('chat.chooseModel')
})
const summaryTitle = computed(() => [
  runtimeLabel.value,
  connections.value.find(c => c.id === runtimeKey.value)?.name,
  props.chat.runtime?.provider || (nativeEngine.value ? manager.getEngineName(nativeEngine.value) : ''),
  summaryLabel.value,
].filter((value, index, values) => !!value && values.indexOf(value) === index).join(' · '))
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const expanded = ref(false)
const panelPosition = ref<CSSProperties>({})
const closePanel = async (restoreFocus = false) => {
  expanded.value = false
  if (restoreFocus) { await nextTick(); trigger.value?.focus() }
}
const togglePanel = async () => {
  if (expanded.value) { void closePanel(); return }
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(360, window.innerWidth - 32)
  const above = rect.top >= 300
  panelPosition.value = {
    width: `${width}px`,
    left: `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`,
    ...(above ? { bottom: `${window.innerHeight - rect.top + 12}px`, maxHeight: `${rect.top - 28}px` } : { top: '16px', maxHeight: `${window.innerHeight - 32}px` }),
  }
  expanded.value = true
  await nextTick()
  panel.value?.querySelector<HTMLSelectElement>('select:not(:disabled)')?.focus()
}
const { onDomEvent } = useEventListener()
const onOutsideInteraction = (event: Event) => {
  const path = event.composedPath()
  if (expanded.value && !path.includes(panel.value) && !path.includes(trigger.value)) void closePanel()
}
onDomEvent(document, 'pointerdown', onOutsideInteraction)
// Accessibility activation can emit click without a preceding pointer event.
onDomEvent(document, 'click', onOutsideInteraction)
onDomEvent(document, 'focusin', onOutsideInteraction)
onDomEvent(document, 'keydown', (event: KeyboardEvent) => {
  if (expanded.value && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault(); event.stopPropagation(); void closePanel(true)
  }
})
onDomEvent(window, 'resize', () => { void closePanel() })
watch(() => props.disabled, disabled => { if (disabled) void closePanel() })
const load = async () => { connections.value = await window.api.runtime.list() }
const { onBusEvent } = useEventBus()
onBusEvent('chat-agent-settings-changed', () => { void load() })
const { onIpcEvent } = useIpcListener()
onIpcEvent('runtime-connections-changed', () => { void load() })
onMounted(load)
const changeRuntime = (event: Event) => {
  const id = (event.target as HTMLSelectElement).value
  if (id === 'configure-runtimes') {
    (event.target as HTMLSelectElement).value = runtimeKey.value
    window.api.settings.open({ initialTab: 'runtimeconnections' })
    return
  }
  if (id === 'native') {
    emit('change', nativeDefault(store.config, manager))
  } else {
    const connection = connections.value.find(c => c.id === id)
    if (connection) emit('change', { runtime: connectionBinding(connection) })
  }
}
const changeProvider = (event: Event) => {
  const engine = (event.target as HTMLSelectElement).value
  emit('change', { engine, model: nativeModels(store.config, manager, engine)[0]?.id || '' })
}
const changeModel = (event: Event) => emit('change', { engine: props.chat.engine, model: (event.target as HTMLSelectElement).value })
const changeExternalModel = (choice: { provider?: string; model?: string }) => {
  const runtime = { ...props.chat.runtime, ...choice }
  delete runtime.sessionId; delete runtime.actualModel; delete runtime.actualProvider
  emit('change', { runtime })
}
</script>
<style scoped>
.chat-configuration { display: flex; align-items: center; justify-content: flex-end; flex: 1 1 0; min-width: 0; max-width: 100%; margin-left: auto; }
.model-trigger { display: inline-flex; align-items: center; gap: var(--space-4); min-width: 0; max-width: min(100%, calc(var(--space-32) * 5)); min-height: var(--space-16); padding: var(--space-2) var(--space-4); margin: 0; border: none; border-radius: var(--radius-lg); background: transparent; color: var(--faded-text-color); font-size: var(--font-size-13); font-weight: var(--font-weight-medium); }
.model-trigger .runtime-label { flex-shrink: 0; white-space: nowrap; color: var(--text-color); font-weight: var(--font-weight-semibold); }
.model-trigger .model-separator { flex-shrink: 0; color: var(--faded-text-color); }
.model-trigger .model-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-trigger svg { flex-shrink: 0; width: var(--icon-md); height: var(--icon-md); }
.model-trigger .chevron { width: var(--space-6); height: var(--space-6); }
.model-trigger:hover:not(:disabled), .model-trigger[aria-expanded=true] { background: var(--color-surface-low); color: var(--text-color); }
.model-trigger.has-error { color: var(--color-error); }
.model-trigger:disabled { color: var(--faded-text-color); background: transparent; }
.model-trigger:focus-visible, .model-configuration-panel :deep(:is(select, button):focus-visible) { outline: var(--space-1) solid var(--color-focus); outline-offset: var(--space-1); }
.model-configuration-panel { position: fixed; z-index: 1100; display: flex; flex-direction: column; gap: var(--space-8); box-sizing: border-box; overflow-y: auto; padding: var(--space-8); border: var(--space-px) solid var(--color-outline-variant); border-radius: var(--radius-xl); background: var(--color-surface-lowest); color: var(--text-color); box-shadow: var(--shadow-menu); }
.model-configuration-panel header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); }
.model-configuration-panel h2 { margin: 0; font-size: var(--font-size-14); font-weight: var(--font-weight-semibold); }
.model-configuration-panel header button { display: grid; place-items: center; flex-shrink: 0; width: var(--space-16); height: var(--space-16); margin: 0; padding: var(--space-4); border: none; border-radius: var(--radius-lg); background: transparent; color: var(--faded-text-color); }
.model-configuration-panel header button svg { width: var(--icon-md); height: var(--icon-md); }
.model-configuration-panel :deep(.runtime-model-picker) { display: contents; }
.model-configuration-panel :deep(label) { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; flex: 0 0 auto; font-size: var(--font-size-12); color: var(--faded-text-color); }
.model-configuration-panel :deep(select) { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--space-20); margin: 0; padding: var(--space-4) var(--space-6); border: var(--space-px) solid var(--color-outline-variant); border-radius: var(--radius-lg); background: var(--color-surface-low); color: var(--text-color); font-family: inherit; font-size: var(--font-size-14); text-overflow: ellipsis; }
.model-configuration-panel :deep(select:disabled) { color: var(--faded-text-color); }
</style>
