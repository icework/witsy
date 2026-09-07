<template>
  <form class="agent-form provider-credentials" @submit.prevent="save">
    <div class="editor-heading"><h2>{{ name }}</h2><p>{{ t('nativeModels.credentialHelp') }}</p></div>
    <section class="form-section">
      <h3>{{ t('nativeModels.credentials') }}</h3>
      <label v-if="custom">{{ t('common.name') }}<input name="label" v-model="draft.label" required /></label>
      <label v-if="custom">{{ t('settings.engines.custom.apiSpecification') }}<input :value="draft.api === 'azure' ? 'Azure OpenAI' : 'OpenAI'" readonly /></label>
      <label>{{ t('settings.engines.apiKey') }}<input name="apiKey" type="password" v-model="draft.apiKey" autocomplete="off" spellcheck="false" /></label>
      <label>{{ t('settings.engines.apiBaseURL') }}<input name="baseURL" v-model="draft.baseURL" :placeholder="baseURLPlaceholder" :required="custom" /></label>
      <template v-if="draft.api === 'azure'">
        <div class="agent-row">
          <label>{{ t('settings.engines.custom.deployment') }}<input name="deployment" v-model="draft.deployment" required /></label>
          <label>{{ t('settings.engines.custom.apiVersion') }}<input name="apiVersion" v-model="draft.apiVersion" required /></label>
        </div>
      </template>
      <template v-if="engine === 'google' && vertexai">
        <div class="agent-row">
          <label>{{ t('settings.engines.google.project') }}<input name="project" v-model="draft.project" /></label>
          <label>{{ t('settings.engines.google.location') }}<input name="location" v-model="draft.location" /></label>
        </div>
      </template>
      <div class="form-actions">
        <button class="primary" type="submit" :disabled="!dirty">{{ t('common.save') }}</button>
        <button type="button" :disabled="!dirty" @click="load">{{ t('common.cancel') }}</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="saved && !dirty" role="status">{{ t('nativeModels.credentialsSaved') }}</p>
    </section>
    <section class="form-section">
      <p>{{ t('nativeModels.manageHelp') }}</p>
      <div class="form-actions"><button type="button" @click="openNative">{{ t('nativeModels.manage') }} <ArrowUpRightIcon /></button></div>
    </section>
  </form>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowUpRightIcon } from 'lucide-vue-next'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
import defaults from '@root/defaults/settings.json'
import { CustomEngineConfig } from '../../types/config'
type CredentialConfig = CustomEngineConfig & { vertexai?: boolean; project?: string; location?: string }
const props = defineProps<{ engine: string; name: string }>()
const manager = LlmFactory.manager(store.config)
const custom = computed(() => manager.isCustomEngine(props.engine))
const vertexai = computed(() => (store.config.engines[props.engine] as CredentialConfig)?.vertexai)
const baseURLPlaceholder = computed(() => (defaults.engines as Record<string, { baseURL?: string }>)[props.engine]?.baseURL || '')
const fields = ['apiKey', 'baseURL', 'label', 'api', 'deployment', 'apiVersion', 'project', 'location'] as const
const draft = ref<Record<typeof fields[number], string>>({ apiKey: '', baseURL: '', label: '', api: '', deployment: '', apiVersion: '', project: '', location: '' })
const baseline = ref(''), saved = ref(false), error = ref('')
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const load = () => {
  const config = store.config.engines[props.engine] as CredentialConfig
  for (const key of fields) draft.value[key] = config?.[key] || ''
  baseline.value = JSON.stringify(draft.value); saved.value = false; error.value = ''
}
watch(() => props.engine, load, { immediate: true })
const save = () => {
  error.value = ''; saved.value = false
  const existing = store.config.engines[props.engine] as CredentialConfig
  if (!existing) { error.value = t('chatAgent.connectionUnavailable'); return }
  const before = JSON.parse(baseline.value) as typeof draft.value
  // Only changed credential fields are patched. Catalogs, defaults and advanced options stay intact.
  const patch = Object.fromEntries(fields.filter(key => key !== 'api' && draft.value[key] !== before[key]).map(key => [key, draft.value[key]]))
  try { store.config.engines[props.engine] = { ...existing, ...patch }; store.saveSettings(); baseline.value = JSON.stringify(draft.value); saved.value = true }
  catch (e) { store.config.engines[props.engine] = existing; error.value = e instanceof Error ? e.message : String(e) }
}
const openNative = () => window.api.settings.open({ initialTab: 'runtimeconnections', native: true })
defineExpose({ load })
</script>
