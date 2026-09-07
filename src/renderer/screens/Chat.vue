<template>
  <div class="chat split-pane" :class="{ 'quick-chat': screenshot.compact }">
    <ChatSidebar v-show="!screenshot.compact" :chat="assistant.chat" :generating-chat-ids="generatingChatIds" ref="sidebar" />
    <ChatArea :compact="screenshot.compact" :enable-context="mode === 'chat'" :context-disabled="screenshot.busy || screenshot.capturing || !!assistant.chat?.lastMessage()?.transient" @context-requested="agentPicker?.addContext($event)" :enable-model-selection="mode !== 'chat'" :screenshot-pending="!!screenshot.image || screenshot.contextKind === 'selected-text'" :chat="assistant.chat" :is-left-most="!isSidebarVisible" ref="chatArea" @prompt="onSendPrompt" @stop-generation="onStopGeneration" @toggle-sidebar="onToggleSidebar">
      <template #composer-controls>
        <ChatConfiguration v-if="mode === 'chat' && assistant.chat" :chat="assistant.chat" :disabled="quickChatLoading || isGenerating || screenshot.busy || screenshot.capturing || !!assistant.chat.lastMessage()?.transient" @change="onChatConfiguration" />
      </template>
      <template #runtime>
        <ChatAgentPicker v-if="mode === 'chat' && assistant.chat" ref="agentPicker" :chat="assistant.chat" :busy="quickChatLoading || isGenerating || !!assistant.chat.lastMessage()?.transient" @select="onChatAgent" @ask="onScreenshotAsk" @removed-screenshot="onScreenshotRemoved" @compact="onScreenshotState">
          <template #composer-controls><ChatConfiguration v-if="mode === 'chat' && assistant.chat" :chat="assistant.chat" :disabled="quickChatLoading || isGenerating || screenshot.busy || screenshot.capturing || !!assistant.chat.lastMessage()?.transient" @change="onChatConfiguration" /></template>
        </ChatAgentPicker>
        <RuntimeChat :context-disabled="screenshot.busy || screenshot.capturing" @context-requested="agentPicker?.addContext($event)" v-show="!screenshot.image && screenshot.contextKind !== 'selected-text'" v-if="mode === 'chat' && assistant.chat" :chat="assistant.chat" :screenshot-pending="!!screenshot.image || screenshot.contextKind === 'selected-text'" ref="runtimeChat" @bind="onRuntimeBinding" @progress="latestChunk = { type: 'content', text: '', done: false }">
          <template #composer-controls><ChatConfiguration v-if="mode === 'chat' && assistant.chat" :chat="assistant.chat" :disabled="quickChatLoading || isGenerating || screenshot.busy || screenshot.capturing || !!assistant.chat.lastMessage()?.transient" @change="onChatConfiguration" /></template>
        </RuntimeChat>
      </template>
    </ChatArea>
    <ChatEditor :chat="assistant.chat" :dialog-title="chatEditorTitle" :confirm-button-text="chatEditorConfirmButtonText" :on-confirm="chatEditorCallback" ref="chatEditor" />
    <CreateAgentRun :title="agent?.name ?? ''" ref="builder" />
    <AgentPicker ref="picker" />
  </div>
</template>

<script setup lang="ts">
import ChatConfiguration from '@components/ChatConfiguration.vue'

import ChatAgentPicker from '@components/ChatAgentPicker.vue'
import { ChatAgent, ScreenshotState } from '../../types/chat_agent'
import Attachment from '@models/attachment'
import RuntimeChat from '@components/RuntimeChat.vue'
import { RuntimeBinding } from '../../types/runtime'
import ChatArea from '@components/ChatArea.vue'
import ChatSidebar from '@components/ChatSidebar.vue'
import CreateAgentRun from '@components/CreateAgentRun.vue'
import { SendPromptParams } from '@components/Prompt.vue'
import useEventBus from '@composables/event_bus'
import useEventListener from '@composables/event_listener'
import useIpcListener from '@composables/ipc_listener'
import Chat from '@models/chat'
import Message from '@models/message'
import Dialog from '@renderer/utils/dialog'
import useTipsManager from '@renderer/utils/tips_manager'
import { createAgentExecutor, isAgentConversation } from '@services/agent_utils'
import Assistant from '@services/assistant'
import { saveFileContents } from '@services/download'
import { GenerationEvent } from '@services/generator'
import { t } from '@services/i18n'
import LlmUtils from '@services/llm_utils'
import LlmFactory from '@services/llms/llm'
import { store } from '@services/store'
import { nativeDefault } from '@services/native_models'
import { LlmChunk, LlmChunkContent } from 'multi-llm-ts'
import { A2APromptOpts, Agent } from 'types/agents'
import { strDict } from 'types/index'
import { computed, nextTick, onMounted, PropType, provide, Ref, ref, watch } from 'vue'
import AgentPicker from './AgentPicker.vue'
import ChatEditor, { ChatEditorCallback } from './ChatEditor.vue'

