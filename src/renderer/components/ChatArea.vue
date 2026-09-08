<template>
  <div class="chat-area sp-main">
    
    <header v-if="!taskPreview" :class="{ 'is-left-most': isLeftMost }">
      
      <ButtonIcon v-if="!compact" class="toggle-sidebar" :aria-label="t('main.toggleSidebar')" v-tooltip="{ text: t('main.toggleSidebar'), position: 'bottom-right' }" @click="toggleSideBar">
        <PanelRightCloseIcon v-if="isLeftMost" />
        <PanelRightOpenIcon v-else />
      </ButtonIcon>

      <ButtonIcon class="new-chat" :aria-label="t('common.newChat')" v-if="isLeftMost && !compact" v-tooltip="{ text: t('common.newChat'), position: 'bottom-right' }" @click="onNewChat">
        <MessageCirclePlusIcon />
      </ButtonIcon>

      <!-- <div class="icon run-agent" :class="{ hidden: !isLeftMost }" v-tooltip="{ text: t('common.runAgent'), position: 'bottom-right' }" @click="onRunAgent">
        <IconRunAgent />
      </div> -->

      <div class="title" @dblclick="onRenameChat">{{ chat?.title || t('chat.empty.title') }}</div>
      <span class="separator" v-if="chat?.title && chat?.createdAt">&bull;</span>
      <div class="created-at" v-if="chat?.title && chat?.createdAt">{{ t('chat.startedAt', { date: formatDate(chat.createdAt) }) }}</div>
      <div v-if="chat?.temporary" class="incognito-badge" :title="t('chat.incognito.help')">
        <EyeOffIcon aria-hidden="true" />
        <span>{{ t('chat.incognito.label') }}</span>
      </div>
      <div class="flex-push"></div>

      <ButtonIcon class="settings" :aria-label="t('chat.modelSettings')" :aria-expanded="showModelSettings" @click="showModelSettings = !showModelSettings" v-if="!chat?.runtime && store.isFeatureEnabled('chat.settings')">
        <SlidersHorizontalIcon />
      </ButtonIcon>

      <ContextMenuTrigger class="menu" :position="chatMenuPosition" v-if="chat?.title || store.isFeatureEnabled('chat.temporary')">
        <template #trigger>
          <MoreVerticalIcon />
        </template>
        <template #menu>
          <div v-if="store.isFeatureEnabled('chat.temporary')"
               class="item"
               @click="handleActionClick('toggle_temp')">
            {{ chat?.temporary ? t('chat.actions.saveChat') : t('chat.actions.makeTemporary') }}
          </div>
          <div class="item" @click="handleActionClick('rename')">
            {{ t('common.rename') }}
          </div>
          <div v-if="store.isFeatureEnabled('chat.exportMarkdown')"
               class="item"
               :class="{ disabled: !hasMessages() }"
               @click="hasMessages() && handleActionClick('exportMarkdown')">
            {{ t('chat.actions.exportMarkdown') }}
          </div>
          <div v-if="store.isFeatureEnabled('chat.exportPdf')"
               class="item"
               :class="{ disabled: !hasMessages() }"
               @click="hasMessages() && handleActionClick('exportPdf')">
            {{ t('chat.actions.exportPdf') }}
          </div>
          <div class="item"
               :class="{ disabled: !hasUsage() }"
               @click="hasUsage() && handleActionClick('usage')">
            {{ t('chat.actions.usage') }}
          </div>
          <div class="item"
               :class="{ disabled: !isSaved() }"
               @click="isSaved() && handleActionClick('delete')">
            {{ t('common.delete') }}
          </div>
        </template>
      </ContextMenuTrigger>

    </header>
    
    <SearchNav v-if="!taskPreview" :chat="chat" :scroller="messageList?.scroller" />

    <main>
      <div class="chat-content">

        <!-- <div class="chat-content-title">
          <div class="title" @dblclick="onRenameChat">{{ chat?.title || t('chat.empty.title') }}</div>
          <div class="spacer"></div> -->
          <!-- <SlidersHorizontalIcon class="icon settings" @click="showModelSettings = !showModelSettings" /> -->
          <!-- <MoreVerticalIcon class="icon" @click="onMenu" />
        </div> -->

        <MessageList class="chat-content-main" :chat="chat" :conversation-mode="conversationMode" v-if="chat?.hasMessages() && !screenshotPending" ref="messageList" />
        
        <EmptyChat :compact="compact" class="chat-content-main" @run-agent="onRunAgent" v-else-if="!screenshotPending" />
        
        <div class="deep-research-usage" v-if="prompt?.isDeepResearchActive() && tipsManager.isTipAvailable('deepResearchUsage')">
          {{  t('deepResearch.usage') }}
          <div class="deep-research-usage-close" @click="onHideDeepResearchUsage">
            <X />
          </div>
        </div>
        
        <slot name="runtime" />
        <Prompt v-if="!chat?.runtime && !screenshotPending"
          ref="prompt"
          class="prompt"
          :chat="chat"
          :enable-deep-research="true"
          :enable-model-selection="enableModelSelection"
          :enable-context="enableContext"
          :context-image="contextImage"
          @context-retake="emit('context-retake')" @context-remove="emit('context-remove')" @context-consumed="emit('context-consumed')"
          :context-disabled="contextDisabled"
          @context-requested="emit('context-requested', $event)"
          :conversation-mode="conversationMode"
          :history-provider="historyProvider"
          :is-generating="isGenerating"
          @set-engine-model="onSetEngineModel"
          @conversation-mode="onConversationMode"
          @prompt="onSendPrompt"
          @run-agent="onRunAgent"
          @stop="onStopGeneration"
        >
          <template #actions><slot name="composer-controls" /></template>
        </Prompt>
      
      </div>
      
      <ModelSettings v-if="!chat?.runtime && !taskPreview" class="model-settings" :inert="!showModelSettings" :class="{ visible: showModelSettings }" :chat="chat" @close="showModelSettings = false"/>
    
    </main>

  </div>
