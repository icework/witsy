<template>
  <section class="chat-agent-picker form form-large">
    <div class="agent-row">
      <label>{{ t('chatAgent.label') }}
        <select v-model="selected" @change="choose" :disabled="busy || state.busy || state.capturing">
          <option value="" disabled>{{ chat.chatAgent?.name || t('chatAgent.chooseAgent') }}</option>
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{ agent.kind }})</option>
        </select>
      </label>
      <button @click="capture" :disabled="busy || state.busy || state.capturing || pending">{{ t('chatAgent.capture') }}</button>
      <button @click="addText" :disabled="busy || state.busy || state.capturing || pending">{{ t('contextWorkflow.addText') }}</button>
      <template v-if="state.compact">
        <button @click="window.api.chatAgents.screenshotUpdate({ expand: true })">{{ t('chatAgent.expand') }}</button>
        <button @click="window.api.chatAgents.screenshotUpdate({ hide: true })">{{ t('chatAgent.hide') }}</button>
      </template>
    </div>
    <ChatConfiguration :chat="chat" :disabled="busy || state.busy || state.capturing" @change="emit('configure', $event)" />
    <div v-if="pending" class="screenshot-preview">
      <div v-if="state.image" class="screenshot-attachment">
        <img :src="state.image" :alt="t('chatAgent.preview')" />
        <button type="button" @click="removeScreenshot" :disabled="working || busy || state.busy">{{ t('chatAgent.removeScreenshot') }}</button>
      </div>
      <strong v-if="state.workflowName">{{ state.workflowName }}</strong>
      <p>{{ state.image ? t('chatAgent.previewHelp') : t('contextWorkflow.previewHelp') }}</p>
      <form @submit.prevent="ask">
        <textarea v-if="state.contextKind === 'selected-text'" v-model="contextText" :aria-label="t('contextWorkflow.selected-text')" rows="4" maxlength="64000" />
        <textarea v-model="question" :aria-label="t(state.contextKind === 'selected-text' ? 'contextWorkflow.prompt' : 'chatAgent.question')" rows="2" />
        <label><input type="checkbox" v-model="temporary" :disabled="chat.hasMessages()" /> {{ t('chatAgent.temporary') }}</label>
        <div class="agent-row">
          <button type="submit" :disabled="working || busy || state.busy || !question.trim()">{{ t('chatAgent.ask') }}</button>
          <button v-if="state.image" type="button" @click="retake" :disabled="working">{{ t('chatAgent.retake') }}</button>
          <button type="button" @click="window.api.chatAgents.screenshotUpdate({ dismiss: true })">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </div>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Chat from '@models/chat'