export type ChatSessionStatus = 'idle' | 'generating'

export type SearchState = {
  filter: Ref<string|null>
  navigate: Ref<number>
  localSearch: Ref<boolean>
}

export interface ChatSession {
  assistant: Assistant
  abortController: AbortController | null
  status: ChatSessionStatus
}

const { onBusEvent } = useEventBus()
const { onDomEvent } = useEventListener()
const { onIpcEvent } = useIpcListener()

// init stuff
const tipsManager = useTipsManager(store)
const llmManager = LlmFactory.manager(store.config)

// provide chunk for MessageList (scoped to this component tree)
const latestChunk = ref<LlmChunk | null>(null)
const runtimeChat = ref<InstanceType<typeof RuntimeChat>>()
const agentPicker = ref<InstanceType<typeof ChatAgentPicker>>()
const screenshot = ref<ScreenshotState>({ capturing: false, compact: false, busy: false })
provide('latestChunk', latestChunk)

// provide generating state for Prompt component
const isGenerating = computed(() => activeSession.value?.status === 'generating')
provide('isGenerating', isGenerating)

// provide search state for sidebar, message list and message body
const searchState: SearchState = { filter: ref<string | null>(null), navigate: ref(0), localSearch: ref(false) }
provide('searchState', searchState)

// provide callbacks for descendant components (scoped to this component tree)
// handlers are defined later but called via these wrappers
const chatCallbacks = {
  onDeleteChat: (chatId: string | string[]) => onDeleteChat(chatId),
  onDeleteFolder: (folderId: string) => onDeleteFolder(folderId),
  onDeleteMessage: (message: Message) => onDeleteMessage(message),
  onForkChat: (message: Message) => onForkChat(message),
  onMoveChat: (chatId: string | string[]) => onMoveChat(chatId),
  onNewChat: () => onNewChat(null),
  onNewChatInFolder: (folderId: string) => onNewChatInFolder(folderId),
  onRenameChat: (chat: Chat) => onRenameChat(chat),
  onRenameFolder: (folderId: string) => onRenameFolder(folderId),
  onResendAfterEdit: (payload: { message: Message, newContent: string }) => onResendAfterEdit(payload),
  onRetryGeneration: (message: Message) => onRetryGeneration(message),
  onRunAgent: (agentId?: string) => onRunAgent(agentId),
  onSelectChat: (chat: Chat) => onSelectChat(chat),
  onSetPrompt: (message: Message) => chatArea.value?.setPrompt(message),
}
provide('chat-callbacks', chatCallbacks)

export type ChatCallbacks = typeof chatCallbacks

export type ChatMode = 'chat' | 'computer-use'

const props = defineProps({
  mode: {
    type: String as PropType<ChatMode>,
    default: 'chat',
  },
  active: {
    type: Boolean,
    default: true,
  },
  extra: {
    type: Object as PropType<strDict>,
    default: () => ({}),
  },
})

// provide active state so any descendant can check visibility
const chatActive = computed(() => props.active)
provide('chatActive', chatActive)

// session management for parallel chats
const sessions = ref<Record<string, ChatSession>>({})
const activeSessionId = ref<string | null>(null)

// computed active session and assistant for template binding
const activeSession = computed<ChatSession | null>(() => {
  if (!activeSessionId.value) return null
  return sessions.value[activeSessionId.value] ?? null
})
const assistant = computed(() => activeSession.value?.assistant ?? new Assistant(store.config))

// expose generating chat IDs for sidebar indicator
const generatingChatIds = computed(() => {
  const ids: string[] = []
  for (const chatId in sessions.value) {
    if (sessions.value[chatId].status === 'generating') {
      ids.push(chatId)
    }
  }
  // if only the active session is generating, no need for spinner (user sees streaming)
  if (ids.length === 1 && ids[0] === activeSessionId.value) {
    return []
  }
  return ids
})

const chatArea= ref<typeof ChatArea>(null)
const chatEditor= ref<typeof ChatEditor>(null)
const sidebar= ref<typeof ChatSidebar>(null)
const chatEditorTitle = ref('')
const chatEditorConfirmButtonText = ref('common.save')
const chatEditorCallback= ref<ChatEditorCallback>(() => {})
const builder = ref<typeof CreateAgentRun>(null)
const picker = ref<typeof AgentPicker>(null)
const agent = ref<Agent|null>(null)

const isSidebarVisible = computed(() => !screenshot.value.compact && (sidebar.value?.isVisible() ?? true))
let lastQuickChat: Chat | null = null
let quickChatDraft: Message | null = null
let handledQuickChatRequest = ''
const quickChatLoading = ref(false)

// session management helpers
const createSession = (chat: Chat): ChatSession => {
  const newAssistant = new Assistant(store.config)
  newAssistant.setChat(chat)
  return {
    assistant: newAssistant,
    abortController: null,
    status: 'idle',
  }
}

