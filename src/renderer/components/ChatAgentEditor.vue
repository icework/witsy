<template>
    <form class="chat-agent-editor agent-form" @submit.prevent="save">
      <section class="form-section">
      <div class="agent-row">
        <label>{{ t('chatAgent.name') }}<input v-model="draft.name" required /></label>
        <label>{{ t('runtime.type') }}<select v-model="draft.kind" @change="changeKind"><option value="native">Native</option><option value="hermes">Hermes</option><option value="opencode">OpenCode</option></select></label>
      </div>
      <label>{{ t('chatAgent.description') }}<textarea v-model="draft.description" rows="2" /></label>
      </section>
      <section class="form-section">
      <h3>{{ t('agentDesign.behavior') }}</h3>
      <template v-if="draft.kind === 'native'">
        <div class="agent-row">
          <label>{{ t('chatAgent.provider') }}<select v-model="native.engine" :aria-label="t('chatAgent.provider')" @change="native.model = ''" required><option value="" disabled>{{ t('chatAgent.provider') }}</option><option v-if="native.engine && !engines.includes(native.engine)" :value="native.engine" disabled>{{ t('runtimeModels.unavailable') }}</option><option v-for="engine in engines" :key="engine" :value="engine">{{ manager.getEngineName(engine) }}</option></select></label>
          <label>{{ t('runtime.model') }}<select v-model="native.model" required><option value="">{{ t('runtime.model') }}</option><option v-if="native.model && !nativeModels.some(model => model.id === native.model)" :value="native.model" disabled>{{ t('runtimeModels.unavailable') }}</option><option v-for="model in nativeModels" :key="model.id" :value="model.id">{{ model.name }}</option></select></label>
        </div>
        <label>{{ t('chatAgent.instructions') }}<textarea v-model="native.instructions" rows="3" /></label>
        <label>{{ t('chatAgent.tools') }}<input v-model="toolIds" :placeholder="t('chatAgent.toolsHelp')" /></label>
        <p>{{ t('chatAgent.toolsHelp') }}</p>
      </template>
      <template v-else>
        <div class="agent-row">
          <label>{{ t('runtime.connections') }}<select v-model="binding.connectionId" :aria-label="t('runtime.connections')" :disabled="working" @change="connectionChanged" required><option value="">{{ t('runtime.connections') }}</option><option v-if="binding.connectionId && !selectedConnection" :value="binding.connectionId" disabled>{{ working ? t('runtimeModels.loading') : t('chatAgent.connectionUnavailable') }}</option><option v-for="c in matchingConnections" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label v-if="draft.kind === 'opencode'">{{ t('runtime.agent') }}<select :value="binding.agent || ''" @change="binding.agent = ($event.target as HTMLSelectElement).value || undefined"><option value="">{{ t('runtime.inherit') }}</option><option v-for="agent in catalog.agents" :key="agent" :value="agent">{{ agent }}</option></select></label>
          <button type="button" :disabled="working || catalogLoading || !selectedConnection" @click="check">{{ t('runtime.check') }}</button>
        </div>
        <p v-if="draft.kind === 'hermes' && selectedConnection" class="inherited-profile">{{ t('chatAgent.profileFromConnection', { profile: effectiveBinding.profile }) }}</p>
        <RuntimeModelPicker :binding="effectiveBinding" :catalog="catalog" :loading="catalogLoading" :error="catalogError" :disabled="working || !selectedConnection" @change="chooseModel" @refresh="reloadCatalog(true)" />
        <div class="agent-row">
          <label v-if="draft.kind === 'opencode'">{{ t('runtime.directory') }}<input v-model.lazy="binding.directory" :placeholder="t('runtime.inherit')" /></label>
        </div>
        <p>{{ draft.kind === 'hermes' ? t('runtime.hermesDirectory') : t('runtime.externalStorage') }}</p>
        <p v-if="!matchingConnections.length">{{ t('chatAgent.connectionHelp') }}</p>
      </template>
      </section>
      <div class="form-actions">
        <button class="primary" type="submit" :disabled="working || (draft.kind !== 'native' && !selectedConnection)">{{ t('common.save') }}</button>
        <button type="button" @click="reset">{{ t('common.cancel') }}</button>
        <button class="danger" v-if="draft.id" type="button" @click="remove">{{ t('common.delete') }}</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
    </form>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChatAgent } from '../../types/chat_agent'
