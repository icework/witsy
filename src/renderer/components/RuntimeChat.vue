<template>
  <section class="runtime-chat form form-large">
    <div v-if="configuration" class="runtime-row">
      <label>{{ t('runtime.target') }}
        <select v-model="selected" @change="selectConnection()" :disabled="busy">
          <option value="">{{ t('runtime.native') }}</option>
          <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <button @click="editConnections">{{ t('runtime.connections') }}</button>
    </div>
    <form v-if="configuration && editing" @submit.prevent="saveConnection()">
      <div class="runtime-row">
        <label>{{ t('runtime.type') }}<select v-model="draft.kind" @change="setDefaultEndpoint"><option value="hermes">Hermes</option><option value="opencode">OpenCode</option></select></label>
        <label>{{ t('runtime.name') }}<input v-model="draft.name" required /></label>
        <label>{{ t('runtime.endpoint') }}<input v-model="draft.endpoint" required placeholder="http://127.0.0.1:8642" /></label>
      </div>
      <div class="runtime-row">
        <label v-if="draft.kind === 'hermes'">{{ t('runtime.profile') }}<input v-model="draft.defaultProfile" placeholder="default" /></label>
        <label>{{ draft.kind === 'hermes' ? t('runtime.apiKey') : t('runtime.password') }}<input v-model="secret" type="password" autocomplete="off" /></label>
        <button type="submit" :disabled="loading">{{ t('common.save') }}</button>
        <button v-if="draft.kind === 'hermes'" type="button" @click="saveConnection(true)" :disabled="loading">{{ t('runtime.localKey') }}</button>
        <button type="button" @click="newConnection">{{ t('runtime.add') }}</button>
      </div>
      <p>{{ t('runtime.credentials') }}</p>
    </form>
    <button v-if="configuration && !selected" @click="emit('bind')">{{ t('chatAgent.startNative') }}</button>
    <template v-if="selected">
      <template v-if="configuration">
      <div class="runtime-row">
        <label v-if="connection?.kind === 'hermes'">{{ t('runtime.profile') }}<input v-model="target.profile" list="runtime-profiles" :disabled="busy" placeholder="default" /></label>
        <datalist id="runtime-profiles"><option v-for="profile in catalog.profiles" :key="profile" :value="profile" /></datalist>
        <label v-if="connection?.kind === 'opencode'">{{ t('runtime.agent') }}<select v-model="target.agent" :disabled="busy"><option value="">{{ t('runtime.inherit') }}</option><option v-for="agent in catalog.agents" :key="agent" :value="agent">{{ agent }}</option></select></label>
        <label v-if="connection?.kind === 'opencode'">{{ t('runtime.directory') }}<input v-model="target.directory" :disabled="busy" :placeholder="t('runtime.inherit')" /></label>
        <span v-else>{{ t('runtime.hermesDirectory') }}</span>
        <button @click="loadCatalog" :disabled="loading || busy">{{ t('runtime.check') }}</button>
      </div>
      <div class="runtime-row">
        <template v-if="connection?.kind === 'hermes'">
          <label>{{ t('runtime.provider') }}<input v-model="target.provider" :disabled="busy" :placeholder="t('runtime.inherit')" /></label>
          <label>{{ t('runtime.model') }}<input v-model="target.model" :disabled="busy" :placeholder="t('runtime.inherit')" /></label>
        </template>
        <label v-else>{{ t('runtime.model') }}<input v-model="modelKey" list="runtime-models" @input="setModel" :disabled="busy" :placeholder="t('runtime.inherit')" /></label>
        <datalist id="runtime-models"><option v-for="model in modelSuggestions" :key="model.provider + '/' + model.id" :value="model.provider + '/' + model.id">{{ model.name }}</option></datalist>
        <button @click="applyTarget" :disabled="busy || loading">{{ t('runtime.useTarget') }}</button>
      </div>
      </template>
      <p v-if="!configuration && chat.runtime">{{ targetDescription }} <span v-if="chat.runtime.sessionId">· {{ t('runtime.session') }} {{ chat.runtime.sessionId }}</span></p>
      <p v-else-if="!configuration">{{ t('runtime.applyFirst') }}</p>
      <p v-if="run">{{ t('runtime.status.' + run.status) }} · {{ run.detail }}</p>
      <div v-if="run?.approval" class="runtime-approval">
        <strong>{{ t('runtime.approval') }}</strong>
        <pre>{{ run.approval.description }}</pre>
        <button v-for="choice in run.approval.choices" :key="choice" @click="approve(choice)" :disabled="loading">{{ t('runtime.choice.' + choice) }}</button>
      </div>
      <p v-if="chat.runtime && targetDirty">{{ t('runtime.applyFirst') }}</p>
      <form v-if="!configuration && chat.runtime && !targetDirty && !screenshotPending" @submit.prevent="send">
        <textarea v-model="prompt" :aria-label="t('runtime.message')" :placeholder="t('runtime.message')" rows="3" @keydown.enter.exact.prevent="send" />
        <div class="runtime-row">
          <button type="submit" :disabled="busy || !prompt.trim() || loading">{{ t('runtime.send') }}</button>
          <button v-if="busy" type="button" @click="cancel" :disabled="loading">{{ t('runtime.stop') }}</button>
          <span>{{ t('runtime.externalStorage') }}</span>
        </div>
      </form>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Chat from '@models/chat'