const setActiveSession = (chatId: string, chat: Chat): ChatSession => {
  if (activeSessionId.value !== chatId && lastQuickChat?.uuid === activeSessionId.value) {
    quickChatDraft = lastQuickChat.runtime
      ? new Message('user', runtimeChat.value?.getPrompt() || '')
      : chatArea.value?.getDraft() || null
  }
  // cleanup old idle session if switching away
  if (activeSessionId.value && activeSessionId.value !== chatId) {
    const oldSession = sessions.value[activeSessionId.value]
    if (oldSession?.status === 'idle') {
      delete sessions.value[activeSessionId.value]
    }
  }

  // get or create session
  let session = sessions.value[chatId]
  if (!session) {
    session = createSession(chat)
    sessions.value[chatId] = session
  }

  // set active
  activeSessionId.value = chatId
  if (screenshot.value.compact) {
    lastQuickChat = session.assistant.chat
    if (!quickChatLoading.value && !screenshot.value.capturing && !screenshot.value.image && screenshot.value.contextKind !== 'selected-text') {
      void window.api.chatAgents.screenshotUpdate({ chatId, busy: session.status === 'generating' || !!chat.lastMessage()?.transient })
    }
  }
  return session
}

const cleanupSession = (chatId: string) => {
  if (lastQuickChat?.uuid === chatId) { lastQuickChat = null; quickChatDraft = null }
  const session = sessions.value[chatId]
  if (session) {
    session.abortController?.abort()
    delete sessions.value[chatId]
  }
}

const setSessionStatus = (chatId: string, status: ChatSessionStatus) => {
  const session = sessions.value[chatId]
  if (session) {
    session.status = status
  if (screenshot.value.chatId === chatId) void window.api.chatAgents.screenshotUpdate({ busy: status === 'generating' })
  }
}

const onDeleteChatIpc = () => {
  if (assistant.value.chat) {
    onDeleteChat(assistant.value.chat.uuid)
  }
}

const onLinkClick = (e: Event) => {
  const target = (e.target || (e as any).srcElement) as HTMLElement
  const href = target.getAttribute('href')
  if (href?.startsWith('#settings')) {
    const parts = href.split('_')
    window.api.settings.open({ initialTab: parts[1], engine: parts.length > 2 ? parts[2] : '' })
    e.preventDefault()
    return false
  } else if (href === '#retry_without_plugins') {
    if (assistant.value.chat) {
      assistant.value.chat.disableTools()
      onRetryGeneration(assistant.value.chat.messages[assistant.value.chat.messages.length - 1])
    } else {
      console.log('No chat to retry')
    }
    e.preventDefault()
    return false
  } else if (href === '#retry_without_params') {
    if (assistant.value.chat) {
      assistant.value.chat.modelOpts = undefined
      onRetryGeneration(assistant.value.chat.messages[assistant.value.chat.messages.length - 1])
    } else {
      console.log('No chat to retry')
    }
    e.preventDefault()
    return false
  }
}


onMounted(() => {

  // init a new chat
  onNewChat()

  // events (only global ones - others use chat-callbacks via provide/inject)
  onBusEvent('new-chat', onNewChat)

  // watch mode prop for computer-use initialization
  watch(() => props.mode, (mode) => {
    if (mode === 'computer-use') {
      onComputerUseMode()
    }
  })

  // IPC events
  onIpcEvent('new-chat', onNewChat)
  onIpcEvent('search-chat', searchChat)
  onIpcEvent('delete-chat', onDeleteChatIpc)
  onIpcEvent('computer-stop', onStopGeneration)

  // intercept links
  onDomEvent(document, 'click', onLinkClick)

  // show tips
  setTimeout(() => {
    tipsManager.showNextTip()
  }, 500)

  // make sure engine and model are always up-to-date
  watch(() => store.config.llm.engine, updateChatEngineModel, { immediate: true, deep: true })
  watch(() => store.config.engines, updateChatEngineModel, { immediate: true, deep: true })
  watch(() => store.config.llm.defaults, updateChatEngineModel, { immediate: true, deep: true })

  // watch props for changes
  watch(() => props.extra, (params) => {
    if (params?.chatId) {
      console.log('[chat] props changed', params)
      store.loadHistory()
      const chat: Chat = store.history.chats.find((c) => c.uuid === params.chatId)
      if (chat) {
        onSelectChat(chat)
      } else {
        console.log('Chat not found', params.chatId)
      }
    }
    if (params?.text) {
      console.log('[chat] setting prompt text', params.text)
      nextTick(() => {
        chatArea.value?.setPrompt(params.text)
        chatArea.value?.focusPrompt()
      })
    }
  }, { immediate: true })

})

