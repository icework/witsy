<template>
  <div class="tab-content">
    <header>
      <div class="title">{{ t('settings.tabs.chat') }}</div>
    </header>
    <main class="form form-vertical form-large">
      <section class="history-settings agent-form">
        <div class="form-section">
          <div class="section-heading"><h3>{{ t('settings.chat.history.title') }}</h3></div>
          <p>{{ t('settings.chat.history.help') }}</p>
          <div class="form-field horizontal">
            <input id="incognito-mode" type="checkbox" v-model="incognito" @change="save" />
            <label for="incognito-mode">{{ t('settings.chat.history.incognito') }}</label>
          </div>
          <div class="form-field archive-folder">
            <label for="archive-folder">{{ t('settings.chat.history.archiveFolder') }}</label>
            <div class="folder-control">
              <input id="archive-folder" :value="archiveFolder" readonly :placeholder="t('settings.chat.history.notConfigured')" :title="archiveFolder" />
              <div class="folder-actions">
                <button type="button" @click="chooseArchiveFolder">{{ t('common.browse') }}</button>
                <button v-if="archiveFolder" type="button" class="secondary" @click="clearArchiveFolder">{{ t('common.clear') }}</button>
              </div>
            </div>
            <div class="help">{{ t('settings.chat.history.archiveHelp') }}</div>
          </div>
        </div>
      </section>
      <div class="form-field layout">
        <label>{{ t('settings.chat.listLayout') }}</label>
        <select v-model="layout" @change="save">
          <option value="normal">{{ t('settings.chat.listLayouts.cozy') }}</option>
          <option value="compact">{{ t('settings.chat.listLayouts.compact') }}</option>
        </select>
      </div>
      <div class="form-field theme">
        <label>{{ t('settings.chat.theme') }}</label>
        <select v-model="theme" @change="save">
          <option value="openai">{{ t('settings.chat.themes.openai') }}</option>
          <option value="conversation">{{ t('settings.chat.themes.conversation') }}</option>
        </select>
      </div>
      <div class="form-field send-key">
        <label>{{ t('settings.chat.sendKey.title') }}</label>
        <select v-model="sendKey" @change="save">
          <option value="enter">{{ t('settings.chat.sendKey.enter') }}</option>
          <option value="shiftEner">{{ t('settings.chat.sendKey.shiftEnter') }}</option>
        </select>
      </div>
      <div class="form-field previews">
        <label>{{ t('settings.chat.previews.title') }}</label>
      </div>
      <div class="form-field horizontal run-at-login">
        <input type="checkbox" id="preview-html" v-model="previewHtml" @change="save" />
        <label for="preview-html">{{ t('settings.chat.previews.html') }}</label>
      </div>
      <div class="form-field copy">
        <label>{{ t('settings.chat.copyFormat.title') }}</label>
        <select v-model="copyFormat" @change="save">
          <option value="text">{{ t('settings.chat.copyFormat.text') }}</option>
          <option value="markdown">{{ t('settings.chat.copyFormat.markdown') }}</option>
        </select>
        <div class="help">{{ t('settings.chat.copyFormat.help') }}</div>
      </div>
      <div class="form-field tools">
        <label>{{ t('settings.chat.toolCallsDisplay.title') }}</label>
        <select v-model="toolCallsDisplay" @change="save">
          <option value="none">{{ t('settings.chat.toolCallsDisplay.none') }}</option>
          <option value="summary">{{ t('settings.chat.toolCallsDisplay.summary') }}</option>
          <option value="details">{{ t('settings.chat.toolCallsDisplay.details') }}</option>
        </select>
      </div>
      <div class="form-field font-family">
        <label>{{ t('settings.chat.font') }}</label>
        <select v-model="fontFamily" @change="save">
          <option value="">{{ t('common.default') }}</option>
          <option v-for="font in fonts" :value="font">{{ font.replaceAll('"', '') }}</option>
        </select>
      </div>
      <div class="form-field font-size">
        <label>{{ t('settings.chat.fontSize') }}</label>
        <div class="control-group">
          <span class="slider-label small">A</span>
          <div class="slider-group">
            <input type="range" min="1" max="5" v-model="fontSize" @input="save" />
            <datalist id="fontsize">
              <option value="1"></option>
              <option value="2"></option>
              <option value="3"></option>
              <option value="4"></option>
              <option value="5"></option>
            </datalist>
          </div>
          <span class="slider-label large">A</span>
        </div>
      </div>
      <div class="form-field example">
        <label>{{ t('settings.chat.fontExample.title') }}</label>
        <div class="sample messages" :class="[ chatTheme, 'size' + store.config.appearance.chat.fontSize ]" :style="fontStyle">
          <MessageItem
          :message="Message.fromJson({
            uuid: 'fontsize-example',
            type: 'text',
            role: 'assistant',
            content: t('settings.chat.fontExample.text'),
            engine: 'engine',
          })"
          :show-role="false"
          :show-actions="false"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">

