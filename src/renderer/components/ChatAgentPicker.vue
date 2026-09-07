<template>
  <section ref="pickerElement" class="chat-agent-picker" :class="{ pending }">
    <div class="agent-row agent-toolbar">
      <label class="agent-select"><BotIcon aria-hidden="true" /><span>{{ t('chatAgent.label') }}</span>
        <select :title="agents.find(a => a.id === selected)?.name || chat.chatAgent?.name || t('chatAgent.chooseAgent')" :aria-label="t('chatAgent.label')" v-model="selected" @change="choose" :disabled="busy || state.busy || state.capturing">
          <option value="" disabled>{{ chat.chatAgent?.name || t('chatAgent.chooseAgent') }}</option>
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{ agent.kind }})</option>
        </select>
      </label>
      <template v-if="state.compact">
        <div class="quick-chat-actions">
        <button type="button" :aria-label="t('quickChat.new')" :title="t('quickChat.new')" :disabled="working || busy || state.busy || state.capturing || pending" @click="window.api.chatAgents.openQuickChat(true)"><MessageCirclePlusIcon /></button>
        <button type="button" :aria-label="t('quickChat.settings')" :title="t('quickChat.settings')" @click="openQuickChatSettings"><Settings2Icon /></button>
        <button @click="window.api.chatAgents.screenshotUpdate({ expand: true })">{{ t('chatAgent.expand') }}</button>
        <button class="quick-chat-hide" @click="window.api.chatAgents.screenshotUpdate({ hide: true })">{{ t('chatAgent.hide') }}</button>
        </div>
      </template>
    </div>
    <div v-if="pending" class="screenshot-preview">
      <div v-if="state.image" class="screenshot-attachment">
        <img :src="state.image" :alt="t('chatAgent.preview')" />
        <button type="button" @click="removeScreenshot" :disabled="working || busy || state.busy">{{ t('chatAgent.removeScreenshot') }}</button>
      </div>
      <strong>{{ state.workflowName || t('agentDesign.contextTitle') }}</strong>
      <p>{{ state.image ? t('chatAgent.previewHelp') : t('contextWorkflow.previewHelp') }}</p>
      <form class="context-composer" @submit.prevent="ask">
        <label class="context-field" v-if="state.contextKind === 'selected-text'"><span>{{ t('contextWorkflow.selected-text') }}</span><textarea v-model="contextText" :aria-label="t('contextWorkflow.selected-text')" rows="4" maxlength="64000" /></label>
        <label class="context-field"><span>{{ t(state.contextKind === 'selected-text' ? 'contextWorkflow.prompt' : 'chatAgent.question') }}</span><textarea v-model="question" :aria-label="t(state.contextKind === 'selected-text' ? 'contextWorkflow.prompt' : 'chatAgent.question')" rows="2" /></label>
        <label class="temporary-toggle"><input type="checkbox" v-model="temporary" :disabled="chat.hasMessages()" /> {{ t('chatAgent.temporary') }}</label>
        <div class="context-settings"><slot name="composer-controls" /></div>
        <div class="agent-row context-composer-actions">
          <button class="primary" type="submit" :disabled="working || busy || state.busy || !question.trim()">{{ t('chatAgent.ask') }}</button>
          <button v-if="state.image" type="button" @click="retake" :disabled="working">{{ t('chatAgent.retake') }}</button>
          <button type="button" @click="window.api.chatAgents.screenshotUpdate({ dismiss: true })">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </div>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { BotIcon, MessageCirclePlusIcon, Settings2Icon } from 'lucide-vue-next'
