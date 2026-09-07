<template>
  <div class="chat-configuration">
    <label class="runtime-control" :title="connections.find(c => c.id === runtimeKey)?.name || t('runtime.type')">
      <CpuIcon aria-hidden="true" />
      <select :aria-label="t('runtime.type')" :value="runtimeKey" :disabled="disabled" @change="changeRuntime">
        <option value="native">Native</option>
        <option v-if="!connections.some(c => c.kind === 'hermes')" disabled>{{ t('runtime.unconfigured', { name: 'Hermes' }) }}</option>
        <option v-if="!connections.some(c => c.kind === 'opencode')" disabled>{{ t('runtime.unconfigured', { name: 'OpenCode' }) }}</option>
        <option v-if="chat.runtime && !connections.some(c => c.id === chat.runtime.connectionId)" :value="runtimeKey" disabled>{{ chat.runtime.kind }}</option>
        <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}</option>
        <option value="configure-runtimes">{{ t('runtime.configureConnections') }}</option>
      </select>
      <ChevronDownIcon class="chevron" aria-hidden="true" />
    </label>
    <label class="provider-control" :title="chat.runtime ? `${externalProvider} — ${t('chatAgent.externalModelLocked')}` : nativeEngine ? manager.getEngineName(nativeEngine) : t('chatAgent.provider')">
      <GlobeIcon aria-hidden="true" />
      <select :aria-label="t('chatAgent.provider')" v-if="chat.runtime" :value="externalProvider" disabled><option :value="externalProvider">{{ externalProvider }}</option></select>
      <select :aria-label="t('chatAgent.provider')" v-else :value="nativeEngine || ''" :disabled="disabled" @change="changeProvider">
        <option value="" disabled>{{ t('chatAgent.provider') }}</option>
        <option v-for="engine in engines" :key="engine" :value="engine">{{ manager.getEngineName(engine) }}</option>
      </select>
      <ChevronDownIcon class="chevron" aria-hidden="true" />
    </label>
    <label class="model-control" :title="chat.runtime ? `${externalModel} — ${t('chatAgent.externalModelLocked')}` : models.find(m => m.id === chat.model)?.name || chat.model || t('runtime.model')">
      <BoxIcon aria-hidden="true" />
      <select :aria-label="t('runtime.model')" v-if="chat.runtime" :value="externalModel" disabled><option :value="externalModel">{{ externalModel }}</option></select>
      <select :aria-label="t('runtime.model')" v-else :value="nativeEngine ? chat.model || '' : ''" :disabled="disabled || !nativeEngine" @change="changeModel">
        <option value="" disabled>{{ t('runtime.model') }}</option>
        <option v-if="nativeEngine && chat.model && !models.some(m => m.id === chat.model)" :value="chat.model">{{ chat.model }}</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
      </select>
      <ChevronDownIcon class="chevron" aria-hidden="true" />
    </label>
  </div>
</template>
<script setup lang="ts">
import { BoxIcon, ChevronDownIcon, CpuIcon, GlobeIcon } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import Chat from '@models/chat'
import LlmFactory from '@services/llms/llm'
import { store } from '@services/store'
import { t } from '@services/i18n'
import useEventBus from '@composables/event_bus'
import { RuntimeBinding, RuntimeConnection } from '../../types/runtime'
const props = defineProps<{ chat: Chat; disabled?: boolean }>()
const emit = defineEmits<{ change: [config: { runtime?: RuntimeBinding; engine?: string; model?: string }] }>()
const manager = LlmFactory.manager(store.config)
const connections = ref<RuntimeConnection[]>([])
const engines = computed(() => manager.getChatEngines().filter(engine => manager.isEngineConfigured(engine) && !!manager.getEngineName(engine)))
const nativeEngine = computed(() => engines.value.includes(props.chat.engine) ? props.chat.engine : '')
const models = computed(() => nativeEngine.value ? manager.getChatModels(nativeEngine.value) : [])
const runtimeKey = computed(() => props.chat.runtime?.connectionId || 'native')
const externalProvider = computed(() => props.chat.runtime?.actualProvider || props.chat.runtime?.provider || t('runtime.inherit'))
const externalModel = computed(() => props.chat.runtime?.actualModel || props.chat.runtime?.model || t('runtime.inherit'))
const load = async () => { connections.value = await window.api.runtime.list() }
const { onBusEvent } = useEventBus()
onBusEvent('chat-agent-settings-changed', () => { void load() })
onMounted(load)
const changeRuntime = (event: Event) => {
  const id = (event.target as HTMLSelectElement).value
  if (id === 'configure-runtimes') {
    (event.target as HTMLSelectElement).value = runtimeKey.value
    window.api.settings.open({ initialTab: 'runtimeconnections' })
    return
  }
  if (id === 'native') {
    const defaults = manager.getChatEngineModel()
    emit('change', { engine: props.chat.engine || defaults.engine, model: props.chat.model || defaults.model })
  } else {
    const connection = connections.value.find(c => c.id === id)
    if (connection) emit('change', { runtime: { kind: connection.kind, connectionId: id, ...(connection.kind === 'hermes' ? { profile: connection.defaultProfile || 'default' } : {}) } })
  }
}
const changeProvider = (event: Event) => {
  const engine = (event.target as HTMLSelectElement).value
  emit('change', { engine, model: manager.getChatModels(engine)[0]?.id || '' })
}
const changeModel = (event: Event) => emit('change', { engine: props.chat.engine, model: (event.target as HTMLSelectElement).value })
</script>
<style scoped>
.chat-configuration {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1 1 0;
  gap: var(--space-2);
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
}
label {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: var(--space-3);
  min-width: 0;
  max-width: calc(var(--space-32) * 3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  color: var(--dimmed-text-color);
  background: var(--background-color-light);
}
label:hover { background: var(--control-button-active-bg-color); }
label:focus-within { outline: var(--space-1) solid var(--highlight-color); outline-offset: var(--space-1); }
.model-control { flex-shrink: 1; max-width: calc(var(--space-32) * 4); }
svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.chevron { width: var(--space-6); height: var(--space-6); pointer-events: none; opacity: 0.65; }
select {
  appearance: none;
  field-sizing: content;
  width: auto;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  padding-right: 0 !important;
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  cursor: pointer;
  outline: none;
  box-shadow: none;
}
select:disabled { cursor: default; color: var(--faded-text-color); }
label:has(select:disabled) .chevron { display: none; }
@container chat-composer (max-width: 540px) {
  label > svg:first-child { display: none; }
}
@container chat-composer (max-width: 420px) {
  .chat-configuration { flex: 1 1 100% !important; order: -1; justify-content: flex-start; }
  label { flex: 1 1 0; }
  .model-control { flex-grow: 1.4; }
  label > svg:first-child { display: none; }
  select { flex: 1; width: 100%; }
}

</style>