const onNewChat = async (payload?: any) => {
  if (screenshot.value.compact && !payload) {
    await window.api.chatAgents.openQuickChat(true)
    return
  }
  if (payload?.runtime) { onRuntimeBinding(payload.runtime); return }
  const { prompt, attachments, submit } = payload || {}

  // create a new chat and session
  const newChat = new Chat()
  const session = setActiveSession(newChat.uuid, newChat)

  updateChatEngineModel()
  await nextTick()
  if (prompt) chatArea.value?.setPrompt(prompt)
  if (attachments) chatArea.value?.attach(attachments)
  chatArea.value?.setExpert(null)
  chatArea.value?.setDeepResearch(false)
  latestChunk.value = null
  if (submit) {
    chatArea.value?.sendPrompt()
  }
}

const onRuntimeBinding = (binding?: RuntimeBinding) => {
  const chat = new Chat()
  chat.runtime = binding
  setActiveSession(chat.uuid, chat)
  if (!binding) updateChatEngineModel()
  latestChunk.value = null
}

const onChatConfiguration = async (config: { runtime?: RuntimeBinding; engine?: string; model?: string }) => {
  const previous = assistant.value.chat
  const pendingDraft = previous.runtime ? new Message('user', runtimeChat.value?.getPrompt() || '') : chatArea.value?.getDraft()
  const agent = previous.chatAgent
  if (config.runtime || assistant.value.chat.runtime) onRuntimeBinding(config.runtime)
  if (!config.runtime) assistant.value.chat.setEngineModel(config.engine, config.model)
  const current = assistant.value.chat
  if (config.runtime && previous.runtime?.connectionId === config.runtime.connectionId) current.chatAgent = agent
  current.temporary = previous.temporary
  await nextTick()
  if (pendingDraft && current.uuid === assistant.value.chat.uuid) {
    if (current.runtime) runtimeChat.value?.setPrompt(pendingDraft.content)
    else chatArea.value?.setPrompt(pendingDraft)
  }
  if (assistant.value.chat.hasMessages() && !assistant.value.chat.temporary) store.saveHistory()
}

const onChatAgent = (agent: ChatAgent) => {
  const chat = new Chat()
  chat.chatAgent = JSON.parse(JSON.stringify(agent))
  if (agent.kind === 'native') {
    const config = chat.chatAgent.native
    chat.setEngineModel(config.engine, config.model)
    chat.instructions = config.instructions
    chat.tools = config.tools
    chat.modelOpts = config.modelOpts
  } else chat.runtime = { ...agent.binding }
  setActiveSession(chat.uuid, chat)
  latestChunk.value = null
  return chat
}
const startQuickChat = async (request: NonNullable<ScreenshotState['quickChatRequest']>) => {
  handledQuickChatRequest = request.id
  quickChatLoading.value = true
  const originalChatId = activeSessionId.value
  try {
    if (!request.fresh && lastQuickChat) {
      if (lastQuickChat.uuid !== activeSessionId.value) {
        const draft = quickChatDraft
        onSelectChat(lastQuickChat)
        await nextTick()
        if (draft) {
          if (lastQuickChat.runtime) runtimeChat.value?.setPrompt(draft.content)
          else chatArea.value?.setPrompt(draft)
        }
      }
    } else {
      const defaultId = store.config.prompt.defaultAgentId
      let agent: ChatAgent | undefined
      let warning = ''
      if (defaultId) {
        try {
          agent = (await window.api.chatAgents.list()).find(a => a.id === defaultId)
          if (!agent) warning = t('quickChat.fallback')
        } catch { warning = t('quickChat.loadError') }
      }
      // A newer request or a manual conversation change takes precedence.
      if (!screenshot.value.compact || screenshot.value.quickChatRequest?.id !== request.id || activeSessionId.value !== originalChatId) return
      if (agent) onChatAgent(agent)
      else onRuntimeBinding()
      quickChatDraft = null
      await nextTick()
      if (assistant.value.chat.runtime) runtimeChat.value?.setPrompt('')
      else chatArea.value?.setPrompt('')
      if (warning) agentPicker.value?.reportError(warning)
    }
    await window.api.chatAgents.screenshotUpdate({ chatId: assistant.value.chat.uuid, busy: isGenerating.value || !!assistant.value.chat.lastMessage()?.transient })
    await nextTick()
    if (assistant.value.chat.runtime) runtimeChat.value?.focus()
    else chatArea.value?.focusPrompt()
  } catch (e) {
    agentPicker.value?.reportError(e instanceof Error ? e.message : String(e))
  } finally { quickChatLoading.value = false }
}
const onScreenshotState = (state: ScreenshotState) => {
  screenshot.value = state
  if (state.compact && state.quickChatRequest && state.quickChatRequest.id !== handledQuickChatRequest) {
    void startQuickChat(state.quickChatRequest)
    return
  }
  if (state.compact && state.chatId && state.chatId !== assistant.value.chat.uuid) {
    const chat = sessions.value[state.chatId]?.assistant.chat || (lastQuickChat?.uuid === state.chatId ? lastQuickChat : store.history.chats.find(c => c.uuid === state.chatId))
    if (chat) onSelectChat(chat)
  }
}
const onScreenshotRemoved = async (question: string) => {
  await nextTick()
  if (assistant.value.chat.runtime) runtimeChat.value?.setPrompt(question)
  else chatArea.value?.setPrompt(question)
}
const onScreenshotAsk = async (payload: { agent: ChatAgent; image?: string; text?: string; question: string; temporary: boolean }) => {
  if (screenshot.value.busy) return
  screenshot.value.busy = true
  const chat = assistant.value.chat
  if (!chat.hasMessages()) chat.temporary = payload.temporary
  const prompt = payload.image ? `${payload.question}\n\nThis is a screenshot question. Answer using the attached image. Do not change files or take external actions unless I explicitly ask you to.` : `${payload.question}\n\nSelected text (context):\n${payload.text || ''}`
  try {
    await nextTick()
    await window.api.chatAgents.screenshotUpdate({ chatId: chat.uuid, busy: true })
    if (chat.runtime) await runtimeChat.value.sendMessage(prompt, payload.image ? [payload.image] : [])
    else {
      const mimeType = payload.image?.slice(5, payload.image.indexOf(';'))
      await onSendPrompt({ prompt, attachments: payload.image ? [new Attachment(payload.image.slice(payload.image.indexOf(',') + 1), mimeType)] : [], instructions: chat.instructions, docrepos: [], expert: null, skill: null, execMode: 'prompt' })
      await window.api.chatAgents.screenshotUpdate({ busy: false })
    }
  } catch (e) {
    await window.api.chatAgents.screenshotUpdate({ busy: false })
    agentPicker.value?.reportError(e instanceof Error ? e.message : String(e))
  }
}

