<template>
  <section class="form-section model-visibility" :aria-busy="loading">
    <div class="section-heading"><h3>{{ t('runtimeModels.title') }}</h3><button type="button" :disabled="loading || saving" @click="load(true)"><RefreshCwIcon />{{ t('runtimeModels.refresh') }}</button></div>
    <p>{{ t('runtimeModels.help') }}</p>
    <p v-if="loading" role="status">{{ t('runtimeModels.loading') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="catalog.providers?.length">
      <input class="catalog-search" type="search" v-model="query" :aria-label="t('runtimeModels.search')" :placeholder="t('runtimeModels.search')" />
      <div class="catalog-layout">
        <div class="providers-pane">
          <div class="pane-heading"><strong>{{ t('runtimeModels.providers') }}</strong><span>{{ enabledProviders }} / {{ catalog.providers.length }}</span></div>
          <div class="provider-list">
            <div v-for="provider in matchingProviders" :key="provider.id" class="provider-row" :class="{ selected: active === provider.id }">
              <input type="checkbox" :aria-label="t('runtimeModels.showProvider', { name: provider.name })" :checked="providerVisible(provider.id)" :disabled="saving" @change="toggleProvider(provider.id, ($event.target as HTMLInputElement).checked)" />
              <button type="button" :aria-pressed="active === provider.id" :title="provider.name" @click="active = provider.id"><strong>{{ provider.name }}</strong><small>{{ visibleCount(provider.id) }} / {{ providerModels(provider.id).length }} {{ t('runtimeModels.models') }}</small></button>
            </div>
            <p v-if="!matchingProviders.length" class="empty-catalog">{{ t('runtimeModels.noMatches') }}</p>
          </div>
        </div>
        <div class="models-pane">
          <div class="pane-heading"><strong :title="activeName">{{ activeName }}</strong><span>{{ visibleCount(active) }} / {{ providerModels(active).length }}</span></div>
          <div class="bulk-actions"><button type="button" :disabled="saving || !active" @click="showModels">{{ t('runtimeModels.showAll') }}</button><button type="button" :disabled="saving || !active" @click="hideModels">{{ t('runtimeModels.hideAll') }}</button></div>
          <p v-if="active && !providerVisible(active)" class="provider-note">{{ t('runtimeModels.providerHidden') }}</p>
          <div class="model-list">
            <label v-for="model in matchingModels.slice(0, limit)" :key="model.id" class="model-row" :title="model.id">
              <input type="checkbox" :checked="modelVisible(active, model.id)" :disabled="saving" @change="toggleModel(model.id, ($event.target as HTMLInputElement).checked)" />
              <span><strong>{{ model.name }}</strong><small v-if="model.name !== model.id">{{ model.id }}</small></span>
            </label>
            <p v-if="!matchingModels.length" class="empty-catalog">{{ query ? t('runtimeModels.noMatches') : t('runtimeModels.emptyProvider') }}</p>
            <button v-if="matchingModels.length > limit" type="button" class="show-more" @click="limit += 60">{{ t('runtimeModels.showMore', { count: matchingModels.length - limit }) }}</button>
          </div>
        </div>
      </div>
    </template>
    <p v-else-if="!loading && !error" class="empty-catalog">{{ t('runtimeModels.empty') }}</p>
    <div class="visibility-actions form-actions">
      <button class="primary" type="button" :disabled="!dirty || saving || loading" @click="save">{{ t('runtimeModels.save') }}</button>
      <button type="button" :disabled="!dirty || saving" @click="reset">{{ t('common.cancel') }}</button>
      <span v-if="dirty">{{ t('runtimeModels.unsaved') }}</span>
      <span v-else-if="saved" role="status">{{ t('runtimeModels.saved') }}</span>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RefreshCwIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'
import { RuntimeBinding, RuntimeCatalog, RuntimeConnection, RuntimeModelVisibility } from '../../types/runtime'
const props = defineProps<{ connection: RuntimeConnection; binding: RuntimeBinding }>()
const emit = defineEmits<{ saved: [connection: RuntimeConnection] }>()
const catalog = ref<RuntimeCatalog>({ providers: [], agents: [], profiles: [], models: [] })
const visibility = ref<RuntimeModelVisibility>({})
const baseline = ref('{}')
const loading = ref(false), saving = ref(false), error = ref(''), saved = ref(false)
const active = ref(''), query = ref(''), limit = ref(60)
let revision = 0
const dirty = computed(() => JSON.stringify(visibility.value) !== baseline.value)
const providerModels = (id: string) => catalog.value.models.filter(m => m.provider === id)
const providerVisible = (id: string) => !visibility.value.providers || visibility.value.providers.includes(id)
const modelVisible = (provider: string, model: string) => !Object.hasOwn(visibility.value.models || {}, provider) || visibility.value.models[provider].includes(model)
const visibleCount = (id: string) => providerModels(id).filter(m => modelVisible(id, m.id)).length
const enabledProviders = computed(() => catalog.value.providers?.filter(p => providerVisible(p.id)).length || 0)
const activeName = computed(() => catalog.value.providers?.find(p => p.id === active.value)?.name || t('runtimeModels.models'))
const search = computed(() => query.value.trim().toLowerCase())
const matches = (value: string) => value.toLowerCase().includes(search.value)
const matchingProviders = computed(() => (catalog.value.providers || []).filter(p => matches(p.name) || matches(p.id) || providerModels(p.id).some(m => matches(m.id) || matches(m.name))))
const matchingModels = computed(() => providerModels(active.value).filter(m => matches(activeName.value) || matches(active.value) || matches(m.id) || matches(m.name)))
const reset = () => { visibility.value = JSON.parse(JSON.stringify(props.connection.modelVisibility || {})); baseline.value = JSON.stringify(visibility.value); saved.value = false }
watch(() => [props.connection.id, JSON.stringify(props.connection.modelVisibility || {})], (value, previous) => {
  if (value[0] !== previous?.[0] || value[1] !== baseline.value) reset()
}, { immediate: true })
watch([active, query], () => { limit.value = 60 })
watch(matchingProviders, providers => { if (!providers.some(p => p.id === active.value)) active.value = providers[0]?.id || '' })
const toggleProvider = (id: string, checked: boolean) => {
  const values = new Set(visibility.value.providers || catalog.value.providers?.map(p => p.id) || [])
  if (checked) values.add(id); else values.delete(id)
  visibility.value.providers = [...values]
}
const toggleModel = (id: string, checked: boolean) => {
  const models = { ...visibility.value.models }
  const values = new Set(models[active.value] || providerModels(active.value).map(m => m.id))
  if (checked) values.add(id); else values.delete(id)
  models[active.value] = [...values]; visibility.value.models = models
}
const showModels = () => { const models = { ...visibility.value.models }; delete models[active.value]; visibility.value.models = models }
const hideModels = () => { visibility.value.models = { ...visibility.value.models, [active.value]: [] } }
const load = async (refresh = false) => {
  const request = ++revision
  loading.value = true; error.value = ''
  try {
    const result = await window.api.runtime.catalog({ ...props.binding }, { includeHidden: true, refresh })
    if (request !== revision) return
    catalog.value = { ...result, providers: result.providers || [...new Set(result.models.map(m => m.provider))].map(id => ({ id, name: id })) }
    if (!catalog.value.providers.some(p => p.id === active.value)) active.value = catalog.value.defaults?.provider || catalog.value.providers[0]?.id || ''
  } catch (e) { if (request === revision) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (request === revision) loading.value = false }
}
watch(() => JSON.stringify([props.binding.connectionId, props.binding.profile, props.binding.directory]), () => {
  catalog.value = { providers: [], agents: [], profiles: [], models: [] }; active.value = ''; query.value = ''; void load()
}, { immediate: true })
onBeforeUnmount(() => { revision++ })
const save = async () => {
  saving.value = true; error.value = ''
  try {
    const result = await window.api.runtime.setModelVisibility(props.connection.id, JSON.parse(JSON.stringify(visibility.value)))
    baseline.value = JSON.stringify(visibility.value); emit('saved', result); saved.value = true
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { saving.value = false }
}
</script>
<style scoped>
.model-visibility { container: runtime-catalog / inline-size; }
.catalog-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); border: var(--space-px) solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.providers-pane, .models-pane { min-width: 0; }
.providers-pane { background: var(--background-color-light); border-right: var(--space-px) solid var(--border-color); }
.pane-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-8); min-width: 0; font-size: var(--font-size-13); }
.pane-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pane-heading > span { white-space: nowrap; color: var(--faded-text-color); font-size: var(--font-size-12); }
.provider-list, .model-list { max-height: calc(var(--space-32) * 4); overflow: auto; overscroll-behavior: contain; padding: var(--space-4); }
.provider-row { display: flex; align-items: center; gap: var(--space-4); border-radius: var(--radius-md); padding: var(--space-2) var(--space-4); }
.provider-row.selected { background: var(--background-color); box-shadow: var(--shadow-card); }
.provider-row button { display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-width: 0; gap: 0; padding: var(--space-4); border: none; background: transparent; text-align: left; }
.provider-row button strong, .provider-row button small { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-row small { font-size: var(--font-size-11); color: var(--faded-text-color); font-weight: var(--font-weight-regular); }
.model-visibility input[type=checkbox] { appearance: auto; accent-color: var(--highlight-color); margin: 0; width: var(--space-8); height: var(--space-8); flex-shrink: 0; }
.model-visibility .model-row { display: flex; flex-direction: row; align-items: center; gap: var(--space-6); padding: var(--space-6); border-radius: var(--radius-md); cursor: pointer; }
.model-row:hover { background: var(--background-color-light); }
.model-row span { min-width: 0; }
.model-row strong { font-size: var(--font-size-13); font-weight: var(--font-weight-medium); overflow-wrap: anywhere; }
.model-row small { display: block; font-size: var(--font-size-11); color: var(--faded-text-color); overflow-wrap: anywhere; }
.bulk-actions { display: flex; flex-wrap: wrap; gap: var(--space-4); padding: 0 var(--space-8) var(--space-4); }
.bulk-actions button { min-height: var(--space-16); padding: var(--space-2) var(--space-4); font-size: var(--font-size-12); }
.provider-note, .empty-catalog { padding: var(--space-8); }
.visibility-actions { background: var(--background-color); border-top: var(--space-px) solid var(--border-color); padding-top: var(--space-8); }
.visibility-actions span { font-size: var(--font-size-12); color: var(--faded-text-color); }
.show-more { margin: var(--space-4) auto !important; }
@container runtime-catalog (max-width: 520px) {
  .catalog-layout { grid-template-columns: minmax(0, 1fr); }
  .providers-pane { border-right: none; border-bottom: var(--space-px) solid var(--border-color); }
  .provider-list { max-height: calc(var(--space-32) * 2); }
}
</style>