import Message from '@models/message'
import Attachment from '@models/attachment'
import { saveFileContents } from '@services/download'
import { store } from '@services/store'
import { t } from '@services/i18n'
import useIpcListener from '@composables/ipc_listener'
import { RuntimeBinding, RuntimeCatalog, RuntimeConnection, RuntimeRun } from '../../types/runtime'

const props = defineProps<{ chat: Chat; screenshotPending?: boolean; configuration?: boolean }>()
const emit = defineEmits<{ bind: [binding?: RuntimeBinding]; progress: [] }>()
const connections = ref<RuntimeConnection[]>([])
const selected = ref('')
const editing = ref(false)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const prompt = ref('')
const secret = ref('')
const draft = ref<RuntimeConnection>({ id: '', kind: 'hermes', name: 'Hermes', endpoint: 'http://127.0.0.1:8642' })
const target = ref<RuntimeBinding>({ connectionId: '', kind: 'hermes', profile: 'default' })
const catalog = ref<RuntimeCatalog>({ agents: [], profiles: [], models: [] })
const modelKey = ref('')
const modelSuggestions = computed(() => catalog.value.models.filter(m => `${m.provider}/${m.id}`.toLowerCase().includes(modelKey.value.toLowerCase())).slice(0, 30))
const run = ref<RuntimeRun | null>(null)
const tracked = new Map<string, { chat: Chat; message: Message; runId?: string }>()
const connection = computed(() => connections.value.find(c => c.id === selected.value))
const busy = computed(() => !!run.value && !['completed', 'failed', 'cancelled'].includes(run.value.status))
const targetDirty = computed(() => {
  const b = props.chat.runtime
  if (!b || selected.value !== b.connectionId) return true
  return (['profile', 'agent', 'provider', 'model', 'directory'] as const).some(key => (target.value[key] || '') !== (b[key] || ''))
})
const editConnections = () => {
  if (!editing.value && connection.value) draft.value = { ...connection.value }
  secret.value = ''
  editing.value = !editing.value
}
const targetDescription = computed(() => {
  const b = props.chat.runtime
  return b ? [b.kind, b.profile || b.agent, b.actualProvider || b.provider, b.actualModel || b.model || t('runtime.inherit')].filter(Boolean).join(' / ') : ''
})
const { onIpcEvent } = useIpcListener()
const attempt = async (fn: () => Promise<void>) => {
  error.value = ''; notice.value = ''; loading.value = true
  try { await fn() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { loading.value = false }
}
const persist = (chat: Chat, add = false) => {
  if (!chat.temporary) {
    if (!store.history.chats.some(c => c.uuid === chat.uuid)) {
      if (!add) return
      store.addChat(chat)
    }
    store.saveHistory()
  }
}
const receive = (next: RuntimeRun) => {
  if (props.chat?.uuid === next.chatId) {
    if (busy.value && selected.value === next.binding.connectionId) {
      target.value = { ...next.binding }
      modelKey.value = next.binding.provider && next.binding.model ? `${next.binding.provider}/${next.binding.model}` : ''
    }
    run.value = next
  }
  const item = tracked.get(next.chatId)
  if (!item) return
  const firstBinding = !item.chat.runtime?.sessionId && !!next.binding.sessionId
  item.chat.runtime = { ...next.binding }
  item.message.setText(next.text || (next.error ? next.error : ''))
  item.message.model = next.binding.actualModel || next.binding.model || next.binding.agent || next.binding.kind
  item.message.transient = !['completed', 'failed', 'cancelled'].includes(next.status)
  item.message.status = item.message.transient ? next.detail : undefined
  if (next.error && props.chat.uuid === next.chatId) error.value = next.error
  emit('progress')
  if (!item.message.transient || firstBinding) persist(item.chat)
}
onIpcEvent('runtime-run', receive)
onMounted(async () => { if (window.api.runtime) await attempt(async () => { connections.value = await window.api.runtime.list() }) })
watch(() => props.chat?.uuid, async () => {
  const chat = props.chat
  error.value = ''; notice.value = ''; prompt.value = ''; run.value = null
  selected.value = chat?.runtime?.connectionId || ''
  if (chat?.runtime) {
    target.value = { ...chat.runtime }
    modelKey.value = target.value.provider && target.value.model ? `${target.value.provider}/${target.value.model}` : ''
    void attempt(async () => {
      const options = await window.api.runtime.catalog({ ...chat.runtime })
      if (props.chat?.uuid === chat.uuid) catalog.value = options
    })
    const snapshot = await window.api.runtime.get(chat.uuid)
    if (snapshot) {
      const message = chat.lastMessage()
      if (message?.role === 'assistant') tracked.set(chat.uuid, { chat, message })
      receive(snapshot)
    }
  }
}, { immediate: true })
const newConnection = () => { draft.value = { id: '', kind: 'hermes', name: 'Hermes', endpoint: 'http://127.0.0.1:8642' }; secret.value = '' }
const setDefaultEndpoint = () => { draft.value.id = ''; draft.value.name = draft.value.kind === 'hermes' ? 'Hermes' : 'OpenCode'; draft.value.endpoint = draft.value.kind === 'hermes' ? 'http://127.0.0.1:8642' : 'http://127.0.0.1:4096' }
const selectConnection = () => {
  error.value = ''; notice.value = ''
  if (!connection.value) return
  draft.value = { ...connection.value }; secret.value = ''
  target.value = { connectionId: selected.value, kind: connection.value.kind, ...(connection.value.kind === 'hermes' ? { profile: connection.value.defaultProfile || 'default' } : {}) }
  catalog.value = { agents: [], profiles: [], models: [] }; modelKey.value = ''
  void loadCatalog()
}
const saveConnection = (local = false) => attempt(async () => {
  const saved = await window.api.runtime.save({ ...draft.value }, secret.value || undefined, local ? draft.value.defaultProfile || 'default' : undefined)
  secret.value = ''; connections.value = await window.api.runtime.list(); selected.value = saved.id; editing.value = false
  selectConnection()
})
const loadCatalog = () => attempt(async () => {
  catalog.value = await window.api.runtime.catalog({ ...target.value })
  notice.value = t('runtime.connected')
})
const setModel = () => {
  const slash = modelKey.value.indexOf('/')
  target.value.provider = slash > 0 ? modelKey.value.slice(0, slash) : undefined
  target.value.model = slash > 0 ? modelKey.value.slice(slash + 1) : undefined
}
const applyTarget = () => attempt(async () => {
  const options = await window.api.runtime.catalog({ ...target.value })
  if (target.value.kind === 'opencode' && modelKey.value && !options.models.some(m => `${m.provider}/${m.id}` === modelKey.value)) throw new Error(t('runtime.invalidModel'))
  const binding = { ...target.value }; delete binding.sessionId
  if (binding.kind === 'hermes') delete binding.directory
  emit('bind', binding)
})
const sendMessage = async (input?: string, images: string[] = []) => {
  if (input !== undefined) prompt.value = input
  if (busy.value || targetDirty.value || !prompt.value.trim() || !props.chat.runtime) return
  const chat = props.chat
  const text = prompt.value.trim()
  if (!chat.messages.length) chat.addMessage(new Message('system', ''))
  const userMessage = new Message('user', text)
  for (const image of images) {
    const mimeType = image.slice(5, image.indexOf(';'))
    const attachment = new Attachment(image.slice(image.indexOf(',') + 1), mimeType)
    if (!chat.temporary) {
      const url = saveFileContents(mimeType === 'image/png' ? 'png' : 'jpg', attachment.content)
      if (!url) throw new Error('Could not save the screenshot. Nothing was submitted.')
      attachment.url = url; attachment.filepath = url; attachment.saved = true
    }
    userMessage.attachments.push(attachment)
  }
  chat.addMessage(userMessage)
  const message = new Message('assistant')
  message.engine = chat.runtime.kind; message.model = chat.runtime.model || chat.runtime.kind
  chat.addMessage(message)
  chat.title ||= text.slice(0, 70)
  tracked.set(chat.uuid, { chat, message: chat.lastMessage() })
  run.value = { chatId: chat.uuid, id: '', binding: { ...chat.runtime }, text: '', detail: '', status: 'running' }
  prompt.value = ''; persist(chat, true)
  try { receive(await window.api.runtime.start(chat.uuid, { ...chat.runtime }, text, ...(images.length ? [images] : []))) }
  catch (e) { chat.lastMessage().transient = false; chat.lastMessage().setText(t('runtime.notSubmitted')); if (props.chat.uuid === chat.uuid) run.value = null; persist(chat); throw e }
}
const send = () => attempt(() => sendMessage())
defineExpose({ sendMessage, setPrompt: (text: string) => { prompt.value = text } })
const cancel = () => attempt(async () => { await window.api.runtime.cancel(props.chat.uuid) })
const approve = (choice: string) => attempt(async () => { if (run.value?.approval) await window.api.runtime.approve(props.chat.uuid, run.value.approval.id, choice) })
</script>

<style scoped>
.runtime-chat { width: 100%; font-size: var(--form-normal-font-size); }
.runtime-row { display: flex; flex-wrap: wrap; align-items: center; }
.runtime-row label { display: flex; flex-direction: column; flex: 1; }
.runtime-chat textarea { box-sizing: border-box; width: 100%; resize: vertical; }
.runtime-chat pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.runtime-chat [role='alert'] { color: var(--text-color); font-weight: bold; }
</style>