const searchChat = () => {
  if (!props.active) return
  sidebar.value?.clearFilter()
  if (assistant.value?.chat?.hasMessages()) {
    searchState.localSearch.value = true
  }
}

const importChat = (chatData: any) => {
  // Parse the chat from JSON
  const chat = Chat.fromJson(chatData)

  // Add to history (no folder)
  store.addChat(chat)

  // Load the chat via session
  setActiveSession(chat.uuid, chat)
  updateChatEngineModel()

  // Emit event
  latestChunk.value = null
}

const onNewChatInFolder = (folderId: string) => {

  // get folder and create new chat
  const folder = store.history.folders.find((f) => f.id === folderId)
  const chat = new Chat()

  // create session for this chat
  setActiveSession(chat.uuid, chat)

  // engine and model
  if (folder.defaults) {
    llmManager.setChatModel(folder.defaults.engine, folder.defaults.model)
  }

  // set it
  updateChatEngineModel()

  // other config
  if (folder.defaults) {
    chat.disableStreaming = folder.defaults.disableStreaming
    chat.tools = folder.defaults.tools
    chat.instructions = folder.defaults.instructions
    chat.locale = folder.defaults.locale
    // @ts-expect-error backwards compatibility: migrate docrepo to docrepos
    chat.docrepos = folder.defaults.docrepos?.length ? folder.defaults.docrepos : (folder.defaults.docrepo ? [folder.defaults.docrepo] : undefined)
    chat.modelOpts = folder.defaults.modelOpts
  }

  // init
  chat.initTitle()
  store.addChat(chat, folderId)

  // expert
  if (folder.defaults?.expert) {
    const expert = store.experts.find((e) => e.id === folder.defaults.expert)
    if (expert) {
      chatArea.value?.setExpert(expert)
    }
  }

}

const updateChatEngineModel = () => {
  if (!assistant.value.chat.hasMessages() && !assistant.value.chat.runtime && !assistant.value.chat.chatAgent) {
    const { engine, model } = nativeDefault(store.config, llmManager)
    assistant.value.chat.setEngineModel(engine, model)
    store.initChatWithDefaults(assistant.value.chat)
  }
}

const onSelectChat = (chat: Chat) => {
  // switch to session for this chat (creates if needed, cleans up old idle session)
  setActiveSession(chat.uuid, chat)
  nextTick(() => {
    latestChunk.value = null
  })
}

const onRenameChat = async (chat: Chat) => {
  const { value: title } = await Dialog.show({
    title: t('main.chat.rename'),
    input: 'text',
    inputValue: chat.title,
    confirmButtonText: t('common.rename'),
    showCancelButton: true,
  });
  if (title) {
    chat.title = title
    store.saveHistory()
  }
}

const onMoveChat = async (chatId: string|string[]) => {

  const chatIds: string[] = Array.isArray(chatId) ? chatId : [chatId]
  const srcFolder = chatIds.length === 1
    ? store.history.folders.find((f) => f.chats.includes(chatIds[0]))
    : null

  const { value: folderId } = await Dialog.show({
    title: t('main.chat.moveToFolder'),
    input: 'select',
    inputValue: srcFolder?.id || store.rootFolder.id,
    inputOptions: [
      store.rootFolder,
      ...store.history.folders.sort((a, b) => a.name.localeCompare(b.name))
    ].reduce<strDict>((acc, f) => {
      acc[f.id] = f.name
      return acc
    }, {}),
    confirmButtonText: t('common.move'),
    showCancelButton: true,
  });
  if (folderId) {

    // destination folder
    const dstFolder = store.history.folders.find((f) => f.id === folderId)

    for (const chatId of chatIds) {

      // remove from source folder
      const srcFolder = store.history.folders.find((f) => f.chats.includes(chatId))
      if (srcFolder) {
        srcFolder.chats = srcFolder.chats.filter((c) => c !== chatId)
      }

      // add to destination folder
      if (dstFolder) {
        dstFolder.chats.push(chatId)
      }

    }

    // done
    store.saveHistory()

  }

  // selection done
  sidebar.value?.cancelSelectMode()
}