import { ChatListLayout, ToolCallsDisplay, SendKey, TextFormat } from 'types/config';
import { ref, computed, provide } from 'vue'
import { store } from '@services/store'
import { t } from '@services/i18n'
import Message from '@models/message'
import MessageItem from '@components/MessageItem.vue'

// provide null chat-callbacks for MessageItem (no actions available in settings preview)
provide('chat-callbacks', null)

const theme = ref(null)
const fontSize = ref(null)
const fontFamily = ref('')
const previewHtml = ref(true)
const copyFormat = ref<TextFormat>('text')
const sendKey = ref<SendKey>('enter')
const toolCallsDisplay = ref<ToolCallsDisplay>('summary')
const layout = ref<ChatListLayout>('normal')
const archiveFolder = ref('')
const incognito = ref(false)
const fonts = ref(window.api.app.listFonts())

const chatTheme = computed(() => store.config.appearance.chat.theme)
const fontStyle = computed(() => {
  return {
    '--font-family-base': store.config.appearance.chat.fontFamily,
  }
})

const load = () => {
  store.config.chatHistory ??= { archiveFolder: '', incognito: false }
  theme.value = store.config.appearance.chat.theme || 'openai'
  layout.value = store.config.appearance.chatList.layout || 'normal'
  copyFormat.value = store.config.appearance.chat.copyFormat || 'text'
  sendKey.value = store.config.appearance.chat.sendKey || 'enter'
  previewHtml.value = store.config.appearance.chat.autoPreview.html ?? true
  toolCallsDisplay.value = store.config.appearance.chat.toolCallsDisplay || 'summary'
  fontFamily.value = store.config.appearance.chat.fontFamily || ''
  fontSize.value = store.config.appearance.chat.fontSize || 3
  archiveFolder.value = store.config.chatHistory.archiveFolder || ''
  incognito.value = store.config.chatHistory.incognito || false
}

const chooseArchiveFolder = async () => {
  const folder = await window.api.file.pickDirectory()
  if (!folder) return
  archiveFolder.value = folder
  save()
  store.saveHistory()
}

const clearArchiveFolder = () => {
  archiveFolder.value = ''
  save()
}

const save = () => {
  store.config.chatHistory ??= { archiveFolder: '', incognito: false }
  store.config.appearance.chat.theme = theme.value
  store.config.appearance.chat.fontFamily = fontFamily.value
  store.config.appearance.chat.fontSize = fontSize.value
  store.config.appearance.chat.sendKey = sendKey.value
  store.config.appearance.chatList.layout = layout.value
  store.config.appearance.chat.autoPreview.html = previewHtml.value
  store.config.appearance.chat.toolCallsDisplay = toolCallsDisplay.value
  store.config.appearance.chat.copyFormat = copyFormat.value
  store.config.chatHistory.archiveFolder = archiveFolder.value
  store.config.chatHistory.incognito = incognito.value
  store.saveSettings()
}

defineExpose({ load })

</script>

<style scoped>

.history-settings { margin-bottom: var(--space-12); }

.folder-control { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; width: 100%; min-width: 0; }
.folder-control input { flex: 1 1 16rem; min-width: 0; }
.folder-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.folder-control button { flex: 0 0 auto; }

.slider-label.small {
  font-size: 10.5px;
}

.slider-label.large {
  font-size: 16px;
}

.sample {
  box-sizing: border-box;
  margin-top: 0.5rem;
  width: 100%;
  border: 1px solid var(--sidebar-border-color);
  padding: 1rem;
}

.messages * {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
}

</style>