import ChatConfiguration from './ChatConfiguration.vue'
import { RuntimeBinding } from '../../types/runtime'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
import useIpcListener from '@composables/ipc_listener'
import useEventBus from '@composables/event_bus'
import { ChatAgent, ScreenshotState } from '../../types/chat_agent'
const props = defineProps<{ chat: Chat; busy?: boolean }>()
const emit = defineEmits<{ select: [agent: ChatAgent]; ask: [payload: { agent: ChatAgent; image?: string; text?: string; question: string; temporary: boolean }]; compact: [state: ScreenshotState]; removedScreenshot: [question: string]; configure: [config: { runtime?: RuntimeBinding; engine?: string; model?: string }] }>()
const window = globalThis.window
const manager = LlmFactory.manager(store.config)
const agents = ref<ChatAgent[]>([])
const selected = ref(''), question = ref(''), contextText = ref(''), error = ref('')
const working = ref(false), temporary = ref(false)
let retaking = false
const state = ref<ScreenshotState>({ capturing: false, compact: false, busy: false })
const pending = computed(() => !!state.value.image || state.value.contextKind === 'selected-text')
const attempt = async (action: () => Promise<void>) => {
  error.value = ''; working.value = true
  try { await action() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
const receive = (next: ScreenshotState) => {
  if (!next.capturing && (next.image || next.contextKind === 'selected-text') && (next.requestId !== state.value.requestId || next.image !== state.value.image || next.contextKind !== state.value.contextKind || state.value.capturing)) {
    if (!retaking) {
      const agent = agents.value.find(a => a.id === next.agentId)
      if (agent) { selected.value = agent.id; emit('select', agent) }
      temporary.value = agent ? false : props.chat.temporary
      question.value = next.prompt ?? (next.contextKind === 'selected-text' ? t('contextWorkflow.defaultTextPrompt') : '')
      contextText.value = next.contextText || ''
    }
  }
  if (!next.capturing) retaking = false
  state.value = next; emit('compact', next)
}
const { onIpcEvent } = useIpcListener()
onIpcEvent('screenshot-state', receive)
const { onBusEvent } = useEventBus()
onBusEvent('chat-agent-settings-changed', () => { void reload() })
const reload = () => attempt(async () => {
  if (!window.api.chatAgents) return
  agents.value = await window.api.chatAgents.list()
  receive(await window.api.chatAgents.screenshotState())
})
onMounted(reload)
watch(() => props.chat?.uuid, () => { selected.value = props.chat?.chatAgent?.id || '' }, { immediate: true })
const choose = () => { const agent = agents.value.find(a => a.id === selected.value); if (agent) emit('select', agent) }
const capture = () => attempt(async () => { await window.api.chatAgents.capture() })
const removeScreenshot = () => attempt(async () => {
  if (!state.value.image || props.busy || state.value.busy) return
  await window.api.chatAgents.screenshotUpdate({ dismiss: true })
  receive({ ...state.value, image: undefined, contextKind: undefined, contextText: undefined, error: undefined })
  emit('removedScreenshot', question.value)
})
const retake = () => { retaking = true; void attempt(async () => { await window.api.chatAgents.capture(true) }) }
const addText = () => attempt(async () => { await window.api.chatAgents.screenshotUpdate({ manualText: true }) })
const ask = () => attempt(async () => {
  if (props.busy || state.value.busy || !pending.value || !question.value.trim()) return
  const chat = props.chat
  const agent: ChatAgent = {
    id: chat.chatAgent?.id || '', name: chat.chatAgent?.name || '', kind: chat.runtime?.kind || 'native',
    ...(chat.runtime ? { binding: { ...chat.runtime } } : { native: { engine: chat.engine, model: chat.model, instructions: chat.instructions, tools: chat.tools, modelOpts: chat.modelOpts } }),
  }
  if (state.value.contextKind === 'selected-text' && !contextText.value.trim()) throw new Error(t('contextWorkflow.emptySelection'))
  if (state.value.image && agent.kind === 'native') {
    if (!manager.getChatModel(agent.native.engine, agent.native.model)?.capabilities?.vision) throw new Error(t('chatAgent.noVision'))
  } else if (agent.kind !== 'native') {
    const options = await window.api.runtime.catalog({ ...agent.binding })
    if (state.value.image && agent.kind === 'opencode' && (!agent.binding.model || !agent.binding.provider)) throw new Error(t('chatAgent.explicitModel'))
    if (state.value.image && agent.kind === 'opencode' && !options.models.some(m => m.provider === agent.binding.provider && m.id === agent.binding.model && m.vision)) throw new Error(t('chatAgent.noVision'))
  }
  emit('ask', { agent, ...(state.value.image ? { image: state.value.image } : { text: contextText.value }), question: question.value.trim(), temporary: temporary.value })
})
defineExpose({ reload, reportError: (message: string) => { error.value = message } })
</script>
<style scoped>
.chat-agent-picker { padding: var(--form-normal-font-size); font-size: var(--form-normal-font-size); }
.agent-row { display: flex; flex-wrap: wrap; align-items: end; gap: var(--control-border-radius); }
.agent-row label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.agent-row > label:first-child { flex-basis: calc(var(--form-normal-font-size) * 16); }
.chat-agent-picker textarea { width: 100%; box-sizing: border-box; }
.screenshot-preview img { display: block; max-width: 100%; max-height: calc(var(--form-normal-font-size) * 14); object-fit: contain; }
[role='alert'] { font-weight: bold; }
</style>