const onDeleteChat = async (chatId: string|string[]) => {

  const chatIds: string[] = Array.isArray(chatId) ? chatId : [chatId]
  const title = chatIds.length > 1
    ? t('main.chat.confirmDeleteMultiple')
    : t('main.chat.confirmDeleteSingle')

  const result = await Dialog.show({
    target: document.querySelector('.main'),
    title: title,
    text: t('common.confirmation.cannotUndo'),
    confirmButtonText: t('common.delete'),
    showCancelButton: true,
  })
    
  if (result.isConfirmed) {

    // fist remove
    deleteChats(chatIds)
    store.saveHistory()

  }

  // selection done
  sidebar.value?.cancelSelectMode()

}

const deleteChats = (chatIds: string[]) => {

  // fist remove from chat list
  for (const chatId of chatIds) {

    // cleanup session (aborts if generating)
    cleanupSession(chatId)

    // remove from chats list
    let index = store.history.chats.findIndex((c) => c.uuid === chatId)
    if (index != -1) {
      store.history.chats[index].delete()
      store.history.chats.splice(index, 1)
    }

    // remove from folders
    for (const folder of store.history.folders) {
      folder.chats = folder.chats.filter((c) => c !== chatId)
    }
  }

  // if current chat was deleted, create new chat
  if (chatIds.includes(activeSessionId.value)) {
    onNewChat(null)
  }

}

const onForkChat = (message: Message) => {

  // set up editor for forking
  chatEditorTitle.value = 'chat.fork.title'
  chatEditorConfirmButtonText.value = 'common.fork'
  chatEditorCallback.value = ({ title, engine, model }) => {
    const chat = assistant.value.chat
    forkChat(chat, message, title, engine, model)
  }

  // show editor
  chatEditor.value.show()
}

const forkChat = (chat: Chat, message: Message, title: string, engine: string, model: string) => {

  const fork = chat.fork(message)
  fork.title = title
  fork.engine = engine
  fork.model = model

  // special case: forking on a user message
  const messageIsFromUser = (message.role === 'user')
  if (messageIsFromUser) {
    fork.messages.pop()
  }
  
  // save
  const folder = store.history.folders.find((f) => f.chats.includes(chat.uuid))
  store.addChat(fork, folder?.id)

  // select
  onSelectChat(fork)

  // now send prompt
  if (messageIsFromUser) {
    //emitBusEvent('set-prompt', message)
    onSendPrompt({
      instructions: chat.instructions,
      prompt: message.content,
      attachments: message.attachments,
      docrepos: fork.docrepos,
      expert: message.expert,
      skill: message.skill,
      execMode: message.execMode || 'prompt',
    })
  }
}

const onDeleteMessage = async (message: Message) => {
  const result = await Dialog.show({
    target: document.querySelector('.main'),
    title: t('main.message.confirmDelete'),
    text: t('common.confirmation.cannotUndo'),
    confirmButtonText: t('common.delete'),
    showCancelButton: true,
  })
  if (result.isConfirmed) {
    assistant.value.chat.deleteMessagesStarting(message)
    store.saveHistory()
    if (assistant.value.chat.messages.length === 1) {
      assistant.value.chat.delete()
      store.history.chats = store.history.chats.filter((c) => c.uuid !== assistant.value.chat.uuid)
      onNewChat()
    }
  }
}

const onRenameFolder = async (folderId: string) => {
  const folder = store.history.folders.find((f) => f.id === folderId)
  if (folder) {
    const { value: name } = await Dialog.show({
      title: t('main.folder.rename'),
      input: 'text',
      inputValue: folder.name,
      confirmButtonText: t('common.rename'),
      showCancelButton: true,
    });
    if (name) {
      folder.name = name
      store.saveHistory()
    }
  }
}

const onDeleteFolder = async (folderId: string) => {
  
  const result = await Dialog.show({
    title: t('main.folder.confirmDelete'),
    text: t('common.confirmation.cannotUndo'),
    confirmButtonText: t('main.folder.keepConversations'),
    denyButtonText: t('main.folder.deleteConversations'),
    showCancelButton: true,
    showDenyButton: true,
    customClass: { 'actions': 'actions-stacked' }
  })

  if (result.isDismissed) {
    return
  }

  // find folder and delete it
  const folder = store.history.folders.find((f) => f.id === folderId)
  store.history.folders = store.history.folders.filter((f) => f.id !== folderId)

  // delete chats if asked
  if (result.isDenied) {
    deleteChats(folder.chats)
  }

  // done
  store.saveHistory()

}

