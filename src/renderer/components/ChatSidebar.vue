<template>
  <div class="sp-sidebar chat-sidebar" :class="{ 'manual-resize': manualResize }" :style="`flex-basis: ${width}px; display: ${visible ? 'inherit' : 'none'}`">
    <header>
      <div class="title">{{ t('chatList.title') }}</div>
      <button type="button" class="new-chat" :aria-label="t('common.newChat')" :title="t('common.newChat')" @click="onNewChat"><SquarePenIcon /></button>
    </header>
    <div class="chat-list-tools">
      <div class="form search" v-if="filtering">
        <div class="form-field">
          <input ref="inputFilter" :aria-label="t('common.search')" name="filter" v-model="filter" :placeholder="t('common.search')" @keyup="onFilterChange" @keydown.enter.prevent="onFilterNavigate" @keydown.escape.prevent="onToggleFilter" />
          <button type="button" class="clear-filter" :aria-label="t('common.clear')" @click="onClearFilter"><CircleXIcon /></button>
        </div>
      </div>
      <button type="button" class="search-trigger" v-if="!filtering" :disabled="selectMode" @click="onToggleFilter"><SearchIcon /><span>{{ t('chatList.searchPlaceholder') }}</span></button>
      <div class="display-mode button-group" v-if="!filtering && store.isFeatureEnabled('chat.folders')">
        <button name="timeline" :class="{active: displayMode == 'timeline'}" :aria-pressed="displayMode === 'timeline'" @click="displayMode = 'timeline'">
          <MessagesSquareIcon />
          {{ t('chatList.displayMode.timeline') }}
        </button>
        <button name="folders" :class="{active: displayMode == 'folder'}" :aria-pressed="displayMode === 'folder'" @click="displayMode = 'folder'">
          <FolderIcon />
          {{ t('chatList.displayMode.folders') }}
        </button>
      </div>
      <div class="toolbar">
        <button name="select" :aria-pressed="selectMode" @click="selectMode = !selectMode">{{ selectMode ? t('common.done') : t('common.select') }}</button>
        <button name="create-folder" @click="onNewFolder" v-if="displayMode === 'folder'"><FolderPlusIcon /> {{ t('sidebar.newFolder.title') }}</button>
        <div class="flex-push"></div>
        <!-- <button name="sort" :disabled="selectMode">{{ t('common.sortBy') }} <ChevronDownIcon /></button> -->

      </div>
    </div>
    <main>
      <ChatList :displayMode="displayMode" :chat="chat" :select-mode="selectMode" :filter="filter" :generating-chat-ids="generatingChatIds" ref="chatList" />
    </main>
    <footer v-if="selectMode" class="select-actions">
      <button name="select-all" @click="onSelectAll">{{ t('common.selectAllShort') }}</button>
      <button name="unselect-all" @click="onUnselectAll">{{ t('common.unselectAllShort') }}</button>
      <div class="flex-push"/>
      <button name="move" @click="onMove" v-if="displayMode === 'folder'"><FolderInputIcon /> {{ t('common.move') }}</button>
      <button name="delete" :aria-label="t('common.delete')" @click="onDelete"><Trash2Icon /></button>
    </footer>
    <div class="resizer" @mousedown="onResizeSidebarStart" v-if="visible">&nbsp;</div>
  </div>
</template>

<script setup lang="ts">

import useEventListener from '@composables/event_listener'
import useIpcListener from '@composables/ipc_listener'
import Chat from '@models/chat'
import Dialog from '@renderer/utils/dialog'
import type { ChatCallbacks, SearchState } from '@screens/Chat.vue'
import { t } from '@services/i18n'
import { store } from '@services/store'
import { CircleXIcon, FolderIcon, FolderInputIcon, FolderPlusIcon, MessagesSquareIcon, SearchIcon, SquarePenIcon, Trash2Icon } from 'lucide-vue-next'
import { ChatListMode } from 'types/config'
import { v4 as uuidv4 } from 'uuid'
import { inject, nextTick, onMounted, Ref, ref, watch } from 'vue'
import ChatList from './ChatList.vue'

const { onIpcEvent } = useIpcListener()
const { onDomEvent, offDomEvent } = useEventListener()
const chatCallbacks = inject<ChatCallbacks>('chat-callbacks')
const searchState = inject<SearchState>('searchState')
const chatActive = inject<Ref<boolean>>('chatActive')

