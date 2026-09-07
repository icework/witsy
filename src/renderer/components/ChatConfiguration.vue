<template>
  <div class="chat-configuration agent-row">
    <label>{{ t('runtime.type') }}
      <select :value="runtimeKey" :disabled="disabled" @change="changeRuntime">
        <option value="native">Native</option>
        <option v-if="chat.runtime && !connections.some(c => c.id === chat.runtime.connectionId)" :value="runtimeKey" disabled>{{ chat.runtime.kind }}</option>
        <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.kind === 'hermes' ? 'Hermes' : 'OpenCode' }} · {{ connection.name }}</option>
      </select>
    </label>
    <label>{{ t('chatAgent.provider') }}
      <select v-if="chat.runtime" :value="externalProvider" disabled><option :value="externalProvider">{{ externalProvider }}</option></select>
      <select v-else :value="nativeEngine" :disabled="disabled" @change="changeProvider">
        <option value="" disabled>{{ t('chatAgent.provider') }}</option>
        <option v-for="engine in engines" :key="engine" :value="engine">{{ manager.getEngineName(engine) }}</option>
      </select>
    </label>
    <label>{{ t('runtime.model') }}
      <select v-if="chat.runtime" :value="externalModel" disabled><option :value="externalModel">{{ externalModel }}</option></select>
      <select v-else :value="nativeEngine ? chat.model || '' : ''" :disabled="disabled || !nativeEngine" @change="changeModel">
        <option value="" disabled>{{ t('runtime.model') }}</option>
        <option v-if="nativeEngine && chat.model && !models.some(m => m.id === chat.model)" :value="chat.model">{{ chat.model }}</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
      </select>
    </label>
    <small v-if="chat.runtime">{{ t('chatAgent.externalModelLocked') }}</small>
  </div>
</template>
<script setup lang="ts">
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
const engines = computed(() => manager.getChatEngines({ favorites: false }).filter(engine => manager.isEngineConfigured(engine)))
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
.chat-configuration { display: flex; flex-wrap: wrap; gap: var(--form-normal-font-size); margin-block: var(--form-normal-font-size); }
label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
select { width: 100%; }
small { flex-basis: 100%; color: var(--dimmed-text-color); }
</style>