const onSendPrompt = async (params: SendPromptParams) => {

  // deconstruct params
  const { instructions, prompt, attachments, docrepos, expert, skill, execMode } = params

  // capture the current session for this generation (allows parallel chats)
  const session = activeSession.value
  if (!session) return
  const sessionChatId = session.assistant.chat.uuid

  // if the chat is still in an agentic context then run the agent
  const agent = isAgentConversation(session.assistant.chat)
  if (agent) {
    // For A2A continuation, pass the prompt in a dict
    // The A2A executor will use agent.steps[0].prompt as template, or use the prompt value directly if no template
    runAgent(agent, { prompt }, session.assistant.chat.lastMessage()?.a2aContext)
    return
  }

  // make sure we can have an llm
  session.assistant.initLlm(session.assistant.chat.engine || store.config.llm.engine)
  if (!session.assistant.hasLlm()) {
    const rc = await Dialog.show({
      title: t('prompt.noEngineAvailable.title'),
      text: t('prompt.noEngineAvailable.text'),
      showCancelButton: true,
      confirmButtonText: t('common.yes'),
      cancelButtonText: t('common.no'),
    })
    if (rc.isConfirmed) {
      window.api.settings.open({ initialTab: 'models' })
    }
    return
  }

  // save the attachment
  for (const attachment of attachments ?? []) {
    if (attachment?.saved === false && !session.assistant.chat.temporary) {
      await attachment.loadContents()
      const fileUrl = saveFileContents(attachment.format(), attachment.b64Contents())
      if (fileUrl) {
        attachment.saved = true
        attachment.url = fileUrl
      }
    }
  }

  // we will need that (function because chat may be updated later)
  const isUsingComputer = () => {
    return llmManager.isComputerUseModel(session.assistant.chat.engine, session.assistant.chat.model)
  }

  // create abort controller for this session
  session.abortController = new AbortController()
  setSessionStatus(sessionChatId, 'generating')

  // prompt
  const rc = await session.assistant.prompt(prompt, {
    model: session.assistant.chat.model,
    instructions: instructions || session.assistant.chat.instructions,
    attachments: attachments || [],
    docrepos: docrepos || null,
    expert: expert || null,
    skill: skill || null,
    execMode: execMode || 'prompt',
    abortSignal: session.abortController.signal,
  }, (chunk) => {

    // only emit chunk events for the active session
    if (sessionChatId === activeSessionId.value) {
      latestChunk.value = chunk
    }

    // computer use
    if (isUsingComputer()) {
      window.api.computer.updateStatus(chunk)
    }

  }, async (event: GenerationEvent) => {

    if (event === 'before_generation') {

      // not very nice but gets the message list scrolling (only for active session)
      if (sessionChatId === activeSessionId.value) {
        latestChunk.value = {
          type: 'content',
          text: '',
          done: false,
        } as LlmChunkContent
      }

      // for computer use
      if (isUsingComputer()) {
        window.api.computer.start()
      }

      // make sure the chat is part of history
      if (!session.assistant.chat.temporary && !store.history.chats.find((c) => c.uuid === session.assistant.chat.uuid)) {
        session.assistant.chat.initTitle()
        store.addChat(session.assistant.chat)
      }

    } else if (event === 'plugins_disabled') {
      tipsManager.showTip('pluginsDisabled')
    } else if (event === 'before_title') {
      store.saveHistory()
    }
  })

  // for computer use
  if (isUsingComputer()) {
    window.api.computer.close()
  }

  // done with deep research (only for active session)
  if (rc === 'success' && sessionChatId === activeSessionId.value) {
    chatArea.value?.setDeepResearch(false)
  }

  // generation complete - update status and cleanup if not active
  setSessionStatus(sessionChatId, 'idle')
  if (sessionChatId !== activeSessionId.value) {
    delete sessions.value[sessionChatId]
  }

  // save
  store.saveHistory()

}

const onRunAgent = async (agentId?: string) => {

  // select agent
  if (agentId) {
    agent.value = store.agents.find((a) => a.uuid === agentId)
  } else {
    agent.value = await picker.value.pick()
  }

  // required
  if (!agent.value) {
    return
  }

  builder.value.show(agent.value, {}, async (values: Record<string, string>) => {

    // we need a new chat and session
    const newChat = new Chat()
    setActiveSession(newChat.uuid, newChat)
    updateChatEngineModel()

    // and run it
    runAgent(agent.value, values)

  })

}