</template>

<script setup lang="ts">

import Chat from '@models/chat'
import Dialog from '@renderer/utils/dialog'
import useTipsManager from '@renderer/utils/tips_manager'
import ModelSettings from '@screens/ModelSettings.vue'
import { t } from '@services/i18n'
import LlmFactory, { ILlmManager } from '@services/llms/llm'
import { exportToPdf } from '@services/pdf'
import { kMediaChatId, store } from '@services/store'
import { EyeOffIcon, MessageCirclePlusIcon, MoreVerticalIcon, PanelRightCloseIcon, PanelRightOpenIcon, SlidersHorizontalIcon, X } from 'lucide-vue-next'
import { Expert, Message } from 'types/index'
import { computed, ComputedRef, inject, ref } from 'vue'
import ButtonIcon from './ButtonIcon.vue'
import { MenuPosition } from './ContextMenuPlus.vue'
import ContextMenuTrigger from './ContextMenuTrigger.vue'
import EmptyChat from './EmptyChat.vue'
import MessageList from './MessageList.vue'
import SearchNav from './SearchNav.vue'
import Prompt, { ConversationMode, SendPromptParams } from './Prompt.vue'
import type { ChatCallbacks } from '@screens/Chat.vue'

const chatCallbacks = inject<ChatCallbacks>('chat-callbacks')
const isGenerating = inject<ComputedRef<boolean>>('isGenerating', computed(() => false))
const tipsManager = useTipsManager(store)
const llmManager: ILlmManager = LlmFactory.manager(store.config)

const props = defineProps({
  contextImage: String,
  compact: { type: Boolean, default: false },
  taskPreview: { type: Boolean, default: false },
  enableContext: { type: Boolean, default: false },
  contextDisabled: { type: Boolean, default: false },
  enableModelSelection: { type: Boolean, default: true },
  screenshotPending: { type: Boolean, default: false },
  chat: {
    type: Chat,
    required: true,
  },
  isLeftMost: {
    type: Boolean,
    default: false,
  }
})

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric'
  }
  return date.toLocaleString(undefined, options)
}

const chatMenuPosition = computed((): MenuPosition => {
  return /*window.api.platform == 'win32' ? 'left' :*/ 'below-right'
})

const isSaved = () => {
  return store.history.chats.some((c) => c.uuid == props.chat.uuid)
}

const hasMessages = () => {
  return props.chat.hasMessages()
}

const hasUsage = () => {
  return props.chat.messages.some(m => m.usage)
}

const historyProvider = (): string[] => {

  // start with chat messages
  const chatMessages = props.chat?.messages.filter(m => m.role === 'user') || []

  // add messages from other chats
  const otherMessages = store.history.chats.reduce((acc, chat) => {
    if (chat.uuid !== props.chat.uuid && chat.uuid != kMediaChatId) {
      return acc.concat(chat.messages.filter(m => m.role === 'user'))
    }
    return acc
  }, []).sort((a, b) => a.createdAt - b.createdAt)

  // we need only the content
  const history: string[] = [
    ...otherMessages,
    ...chatMessages,
  ].map((m) => m.content).filter((m) => m.trim() !== '')

  // now dedup preserving the order
  return Array.from(new Set(history))

}