import { RuntimeBinding, RuntimeConnection } from '../../types/runtime'
import useRuntimeCatalog from '@composables/runtime_catalog'
import useIpcListener from '@composables/ipc_listener'
import RuntimeModelPicker from './RuntimeModelPicker.vue'
import { store } from '@services/store'
import { t } from '@services/i18n'
import { connectionBinding } from '@services/runtime_defaults'
import { nativeDefault, nativeModels as visibleNativeModels, nativeProviders } from '@services/native_models'
import LlmFactory from '@services/llms/llm'
const props = defineProps<{ agent: ChatAgent | null }>()
const emit = defineEmits<{ saved: [agent: ChatAgent]; removed: [id: string] }>()
const manager = LlmFactory.manager(store.config)
const draft = ref<ChatAgent>({ id: '', name: '', kind: 'native' })
const native = ref<NonNullable<ChatAgent['native']>>({ engine: '', model: '', tools: [] })
const binding = ref<RuntimeBinding>({ kind: 'hermes', connectionId: '', profile: 'default' })
const toolIds = ref('none')
const connections = ref<RuntimeConnection[]>([])
const matchingConnections = computed(() => connections.value.filter(c => c.kind === draft.value.kind))
const selectedConnection = computed(() => matchingConnections.value.find(c => c.id === binding.value.connectionId))
const effectiveBinding = computed<RuntimeBinding>(() => draft.value.kind === 'hermes' && selectedConnection.value
  ? { ...binding.value, profile: selectedConnection.value.defaultProfile || 'default' }
  : binding.value)
const { catalog, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useRuntimeCatalog(() => selectedConnection.value ? effectiveBinding.value : undefined)
const working = ref(false), error = ref(''), notice = ref('')
const engines = computed(() => nativeProviders(store.config, manager))
const nativeModels = computed(() => engines.value.includes(native.value.engine) ? visibleNativeModels(store.config, manager, native.value.engine) : [])
const attempt = async (action: () => Promise<void>) => {
  working.value = true; error.value = ''; notice.value = ''
  try { await action() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
const changeKind = () => { if (draft.value.kind === 'native') native.value = { ...native.value, ...nativeDefault(store.config, manager) }; binding.value = { connectionId: '', kind: draft.value.kind === 'opencode' ? 'opencode' : 'hermes', profile: draft.value.kind === 'hermes' ? 'default' : undefined } }
const check = () => attempt(async () => { await reloadCatalog(true); if (!catalogError.value) notice.value = t('runtime.connected') })
const connectionChanged = () => {
  binding.value = selectedConnection.value ? connectionBinding(selectedConnection.value) : { kind: binding.value.kind, connectionId: '' }
}
const chooseModel = (choice: { provider?: string; model?: string }) => {
  binding.value = { ...binding.value, ...choice }
  delete binding.value.sessionId; delete binding.value.actualModel; delete binding.value.actualProvider
}
const reset = () => attempt(async () => {
  draft.value = props.agent ? JSON.parse(JSON.stringify(props.agent)) : { id: '', name: '', kind: 'native' }
  changeKind()
  native.value = draft.value.native || { ...nativeDefault(store.config, manager), tools: [] }
  toolIds.value = native.value.tools === null ? '*' : native.value.tools?.join(', ') || 'none'
  if (draft.value.binding) binding.value = { ...draft.value.binding }
  connections.value = await window.api.runtime.list()
})
watch(() => props.agent, reset, { immediate: true })
const { onIpcEvent } = useIpcListener()
onIpcEvent('runtime-connections-changed', () => attempt(async () => { connections.value = await window.api.runtime.list() }))
const save = () => attempt(async () => {
  const target = { ...effectiveBinding.value }
  if (draft.value.kind !== 'native') {
    if (!selectedConnection.value) throw new Error(t('chatAgent.selectConnection'))
    await window.api.runtime.catalog(target)
  }
  const tools = toolIds.value.trim() === '*' ? null : !toolIds.value.trim() || toolIds.value.trim() === 'none' ? [] : toolIds.value.split(',').map(s => s.trim()).filter(Boolean)
  const saved = await window.api.chatAgents.save(JSON.parse(JSON.stringify({ ...draft.value, native: draft.value.kind === 'native' ? { ...native.value, tools } : undefined, binding: draft.value.kind === 'native' ? undefined : target })))
  emit('saved', saved)
})
const remove = () => attempt(async () => { await window.api.chatAgents.remove(draft.value.id); emit('removed', draft.value.id) })
</script>