const runAgent = async (agent: Agent, values: Record<string, string>, a2aContext?: A2APromptOpts) => {

  // capture the current session for this generation (allows parallel chats)
  const session = activeSession.value
  if (!session) return
  const sessionChatId = session.assistant.chat.uuid

  // create abort controller for this session
  session.abortController = new AbortController()
  setSessionStatus(sessionChatId, 'generating')

  // create executor for this agent
  const executor = createAgentExecutor(store.config, store.workspace.uuid, agent)

  await executor.run('manual', values, {
    streaming: true,
    ephemeral: false,
    model: session.assistant.chat.model,
    chat: session.assistant.chat,
    a2aContext: a2aContext,
    abortSignal: session.abortController.signal,
  }, async (event: GenerationEvent) => {

    if (event === 'before_generation') {

      // not very nice but gets the message list scrolling (only for active session)
      if (sessionChatId === activeSessionId.value) {
        latestChunk.value = {
          type: 'content',
          text: '',
          done: false,
        } as LlmChunkContent
      }

      // make sure the chat is part of history
      if (!session.assistant.chat.temporary && !store.history.chats.find((c) => c.uuid === session.assistant.chat.uuid)) {
        session.assistant.chat.initTitle()
        store.addChat(session.assistant.chat)
      }

    } else if (event === 'before_title') {
      store.saveHistory()
    }

  })

  // generation complete - update status and cleanup if not active
  setSessionStatus(sessionChatId, 'idle')
  if (sessionChatId !== activeSessionId.value) {
    delete sessions.value[sessionChatId]
  }

  // save
  store.saveHistory()

}

const onRetryGeneration = async (message: Message) => {

  // find the message in the chat
  const index = assistant.value.chat.messages.findIndex((m) => m.uuid === message.uuid)
  if (index === -1) {
    return
  }

  // Get the last message before mutating (to avoid triggering Vue reactivity)
  const lastMessage = assistant.value.chat.messages[index-1]

  // now remove all messages after this one (including the one we're retrying)
  assistant.value.chat.messages.splice(index-1)

  // depends if this is an agent response or not
  if (message.agentId) {

    // make sure the agent still exists
    const agent = store.agents.find((a) => a.uuid === message.agentId)
    if (!agent) {
      await Dialog.waitUntilClosed()
      Dialog.alert(t('chat.agent.notFound'))
      return
    }

    // now we can run it - for retry, pass the message content as the prompt value
    // We use a generic 'prompt' key since we don't know the original variable names
    runAgent(agent, { prompt: lastMessage.content })

  } else {

    onSendPrompt({
      instructions: assistant.value.chat.instructions,
      prompt: lastMessage.content,
      attachments: lastMessage.attachments,
      docrepos: assistant.value.chat.docrepos,
      expert: lastMessage.expert,
      skill: lastMessage.skill,
      execMode: lastMessage.execMode,
    })

  }

}

const onResendAfterEdit = async (payload: { message: Message, newContent: string }) => {

  // find the message in the chat
  const index = assistant.value.chat.messages.findIndex((m) => m.uuid === payload.message.uuid)
  if (index === -1) {
    return
  }

  // Remove this message and all messages after it
  assistant.value.chat.messages.splice(index)

  // Resend with the updated content
  if (payload.message.agentId) {

    // make sure the agent still exists
    const agent = store.agents.find((a) => a.uuid === payload.message.agentId)
    if (!agent) {
      await Dialog.waitUntilClosed()
      Dialog.alert(t('chat.agent.notFound'))
      return
    }

    // Run the agent with the new content
    runAgent(agent, { prompt: payload.newContent })

  } else {

    onSendPrompt({
      instructions: assistant.value.chat.instructions,
      prompt: payload.newContent,
      attachments: payload.message.attachments,
      docrepos: assistant.value.chat.docrepos,
      expert: payload.message.expert,
      skill: payload.message.skill,
      execMode: payload.message.execMode,
    })

  }

}

const onStopGeneration = async () => {
  activeSession.value?.abortController?.abort()
}

const onToggleSidebar = () => {
  if (sidebar.value?.isVisible()) {
    sidebar.value.hide()
  } else {
    sidebar.value.show()
  }
}

const onComputerUseMode = () => {
  assistant.value.initChat()
  assistant.value.chat.engine = 'anthropic'
  assistant.value.chat.model = 'computer-use'

  const llmUtils = new LlmUtils(store.config)
  const instructions = new Message('system', llmUtils.getSystemInstructions())
  assistant.value.chat.addMessage(instructions)

  const message = new Message('assistant', t('computerUse.instructions'))
  message.uiOnly = true
  assistant.value.chat.addMessage(message)

  nextTick(() => {
    latestChunk.value = null
  })
}

defineExpose({
  newChat: onNewChat,
  importChat,
  startDictation: () => chatArea.value?.startDictation(),
})

</script>

<style scoped>

/* Chat list adds one pixel
   To the main window's height somehow
   We don't know why though */
.chat.split-pane {
  height: calc(100vh - var(--window-toolbar-height) - 2.5rem - 1px) !important;
}

.chat.split-pane.quick-chat {
  height: calc(100vh - var(--window-toolbar-height)) !important;
}

</style>
