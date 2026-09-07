<template>
  <div class="tab-content">
    <header>
      <div class="title">{{ t('settings.tabs.general') }}</div>
    </header>
    <main class="form form-vertical form-large">
      <div class="form-field appearance" v-if="store.isFeatureEnabled('appearance')">
        <label>{{ t('settings.general.theme') }}</label>
        <div class="form-subgroup">
          <div @click="setAppearanceTheme('light')" :class="{ selected: appearance == 'light' }">
            <img src="/assets/appearance-light.png" />
            {{ t('settings.general.themes.light') }}
          </div>
          <div @click="setAppearanceTheme('dark')" :class="{ selected: appearance == 'dark' }">
            <img src="/assets/appearance-dark.png" />
            {{ t('settings.general.themes.dark') }}
          </div>
          <div @click="setAppearanceTheme('system')" :class="{ selected: appearance == 'system' }">
            <img src="/assets/appearance-system.png" />
            {{ t('settings.general.themes.system') }}
          </div>
        </div>
      </div>
      <!-- <div class="form-field lightTint" v-if="store.isFeatureEnabled('appearance') && appearanceTheme.getTheme() === 'light'">
        <label>{{ t('settings.general.lightTint') }}</label>
        <select v-model="lightTint" @change="onTintChange">
          <option value="white">{{ t('settings.general.tints.white') }}</option>
          <option value="gray">{{ t('settings.general.tints.gray') }}</option>
        </select>
      </div> -->
      <div class="form-field darkTint" v-if="store.isFeatureEnabled('appearance')">
        <label>{{ t('settings.general.darkTint') }}</label>
        <select v-model="darkTint" @change="save">
          <option value="black">{{ t('settings.general.tints.black') }}</option>
          <option value="blue">{{ t('settings.general.tints.blue') }}</option>
        </select>
      </div>
      <div class="form-field localeUI">
        <label>{{ t('settings.general.localeUI') }}</label>
        <LangSelect v-model="localeUI" default-text="common.language.system" :filter="locales" @change="save" />
      </div>
      <div class="form-field reset-tips">
        <label>{{ t('settings.general.resetTips') }}</label>
        <button @click.prevent="onResetTips">{{ t('common.reset') }}</button>
      </div>
      <div class="form-field horizontal run-at-login">
        <input type="checkbox" id="run-at-login" v-model="runAtLogin" @change="save" />
        <label for="run-at-login">{{ t('settings.general.runAtLogin') }}</label>
      </div>
      <div class="form-field horizontal hide-on-startup">
        <input type="checkbox" id="hide-on-startup" v-model="hideOnStartup" @change="save" />
        <label for="hide-on-startup">{{ t('settings.general.hideOnStartup') }}</label>
      </div>
      <div class="form-field horizontal keep-running">
        <input type="checkbox" id="keep-running" v-model="keepRunning" @change="save" />
        <label for="keep-running">{{ t('settings.general.keepInStatusBar') }}</label>
      </div>
      <div class="form-field backups">
        <label>{{ t('backup.settingsTitle') }}</label>
        <p class="backup-description">{{ t('backup.settingsHelp') }}</p>
        <div class="form-subgroup backup-actions">
          <button type="button" name="export-backup" @click="exportBackup"><DownloadIcon />{{ t('menu.file.backupExport') }}</button>
          <button type="button" name="import-backup" @click="importBackup"><UploadIcon />{{ t('menu.file.backupImport') }}</button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">

import LangSelect from '@components/LangSelect.vue'
import { t } from '@services/i18n'
import { store } from '@services/store'
import { ref } from 'vue'
import { DownloadIcon, UploadIcon } from 'lucide-vue-next'

const exportBackup = () => { window.api.backup.export() }
const importBackup = () => { window.api.backup.import() }

const appearance = ref(null)
const darkTint = ref(null)
const lightTint = ref(null)
const locales = ref([])
const localeUI = ref(null)
const runAtLogin = ref(false)
const hideOnStartup = ref(false)
const keepRunning = ref(false)

const setAppearanceTheme = (value: string) => {
  appearance.value = value
  window.api.app.setAppearanceTheme(value)
  save()
}

const load = () => {
  appearance.value = store.config.appearance.theme || 'system'
  lightTint.value = store.config.appearance.lightTint || 'white'
  darkTint.value = store.config.appearance.darkTint || 'black'
  locales.value = Object.keys(window.api.config.getI18nMessages())
  localeUI.value = store.config.general.locale
  runAtLogin.value = window.api.runAtLogin.get()
  hideOnStartup.value = store.config.general.hideOnStartup
  keepRunning.value = store.config.general.keepRunning
}

const onResetTips = () => {
  store.config.general.tips = {}
  store.saveSettings()
}

const save = () => {
  store.config.appearance.theme = appearance.value
  store.config.appearance.lightTint = lightTint.value
  store.config.appearance.darkTint = darkTint.value
  store.config.general.locale = localeUI.value
  window.api.runAtLogin.set(runAtLogin.value)
  store.config.general.hideOnStartup = hideOnStartup.value
  store.config.general.keepRunning = keepRunning.value
  store.saveSettings()
}

defineExpose({ load })

</script>


<style scoped>

dialog.settings .sp-main {
  width: 480px;
}

.form .form-field label {
  min-width: 170px;
}

.appearance {
  padding-bottom: 8px;
  margin-top: 0px;
}

.appearance .form-subgroup {
  margin-top: 1rem;
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 3rem;
}

.appearance .form-subgroup div {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.appearance img {
  height: auto;
  width: 64px;
  object-fit: contain;
  padding: 1px;
  border: 3px solid transparent;
}

.appearance div {
  text-align: center;
}

.appearance div.selected img {
  border: 3px solid var(--highlight-color);
  border-radius: 8px;
}

.form .form-field.backups { box-sizing: border-box; padding: var(--space-12); margin-top: var(--space-12); gap: var(--space-8); border: var(--space-px) solid var(--border-color); border-radius: var(--radius-xl); background: var(--background-color-light); }
.backup-description { margin: 0; font-size: var(--font-size-13); line-height: 1.65; color: var(--faded-text-color); }
.backup-actions { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.backup-actions button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-4); margin: 0; border-radius: var(--radius-lg); min-height: var(--space-20); }
.backup-actions svg { width: var(--icon-md); height: var(--icon-md); }
.appearance .form-subgroup { flex-wrap: wrap; gap: var(--space-12); justify-content: flex-start; }
</style>