const messageList = ref<InstanceType<typeof MessageList>|null>(null)
const prompt= ref<typeof Prompt>(null)
const conversationMode = ref<ConversationMode>('off')
const showModelSettings = ref(false)

const emit = defineEmits(['context-retake', 'context-remove', 'context-consumed', 'context-requested', 'prompt', 'stop-generation', 'toggle-sidebar'])

const onConversationMode = (mode: ConversationMode) => {
  conversationMode.value = mode
}

const onSetEngineModel = (engine: string, model: string) => {
  props.chat.setEngineModel(engine, model)
}

const onSendPrompt = (payload: SendPromptParams) => {
  emit('prompt', payload)
}

const onRunAgent = (agentId?: string) => {
  chatCallbacks?.onRunAgent(agentId)
}

const onStopGeneration = () => {
  emit('stop-generation', null)
}

const toggleSideBar = () => {
  emit('toggle-sidebar')
}

const onNewChat = () => {
  chatCallbacks?.onNewChat()
}

const onRenameChat = () => {
  chatCallbacks?.onRenameChat(props.chat)
}

const handleActionClick = async (action: string) => {

  // process
  if (action === 'toggle_temp') {
    onToggleTemporary()
  } else if (action === 'rename') {
    chatCallbacks?.onRenameChat(props.chat)
  } else if (action === 'delete') {
    chatCallbacks?.onDeleteChat(props.chat.uuid)
  } else if (action == 'exportMarkdown') {
    onExportMarkdown()
  } else if (action == 'exportPdf') {
    onExportPdf()
  } else if (action == 'usage') {
    onShowUsage()
  } else if (action == 'modelSettings') {
    showModelSettings.value = !showModelSettings.value
  }
}

const onToggleTemporary = () => {
  if (props.chat.temporary) {
    props.chat.temporary = false
    if (props.chat.hasMessages()) {
      store.addChat(props.chat)
    }
  } else {
    props.chat.temporary = true
    store.removeChat(props.chat)
  }
}

const onExportMarkdown = async () => {
  try {
    let content = `# ${props.chat.title}\n\n`
    for (const message of props.chat.messages) {
      content += `## ${t('chat.role.' + message.role)}\n\n${message.content}\n\n`
    }
    window.api.file.save({
      contents: window.api.base64.encode(content),
      url: `${props.chat.title}.md`,
      properties: {
        directory: 'documents',
        prompt: true,
      }
    })
  } catch (e) {
    console.error('Error exporting Markdown:', e)
    Dialog.show({
      title: t('common.error'),
      text: t('chat.export.error'),
    })
  }
}

const onExportPdf = async () => {
  try {
    
    // Prepare the chat area element for PDF export
    const messageList = document.querySelector<HTMLElement>('.chat-area .messages-list')
    if (!messageList) {
      throw new Error('Chat area not found')
    }

    // Clone and style
    const content = messageList.cloneNode(true) as HTMLElement
    content.style.height = 'auto'
    const mainElement = content.querySelector<HTMLElement>('main')
    if (mainElement) {
      mainElement.style.height = 'auto'
      mainElement.style.overflow = 'visible'
    }

    // Export to PDF using the service
    await exportToPdf({
      title: props.chat.title,
      element: content
    })

  } catch (e) {
    console.error('Error exporting PDF:', e)
    Dialog.show({
      title: t('common.error'),
      text: t('chat.export.error'),
    })
  }
}

const onShowUsage = () => {

  // Calculate total usage across all messages
  const totalUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    cached_tokens: 0,
    reasoning_tokens: 0,
  }

  for (const message of props.chat.messages) {
    if (message.usage) {
      totalUsage.prompt_tokens += message.usage.prompt_tokens || 0
      totalUsage.completion_tokens += message.usage.completion_tokens || 0
      if (message.usage.prompt_tokens_details?.cached_tokens) {
        totalUsage.cached_tokens += message.usage.prompt_tokens_details.cached_tokens
      }
      if (message.usage.completion_tokens_details?.reasoning_tokens) {
        totalUsage.reasoning_tokens += message.usage.completion_tokens_details.reasoning_tokens
      }
    }
  }

  // Build text in the same format as message usage
  const totalTokens = totalUsage.prompt_tokens + totalUsage.completion_tokens
  const text = [
    t('message.actions.usage.prompt', { prompt: totalUsage.prompt_tokens }),
    totalUsage.cached_tokens ?
      t('message.actions.usage.cached', { cached: totalUsage.cached_tokens }) :
      null,
    t('message.actions.usage.response', { completion: totalUsage.completion_tokens }),
    totalUsage.reasoning_tokens ?
      t('message.actions.usage.reasoning', { reasoning: totalUsage.reasoning_tokens }) :
      null,
  ].filter(Boolean).join('<br/>')

  Dialog.show({
    title: t('message.actions.usage.title', { total: totalTokens }),
    html: text,
  })
}

