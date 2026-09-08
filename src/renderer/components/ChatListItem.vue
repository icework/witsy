<template>
  <div class="container" role="button" tabindex="0" :aria-label="chat.title" :aria-current="!selectMode && chat.uuid === active?.uuid ? 'true' : undefined" @keydown.enter.self.prevent="($event.currentTarget as HTMLElement).click()" @keydown.space.self.prevent="($event.currentTarget as HTMLElement).click()">
    <div class="chat" :class="[{ selected: !selectMode && chat.uuid == active?.uuid }, store.config.appearance.chatList.layout]">
      <input type="checkbox" class="select" :aria-label="chat.title" :checked="selection.includes(chat.uuid)" v-if="selectMode"/>
      <div class="info" @dblclick="onRenameChat">
        <div class="title" :title="chat.title">{{ chat.title }}</div>
      </div>
      <div class="generating-indicator" v-if="generating">
        <Spinner />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import { inject } from 'vue'
import Chat from '@models/chat'
import Spinner from './Spinner.vue'
import { store } from '@services/store'
import type { ChatCallbacks } from '@screens/Chat.vue'

const chatCallbacks = inject<ChatCallbacks>('chat-callbacks')

const props = defineProps({
  chat: {
    type: Chat,
    required: true,
  },
  active: {
    type: Chat,
    default: null,
  },
  selectMode: {
    type: Boolean,
    default: false,
  },
  selection: {
    type: Array<String>,
    required: true,
  },
  generating: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'menu']);

const onRenameChat = () => {
  if (props.selectMode) return
  chatCallbacks?.onRenameChat(props.chat)
}

</script>

<style scoped>

.container {
  
  cursor: pointer;

  .chat {
    
    margin: 0;
    padding: var(--space-6);
    display: flex;
    flex-direction: row;
    align-items: center;
    border-radius: 0.5rem;

    &.selected {
      background-color: var(--sidebar-selected-color);
    }

    .info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;

      * {
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.5em;
      }
    }

    .title {
      font-weight: var(--font-weight-regular);
      font-size: var(--font-size-13);
    }

    input {
      cursor: pointer;
      margin-right: 0.75rem;
      text-align: left;
      width: var(--icon-lg);
    }

    &.compact {
      margin: 0;
      padding: 0.5rem;
      padding-left: 0.75rem;
      max-height: 1lh;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      .title {
        font-size: 14px;
      }

    }

    .generating-indicator {
      margin-left: auto;
      padding-right: 0.25rem;
      display: flex;
      align-items: center;
    }

  }

}



.container { border-radius: var(--radius-lg); margin-bottom: var(--space-1); }
.container:focus-visible { outline: var(--space-1) solid var(--color-focus); outline-offset: calc(-1 * var(--space-1)); }
.container .chat { min-height: var(--space-20); box-sizing: border-box; color: var(--sidebar-text-color); }
.container:hover .chat:not(.selected) { background: var(--color-surface-low); }
.container .chat.selected { background: var(--color-surface-high); color: var(--text-color); }
.container .chat.selected .title { font-weight: var(--font-weight-medium); }
.container .chat .title { white-space: nowrap; }
.container .chat.compact { min-height: var(--space-16); }

</style>
