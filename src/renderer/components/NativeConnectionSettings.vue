<template>
  <section class="form-section">
    <div class="section-heading"><h3>Native</h3><button type="button" @click="openCredentials">{{ t('nativeModels.credentials') }} <ArrowUpRightIcon /></button></div>
    <p>{{ t('agentDesign.nativeHelp') }}</p>
    <p>{{ t('nativeModels.help') }}</p>
  </section>
  <section class="form-section native-defaults">
    <h3>{{ t('runtimeDefaults.title') }}</h3>
    <p>{{ t('nativeModels.defaultHelp') }}</p>
    <RuntimeModelPicker :binding="selection" :catalog="catalog" :default-label="t('nativeModels.automatic')" @change="choose" />
    <p v-if="!catalog.providers?.length">{{ t('nativeModels.unconfigured') }}</p>
    <div class="form-actions">
      <button type="button" class="primary" :disabled="!dirty" @click="saveDefault">{{ t('runtimeDefaults.save') }}</button>
      <button type="button" :disabled="!dirty" @click="reset">{{ t('common.cancel') }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="saved && !dirty" role="status">{{ t('runtimeDefaults.saved') }}</p>
  </section>
  <ModelVisibilityEditor :catalog-warning="refreshWarning" :visibility="store.config.nativeRuntime?.modelVisibility" :catalog-key="catalogKey" :load-catalog="loadCatalog" :save-visibility="saveVisibility" />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowUpRightIcon } from 'lucide-vue-next'
import { store } from '@services/store'
import { t } from '@services/i18n'
import LlmFactory from '@services/llms/llm'
import { copyVisibility, nativeCatalog, nativeProviders } from '@services/native_models'
import { RuntimeModelVisibility } from '../../types/runtime'
import RuntimeModelPicker from './RuntimeModelPicker.vue'
import ModelVisibilityEditor from './ModelVisibilityEditor.vue'
const manager = LlmFactory.manager(store.config)
const catalog = computed(() => nativeCatalog(store.config, manager))
const catalogKey = computed(() => JSON.stringify(nativeProviders(store.config, manager, true).map(id => [id, manager.getEngineName(id)])))
const refreshWarning = ref('')
const selection = ref<{ provider?: string; model?: string }>({})
const baseline = ref(''), error = ref(''), saved = ref(false)
const key = (provider?: string, model?: string) => JSON.stringify([provider || '', model || ''])
const dirty = computed(() => key(selection.value.provider, selection.value.model) !== baseline.value)
const reset = () => {
  selection.value = { provider: store.config.nativeRuntime?.defaultProvider, model: store.config.nativeRuntime?.defaultModel }
  baseline.value = key(selection.value.provider, selection.value.model); error.value = ''; saved.value = false
}
watch(() => key(store.config.nativeRuntime?.defaultProvider, store.config.nativeRuntime?.defaultModel), next => { if (next !== baseline.value) reset() }, { immediate: true })
const choose = (choice: typeof selection.value) => { selection.value = choice; error.value = ''; saved.value = false }
const openCredentials = () => window.api.settings.open({ initialTab: 'models' })
const saveDefault = () => {
  error.value = ''
  const { provider, model } = selection.value
  if (provider && !catalog.value.models.some(m => m.provider === provider && m.id === model)) { error.value = t('runtime.invalidModel'); return }
  const previous = store.config.nativeRuntime
  try {
    store.config.nativeRuntime = { ...previous, defaultProvider: provider, defaultModel: model }
    store.saveSettings(); baseline.value = key(provider, model); saved.value = true
  } catch (e) { store.config.nativeRuntime = previous; error.value = e instanceof Error ? e.message : String(e) }
}
const saveVisibility = async (visibility: RuntimeModelVisibility) => {
  const previous = store.config.nativeRuntime
  try { store.config.nativeRuntime = { ...previous, modelVisibility: copyVisibility(visibility) }; store.saveSettings() }
  catch (e) { store.config.nativeRuntime = previous; throw e }
}
const loadCatalog = async (refresh: boolean) => {
  refreshWarning.value = ''
  if (refresh) {
    const failed: string[] = []
    for (const provider of nativeProviders(store.config, manager, true)) {
      const previous = store.config.engines[provider].models
      try { if (!await manager.loadModels(provider)) throw new Error() }
      catch { store.config.engines[provider].models = previous; failed.push(manager.getEngineName(provider)) }
    }
    if (failed.length) refreshWarning.value = t('nativeModels.refreshFailed', { providers: failed.join(', ') })
  }
  return nativeCatalog(store.config, manager, true)
}
</script>
