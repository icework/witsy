<template>
    <form class="chat-agent-editor form form-large" @submit.prevent="save">
      <div class="agent-row">
        <label>{{ t('chatAgent.name') }}<input v-model="draft.name" required /></label>
        <label>{{ t('runtime.type') }}<select v-model="draft.kind" @change="changeKind"><option value="native">Native</option><option value="hermes">Hermes</option><option value="opencode">OpenCode</option></select></label>
      </div>
      <label>{{ t('chatAgent.description') }}<textarea v-model="draft.description" rows="2" /></label>
      <template v-if="draft.kind === 'native'">
        <div class="agent-row">
          <label>{{ t('runtime.provider') }}<select v-model="native.engine" @change="native.model = ''"><option v-for="engine in engines" :key="engine" :value="engine">{{ manager.getEngineName(engine) }}</option></select></label>
          <label>{{ t('runtime.model') }}<select v-model="native.model" required><option value="">{{ t('runtime.model') }}</option><option v-for="model in nativeModels" :key="model.id" :value="model.id">{{ model.name }}</option></select></label>
        </div>
        <label>{{ t('chatAgent.instructions') }}<textarea v-model="native.instructions" rows="3" /></label>
        <label>{{ t('chatAgent.tools') }}<input v-model="toolIds" :placeholder="t('chatAgent.toolsHelp')" /></label>
        <p>{{ t('chatAgent.toolsHelp') }}</p>
      </template>
      <template v-else>
        <div class="agent-row">
          <label>{{ t('runtime.connections') }}<select v-model="binding.connectionId" @change="connectionChanged" required><option value="">{{ t('runtime.connections') }}</option><option v-for="c in matchingConnections" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label v-if="draft.kind === 'hermes'">{{ t('runtime.profile') }}<input v-model="binding.profile" placeholder="default" /></label>
          <label v-else>{{ t('runtime.agent') }}<select v-model="binding.agent"><option value="">{{ t('runtime.inherit') }}</option><option v-for="agent in catalog.agents" :key="agent" :value="agent">{{ agent }}</option></select></label>
          <button type="button" @click="check">{{ t('runtime.check') }}</button>
        </div>
        <div class="agent-row">
          <label>{{ t('runtime.provider') }}<input v-model="binding.provider" :placeholder="t('runtime.inherit')" /></label>
          <label>{{ t('runtime.model') }}<input v-model="binding.model" :placeholder="t('runtime.inherit')" /></label>
          <label v-if="draft.kind === 'opencode'">{{ t('runtime.directory') }}<input v-model="binding.directory" :placeholder="t('runtime.inherit')" /></label>
        </div>
        <p>{{ draft.kind === 'hermes' ? t('runtime.hermesDirectory') : t('runtime.externalStorage') }}</p>
        <p v-if="!matchingConnections.length">{{ t('chatAgent.connectionHelp') }}</p>
      </template>
      <div class="agent-row">
        <button type="submit" :disabled="working">{{ t('common.save') }}</button>
        <button v-if="draft.id" type="button" @click="remove">{{ t('common.delete') }}</button>
        <button type="button" @click="reset">{{ t('common.cancel') }}</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
    </form>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChatAgent } from '../../types/chat_agent'
import { RuntimeBinding, RuntimeCatalog, RuntimeConnection } from '../../types/runtime'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
const props = defineProps<{ agent: ChatAgent | null }>()
const emit = defineEmits<{ saved: [agent: ChatAgent]; removed: [id: string] }>()
const manager = LlmFactory.manager(store.config)
const draft = ref<ChatAgent>({ id: '', name: '', kind: 'native' })
const native = ref<NonNullable<ChatAgent['native']>>({ engine: '', model: '', tools: [] })
const binding = ref<RuntimeBinding>({ kind: 'hermes', connectionId: '', profile: 'default' })
const toolIds = ref('none')
const connections = ref<RuntimeConnection[]>([])
const catalog = ref<RuntimeCatalog>({ agents: [], profiles: [], models: [] })
const working = ref(false), error = ref(''), notice = ref('')
const engines = computed(() => manager.getChatEngines())
const nativeModels = computed(() => native.value.engine ? manager.getChatModels(native.value.engine) : [])
const matchingConnections = computed(() => connections.value.filter(c => c.kind === draft.value.kind))
const attempt = async (action: () => Promise<void>) => {
  working.value = true; error.value = ''; notice.value = ''
  try { await action() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
const changeKind = () => { binding.value = { connectionId: '', kind: draft.value.kind === 'opencode' ? 'opencode' : 'hermes', profile: draft.value.kind === 'hermes' ? 'default' : undefined }; catalog.value = { agents: [], profiles: [], models: [] } }
const check = () => attempt(async () => { catalog.value = await window.api.runtime.catalog({ ...binding.value }); notice.value = t('runtime.connected') })
const connectionChanged = () => { binding.value.profile = connections.value.find(c => c.id === binding.value.connectionId)?.defaultProfile || 'default'; void check() }
const reset = () => attempt(async () => {
  draft.value = props.agent ? JSON.parse(JSON.stringify(props.agent)) : { id: '', name: '', kind: 'native' }
  const engine = store.config.llm.engine
  native.value = draft.value.native || { engine, model: store.config.engines[engine]?.model?.chat || '', tools: [] }
  toolIds.value = native.value.tools === null ? '*' : native.value.tools?.join(', ') || 'none'
  changeKind()
  if (draft.value.binding) binding.value = { ...draft.value.binding }
  connections.value = await window.api.runtime.list()
  if (binding.value.connectionId && draft.value.kind !== 'native') catalog.value = await window.api.runtime.catalog({ ...binding.value })
})
watch(() => props.agent, reset, { immediate: true })
const save = () => attempt(async () => {
  if (draft.value.kind !== 'native') await window.api.runtime.catalog({ ...binding.value })
  const tools = toolIds.value.trim() === '*' ? null : !toolIds.value.trim() || toolIds.value.trim() === 'none' ? [] : toolIds.value.split(',').map(s => s.trim()).filter(Boolean)
  const saved = await window.api.chatAgents.save(JSON.parse(JSON.stringify({ ...draft.value, native: draft.value.kind === 'native' ? { ...native.value, tools } : undefined, binding: draft.value.kind === 'native' ? undefined : { ...binding.value } })))
  emit('saved', saved)
})
const remove = () => attempt(async () => { await window.api.chatAgents.remove(draft.value.id); emit('removed', draft.value.id) })
</script>
<style scoped>
.agent-row { display: flex; flex-wrap: wrap; align-items: end; gap: var(--form-normal-font-size); }
.agent-row label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.chat-agent-editor > label { display: flex; flex-direction: column; margin-block: var(--form-normal-font-size); }
.chat-agent-editor textarea { width: 100%; box-sizing: border-box; }
</style>