defineProps({
  chat: {
    type: Chat,
  },
  generatingChatIds: {
    type: Array as () => string[],
    default: (): string[] => [],
  },
})

const visible = ref<boolean>(true)
const width = ref<number>(0)
const manualResize = ref(true)
const displayMode = ref<ChatListMode>('timeline')
const chatList = ref<typeof ChatList|null>(null)
const selectMode = ref<boolean>(false)
const inputFilter = ref<HTMLInputElement|null>(null)
const filtering = ref(false)
const filter = ref('')


let panelOffset = 0

onMounted(async () => {
  visible.value = window.api.store.get('sidebarVisible', true)
  width.value = window.api.store.get('sidebarWidth', 280)

  // depends on feature activation
  if (store.isFeatureEnabled('chat.folders')) {
    displayMode.value = store.config.appearance.chatList.mode
  } else {
    displayMode.value = 'timeline'
  }

  const sidebar = document.querySelector('.chat-sidebar') as HTMLElement
  const rect = sidebar?.getBoundingClientRect()
  panelOffset = rect?.left || 0

  // we don't want animations when mounting
  // so init manualResize to true
  // and set it to false after the first render
  await nextTick()
  manualResize.value = false

  // search
  onIpcEvent('search-chats', () => {
    if (!chatActive?.value) return
    onToggleFilter()
  })

})

if (searchState) {
  watch(searchState.filter, (value) => {
    if (value === null && filtering.value) {
      filter.value = ''
      filtering.value = false
    }
  })
}

const onToggleFilter = async () => {
  if (!searchState) return
  filter.value = ''
  searchState.filter.value = null
  filtering.value = !filtering.value
  await nextTick()
  if (filtering.value && inputFilter.value) {
    inputFilter.value.focus()
  }
}

const onFilterChange = () => {
  if (!searchState) return
  searchState.localSearch.value = false
  searchState.filter.value = filter.value.trim()
}

const onFilterNavigate = (event: KeyboardEvent) => {
  if (!searchState) return
  searchState.navigate.value = event.shiftKey ? -1 : 1
}

const onClearFilter = () => {
  if (!searchState) return
  if (filter.value === '') {
    searchState.filter.value = null
    filtering.value = false
  } else {
    filter.value = ''
    searchState.filter.value = ''
  }
}

const onNewChat = () => {
  onCancelSelect()
  chatCallbacks?.onNewChat()
}

const onNewFolder = async () => {
  const { value: name } = await Dialog.show({
    title: t('sidebar.newFolder.title'),
    input: 'text',
    inputValue: '',
    inputPlaceholder: t('sidebar.newFolder.placeholder'),
    showCancelButton: true,
  });
  if (name) {
    store.history.folders.push({ id: uuidv4(), name, chats: [] })
    store.saveHistory()
  }
}

const onSelectAll = () => {
  selectMode.value = true
  chatList.value!.selectAll()
}

const onUnselectAll = () => {
  selectMode.value = true
  chatList.value!.unselectAll()
}

const onCancelSelect = () => {
  selectMode.value = false
  chatList.value!.clearSelection()
}

const onDelete = () => {
  const selection = chatList.value!.getSelection()
  if (selection.length) {
    chatCallbacks?.onDeleteChat(selection)
  } else {
    selectMode.value = false
  }
}

const onMove = () => {
  const selection = chatList.value!.getSelection()
  if (selection.length) {
    chatCallbacks?.onMoveChat(selection)
  } else {
    selectMode.value = false
  }
}

const onResizeSidebarStart = async (event: MouseEvent) => {
  manualResize.value = true
  await nextTick()
  // Calculate offset based on where user clicked vs current width
  const actualWidth = (event.currentTarget as HTMLElement)?.parentElement?.getBoundingClientRect().width || width.value
  panelOffset = event.clientX - actualWidth
  onDomEvent(window, 'mousemove', onResizeSidebarMove)
  onDomEvent(window, 'mouseup', onResizeSidebarEnd)
}

const onResizeSidebarMove = (event: Event) => {
  const mouseEvent = event as MouseEvent
  width.value = Math.max(220, Math.min(400, mouseEvent.clientX - panelOffset))
}

const onResizeSidebarEnd = () => {
  offDomEvent(window, 'mousemove', onResizeSidebarMove)
  offDomEvent(window, 'mouseup', onResizeSidebarEnd)
  manualResize.value = false
  saveSidebarState()
}

const saveSidebarState = () => {
  window.api.store.set('sidebarVisible', visible.value)
  window.api.store.set('sidebarWidth', width.value)
}

