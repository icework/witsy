<template>
  <section ref="pickerElement" class="chat-agent-picker" :class="{ pending, 'task-preview': taskPreview }">
    <BackgroundTaskLauncher v-if="taskPreview" v-model="taskInput" :name="state.workflowName" :agent="chat.chatAgent?.name || chat.runtime?.kind || t('runtime.native')" :context-kind="state.contextKind" :image="state.image" :instructions="question" :disabled="working || submitted || busy || state.busy" :error="error || state.error" @submit="ask" @cancel="dismissTask" />
    <div v-if="!taskPreview" class="agent-row agent-toolbar">
      <label class="agent-select"><BotIcon aria-hidden="true" /><span>{{ t('chatAgent.label') }}</span>
        <select :title="agents.find(a => a.id === selected)?.name || chat.chatAgent?.name || t('chatAgent.chooseAgent')" :aria-label="t('chatAgent.label')" v-model="selected" @change="choose" :disabled="busy || state.busy || state.capturing">
          <option value="" disabled>{{ chat.chatAgent?.name || t('chatAgent.chooseAgent') }}</option>
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{ agent.kind }})</option>
        </select>
      </label>
    </div>
    <p v-if="!taskPreview && (error || state.error)" role="alert">{{ error || state.error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { BotIcon } from 'lucide-vue-next'
import Chat from '@models/chat'
import BackgroundTaskLauncher from './BackgroundTaskLauncher.vue'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
import useIpcListener from '@composables/ipc_listener'
import useEventBus from '@composables/event_bus'
import { ChatAgent, hasPendingContext, ScreenshotState } from '../../types/chat_agent'
const props = defineProps<{ chat: Chat; busy?: boolean }>()
const emit = defineEmits<{ select: [agent: ChatAgent]; ask: [payload: { agent: ChatAgent; image?: string; text?: string; question: string; temporary: boolean }]; compact: [state: ScreenshotState]; context: [state: ScreenshotState, agent?: ChatAgent] }>()
const window = globalThis.window
const manager = LlmFactory.manager(store.config)
const agents = ref<ChatAgent[]>([])
const pickerElement = ref<HTMLElement>()
const selected = ref(''), question = ref(''), contextText = ref(''), error = ref('')
const working = ref(false), submitted = ref(false), temporary = ref(false)
let submissionVersion = 0
const state = ref<ScreenshotState>({ capturing: false, compact: false, busy: false })
const pending = computed(() => hasPendingContext(state.value))
const taskPreview = computed(() => pending.value && state.value.workflowMode === 'task')
const taskInput = computed({
  get: () => state.value.contextKind === 'selected-text' ? contextText.value : question.value,
  set: (value: string) => { if (state.value.contextKind === 'selected-text') contextText.value = value; else question.value = value },
})
const dismissTask = () => {
  submissionVersion++
  return window.api.chatAgents.screenshotUpdate({ dismiss: true, hide: true, expand: true })
}
const attempt = async (action: () => Promise<void>) => {
  error.value = ''; working.value = true
  try { await action() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
const receive = (next: ScreenshotState) => {
  const previous = state.value
  state.value = next; emit('compact', next)
  if (!next.capturing && hasPendingContext(next) && (next.requestId !== previous.requestId || next.image !== previous.image || next.contextKind !== previous.contextKind || previous.capturing)) {
    submitted.value = false
    submissionVersion++
    error.value = ''
    void nextTick(() => { if (pickerElement.value) pickerElement.value.scrollTop = 0 })
    const agent = agents.value.find(a => a.id === next.agentId)
    if (next.workflowMode !== 'task') { emit('context', next, agent); return }
    if (agent) { selected.value = agent.id; emit('select', agent) }
    temporary.value = agent ? store.config.chatHistory?.incognito === true : props.chat.temporary
    question.value = next.prompt ?? (next.contextKind === 'selected-text' ? t('contextWorkflow.defaultTextPrompt') : '')
    contextText.value = next.contextText || ''
  }
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
const addText = () => attempt(async () => { await window.api.chatAgents.screenshotUpdate({ manualText: true }) })
const ask = () => {
  if (working.value || submitted.value) return
  const version = submissionVersion
  return attempt(async () => {
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
    if (version !== submissionVersion) return
    submitted.value = true
    emit('ask', { agent, ...(state.value.image ? { image: state.value.image } : state.value.contextKind === 'selected-text' ? { text: contextText.value } : {}), question: question.value.trim(), temporary: temporary.value })
  })
}
const addContext = (kind: 'screenshot' | 'text') => {
  if (working.value || props.busy || state.value.busy || state.value.capturing || pending.value) return
  return kind === 'screenshot' ? capture() : addText()
}
defineExpose({ addContext, reload, reportError: (message: string) => { error.value = message } })
</script>
<style scoped>
.chat-agent-picker { margin: 0 var(--space-12); font-size: var(--font-size-13); min-width: 0; }
.agent-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); padding: var(--space-4) 0; }
.agent-select { flex: 1 1 calc(var(--space-32) * 3); }
.agent-select { flex: 0 1 auto; max-width: 100%; display: flex; align-items: center; gap: var(--space-4); min-width: 0; color: var(--faded-text-color); }
.agent-select > span { white-space: nowrap; font-size: var(--font-size-12); }
.agent-select svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.agent-select select { width: auto; min-width: 0; field-sizing: content; max-width: 100%; border: none; background-color: transparent; font-size: var(--font-size-13); font-weight: var(--font-weight-medium); text-overflow: ellipsis; padding: var(--space-2); }
.pending { overflow-y: auto; margin-bottom: var(--space-12); }
.task-preview { display: flex; flex: 1; min-height: 0; margin: 0 0 var(--space-px); overflow: hidden; }
[role='alert'] { padding: var(--space-8); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-error) 8%, var(--background-color)); color: var(--color-error); overflow-wrap: anywhere; }

</style>