const onHideDeepResearchUsage = () => {
  tipsManager.setTipShown('deepResearchUsage')
}

defineExpose({

  focusPrompt: () => {
    prompt.value?.focus()
  },

  getDraft: () => prompt.value?.getDraft(),

  setPrompt: (userPrompt: string|Message) => {
    prompt.value?.setPrompt(userPrompt)
  },

  attach: (attachment: File) => {
    prompt.value.attach(attachment)
  },

  setExpert: (expert: Expert) => {
    prompt.value.setExpert(expert)
  },

  setDeepResearch: (active: boolean) => {
    prompt.value.setDeepResearch(active)
  },

  startDictation: () => {
    prompt.value.startDictation()
  },

  sendPrompt: () => {
    prompt.value.sendPrompt()
  },

})

</script>


<style scoped>

.split-pane {
  
  .sp-main {

    position: relative;
    background-color: var(--message-list-bg-color);

    header {

      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      container-type: inline-size;
      border-bottom: 1px solid transparent;

      .title {
        flex: 0 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .separator {
        flex-shrink: 0;
        color: var(--faded-text-color);
      }

      .created-at {
        flex-shrink: 0;
        font-size: var(--font-size-12);
        color: var(--faded-text-color);
        white-space: nowrap;
      }

      .incognito-badge {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: var(--space-2);
        color: var(--dimmed-text-color);
        font-size: var(--font-size-12);

        svg { width: 0.875rem; height: 0.875rem; }
      }

      .icon {
        &.hidden {
          display: none;
        }
      }

      .toggle-sidebar {
        position: relative;
        top: 0;
      }

      .new-chat {
        position: relative;
        top: 0;
      }

      @container (max-width: 600px) {
        .separator, .created-at {
          display: none;
        }
      }

      @container (max-width: 420px) {
        .incognito-badge span { display: none; }
      }

    }

    &:has(.search-nav) {
      header {
        border-bottom: 1px solid var(--sidebar-border-color);
      }
    }

    main {

      flex-direction: row;

      .chat-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        max-width: 100%;
        min-width: 0;
        min-height: 0;
        background-color: var(--message-list-bg-color);

        .deep-research-usage {
          padding: 1rem 1.5rem;
          padding-bottom: 0rem;
          color: var(--faded-text-color);
          height: auto;
          border-top: 1px solid var(--sidebar-border-color);

          display: flex;
          align-items: center;
          gap: 2rem;

          .deep-research-usage-close {
            cursor: pointer;
            font-size: 18.5px;
          }
        }

        &:deep() .chat-content-main {
          flex: 1;
        }

        &:deep() .prompt {
          margin: var(--space-4) var(--space-12) var(--space-12);
        }
      }

    }


  }

}

.model-settings {

  position: absolute;
  top: -1px;
  bottom: 0;
  right: -1px;
  
  width: 0px;
  transition: width 0.15s ease-in-out;
  overflow: hidden;

  &:deep() label {
    white-space: nowrap;
  }

  &.visible {
    width: var(--info-panel-width);
  }
}
.chat-content > :deep(.runtime-chat:not(.runtime-configuration)) { width: auto; margin: 0 var(--space-12) var(--space-12); }
.chat-content > :deep(.runtime-chat:empty) { display: none; }

.split-pane .chat-area > header { flex: 0 0 auto; min-height: var(--space-16); padding: var(--space-6) var(--space-8); }
.split-pane .chat-area > header .title { font-size: var(--font-size-14); font-weight: var(--font-weight-medium); min-width: 0; }
.chat-content { container: chat-layout / inline-size; }
.split-pane .chat-area main .chat-content > :deep(.prompt),
.chat-content > :deep(.runtime-chat:not(.runtime-configuration)),
.chat-content > :deep(.chat-agent-picker:not(.task-preview)) {
  box-sizing: border-box;
  width: min(calc(100% - var(--space-24)), calc(var(--space-32) * 12));
  margin-inline: auto;
}
.split-pane .chat-area main .chat-content > :deep(.prompt),
.chat-content > :deep(.runtime-chat:not(.runtime-configuration)) { margin-bottom: var(--space-8); }
.chat-content > :deep(.runtime-chat:empty) { margin: 0; }
.model-settings:not(.visible) { visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .model-settings { transition: none; } }

</style>