import Chat from '@models/chat'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
import useIpcListener from '@composables/ipc_listener'
import useEventBus from '@composables/event_bus'
import { ChatAgent, ScreenshotState } from '../../types/chat_agent'
const props = defineProps<{ chat: Chat; busy?: boolean }>()
const emit = defineEmits<{ select: [agent: ChatAgent]; ask: [payload: { agent: ChatAgent; image?: string; text?: string; question: string; temporary: boolean }]; compact: [state: ScreenshotState]; removedScreenshot: [question: string] }>()
const window = globalThis.window
const manager = LlmFactory.manager(store.config)
const agents = ref<ChatAgent[]>([])
const pickerElement = ref<HTMLElement>()
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
    void nextTick(() => { if (pickerElement.value) pickerElement.value.scrollTop = 0 })
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
const openQuickChatSettings = async () => {
  await window.api.chatAgents.screenshotUpdate({ expand: true })
  window.api.settings.open({ initialTab: 'chat' })
}
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
const addContext = (kind: 'screenshot' | 'text') => {
  if (working.value || props.busy || state.value.busy || state.value.capturing || pending.value) return
  return kind === 'screenshot' ? capture() : addText()
}
defineExpose({ addContext, reload, reportError: (message: string) => { error.value = message } })
</script>
<style scoped>
.chat-agent-picker { margin: 0 var(--space-12); font-size: var(--font-size-13); min-width: 0; }
.agent-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); padding: var(--space-4) 0; }
.quick-chat-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-left: auto; }
.quick-chat-actions button { display: inline-flex; align-items: center; justify-content: center; min-height: var(--space-16); }
.quick-chat-actions svg { width: var(--icon-md); height: var(--icon-md); }
.agent-toolbar:has(.quick-chat-actions) .agent-select { flex: 1 1 calc(var(--space-32) * 3); }
.agent-select { flex: 0 1 auto; max-width: 100%; display: flex; align-items: center; gap: var(--space-4); min-width: 0; color: var(--faded-text-color); }
.agent-select > span { white-space: nowrap; font-size: var(--font-size-12); }
.agent-select svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.agent-select select { width: auto; min-width: 0; field-sizing: content; max-width: 100%; border: none; background-color: transparent; font-size: var(--font-size-13); font-weight: var(--font-weight-medium); text-overflow: ellipsis; padding: var(--space-2); }
.pending { overflow-y: auto; margin-bottom: var(--space-12); }
.screenshot-preview { display: flex; flex-direction: column; gap: var(--space-8); padding: var(--space-12); border: var(--space-px) solid var(--border-color); border-radius: var(--radius-2xl); background: var(--background-color-light); }
.screenshot-preview > p { margin: 0; color: var(--faded-text-color); line-height: 1.5; }
.screenshot-attachment { display: flex; align-items: flex-start; gap: var(--space-8); flex-wrap: wrap; }
.screenshot-attachment img { display: block; max-width: 100%; max-height: calc(var(--space-32) * 3); object-fit: contain; border-radius: var(--radius-lg); border: var(--space-px) solid var(--border-color); }
.context-composer { container: chat-composer / inline-size; display: flex; flex-direction: column; gap: var(--space-8); min-width: 0; }
.context-composer textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: var(--space-8); border-radius: var(--radius-lg); font-size: var(--font-size-14); line-height: 1.5; }
.context-field { display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--font-size-13); font-weight: var(--font-weight-medium); }
.temporary-toggle { display: flex; align-items: center; gap: var(--space-3); color: var(--dimmed-text-color); }
.context-composer-actions { position: sticky; bottom: 0; z-index: 1; padding-block: var(--space-8); border-top: var(--space-px) solid var(--border-color); background: var(--background-color-light); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
button { border-radius: var(--radius-lg); }
.context-composer-actions button:disabled { opacity: 0.5; }
.context-settings { min-width: 0; }
.context-settings :deep(.chat-configuration) { justify-content: flex-start; }
.primary { order: 2; margin-left: auto; background: var(--highlight-color); color: var(--highlighted-color); border-color: var(--highlight-color); }
[role='alert'] { padding: var(--space-8); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-error) 8%, var(--background-color)); color: var(--color-error); overflow-wrap: anywhere; }

</style>