const startFilter = async () => {
  filtering.value = true
  await nextTick()
  inputFilter.value?.focus()
}

const clearFilter = () => {
  filter.value = ''
  if (searchState) searchState.filter.value = null
  filtering.value = false
}

defineExpose({
  cancelSelectMode: onCancelSelect,
  isVisible: () => visible.value,
  hide: () => { visible.value = false; saveSidebarState() },
  show: () => { visible.value = true; saveSidebarState() },
  startFilter,
  clearFilter,
})

</script>


<style scoped>

.split-pane .chat-sidebar {
  flex: 0 0 0;
  max-width: min(30%, 340px);
  min-width: 0;
  position: relative;
  padding: var(--space-6) 0;
  gap: var(--space-6);
  background: var(--color-surface);
  border-color: var(--color-outline-subtle);
  transition: flex-basis 150ms ease;
}
.split-pane .chat-sidebar.manual-resize { transition: none; }
.split-pane .chat-sidebar header { min-height: var(--space-16); flex: 0 0 auto; padding: 0 var(--space-6) 0 var(--space-8); background: transparent; gap: var(--space-4); }
.split-pane .chat-sidebar header .title { font-size: var(--font-size-13); font-weight: var(--font-weight-semibold); }
.new-chat { display: grid; place-items: center; width: var(--space-16); height: var(--space-16); padding: var(--space-4); margin: 0; border: none; border-radius: var(--radius-lg); background: transparent; color: var(--sidebar-text-color); }
.new-chat:hover { background: var(--color-surface-high); }
.new-chat svg { width: var(--icon-lg); height: var(--icon-lg); }
.chat-list-tools { padding: 0 var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
.search-trigger { display: flex; justify-content: flex-start; align-items: center; gap: var(--space-4); min-height: var(--space-16); margin: 0; padding: var(--space-3) var(--space-4); border: var(--space-px) solid var(--color-outline-subtle); border-radius: var(--radius-lg); background: var(--color-surface-lowest); color: var(--faded-text-color); font-size: var(--font-size-12); text-align: left; }
.search-trigger svg { width: var(--icon-md); height: var(--icon-md); }
.search { width: 100%; }
.search .form-field { margin: 0; position: relative; }
.search input { min-width: 0; padding: var(--space-4) var(--space-16) var(--space-4) var(--space-6); font-size: var(--font-size-12); border-radius: var(--radius-lg); }
.clear-filter { position: absolute; right: var(--space-2); top: 50%; transform: translateY(-50%); display: grid; place-items: center; margin: 0; padding: var(--space-2); border: none; background: transparent; color: var(--faded-text-color); }
.clear-filter svg { width: var(--icon-md); height: var(--icon-md); }
.display-mode.button-group { display: flex; width: 100%; padding: var(--space-1); box-sizing: border-box; border-radius: var(--radius-lg); background: var(--color-surface-base); }
.display-mode.button-group button { flex: 1; min-width: 0; justify-content: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); margin: 0; border: none; border-radius: var(--radius-md); color: var(--faded-text-color); background: transparent; font-size: var(--font-size-12); }
.display-mode.button-group button.active { background: var(--color-surface-lowest); color: var(--text-color); box-shadow: var(--shadow-card); }
.display-mode svg { width: var(--icon-md); height: var(--icon-md); }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.toolbar button { margin: 0; padding: var(--space-2) var(--space-4); border: none; background: transparent; color: var(--faded-text-color); font-size: var(--font-size-11); border-radius: var(--radius-sm); }
.toolbar button:hover { background: var(--color-surface-high); color: var(--text-color); }
.split-pane .chat-sidebar main { padding: 0 var(--space-4); min-height: 0; }
.split-pane .chat-sidebar footer.select-actions { flex-shrink: 0; flex-wrap: wrap; justify-content: flex-start; gap: var(--space-2); padding: var(--space-4); margin: 0 var(--space-4); border-top: var(--space-px) solid var(--border-color); }
.select-actions button { margin: 0; padding: var(--space-3) var(--space-4); font-size: var(--font-size-12); }
.select-actions button[name=delete] { color: var(--color-error); }
.resizer { position: absolute; top: 0; right: 0; width: var(--space-2); height: 100%; cursor: ew-resize; z-index: 2; }
.resizer:hover { background: var(--color-primary); }
@media (max-width: 860px) {
  .split-pane .chat-sidebar { max-width: 220px; }
}

</style>
