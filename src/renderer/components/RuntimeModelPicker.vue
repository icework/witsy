<template>
  <div class="runtime-model-picker" :class="{ compact }" :aria-busy="loading">
    <label class="provider-control" :title="providerTitle">
      <GlobeIcon v-if="compact" aria-hidden="true" /><span v-else>{{ t('chatAgent.provider') }}</span>
      <select :aria-label="t('chatAgent.provider')" :value="providerValue" :disabled="disabled || loading || !!error" @change="chooseProvider">
        <option v-if="missingProvider" value="unavailable" disabled>{{ pendingLabel }}</option>
        <option value="">{{ t('runtime.inherit') }}</option>
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
      </select>
      <ChevronDownIcon v-if="compact" class="chevron" aria-hidden="true" />
    </label>
    <label class="model-control" :title="modelTitle">
      <BoxIcon v-if="compact" aria-hidden="true" /><span v-else>{{ t('runtime.model') }}</span>
      <select :aria-label="t('runtime.model')" :value="modelValue" :disabled="disabled || loading || !!error || missingProvider || !models.length" @change="chooseModel">
        <option v-if="missingModel" value="unavailable" disabled>{{ pendingLabel }}</option>
        <option value="">{{ effectiveProvider && !models.length && !loading ? t('runtimeModels.noVisibleModels') : t('runtime.inherit') }}</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
      </select>
      <ChevronDownIcon v-if="compact" class="chevron" aria-hidden="true" />
    </label>
    <p v-if="error" class="catalog-error" role="alert">{{ t('runtimeModels.loadFailed') }} <button type="button" :disabled="disabled || loading" @click="emit('refresh')">{{ t('runtimeModels.retry') }}</button></p>
    <p v-else-if="!compact && (missingProvider || missingModel) && !loading" class="field-help">{{ t('runtimeModels.retainedChoice') }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { BoxIcon, ChevronDownIcon, GlobeIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'
import { RuntimeBinding, RuntimeCatalog } from '../../types/runtime'
const props = defineProps<{ binding: RuntimeBinding; catalog: RuntimeCatalog; loading?: boolean; error?: string; disabled?: boolean; compact?: boolean }>()
const emit = defineEmits<{ change: [choice: { provider?: string; model?: string }]; refresh: [] }>()
const providers = computed(() => (props.catalog.providers || [...new Set(props.catalog.models.map(model => model.provider))].map(id => ({ id, name: id }))).filter(p => props.catalog.models.some(m => m.provider === p.id)))
const currentProvider = computed(() => props.binding.provider || '')
const effectiveProvider = computed(() => currentProvider.value || props.catalog.defaults?.provider || '')
const models = computed(() => props.catalog.models.filter(model => model.provider === effectiveProvider.value))
const missingProvider = computed(() => !!currentProvider.value && !providers.value.some(p => p.id === currentProvider.value))
const missingModel = computed(() => !!props.binding.model && !models.value.some(m => m.id === props.binding.model))
const providerValue = computed(() => missingProvider.value ? 'unavailable' : currentProvider.value)
const modelValue = computed(() => missingModel.value ? 'unavailable' : props.binding.model || '')
const pendingLabel = computed(() => props.loading ? t('runtimeModels.loading') : props.error ? t('runtimeModels.loadFailed') : t('runtimeModels.unavailable'))
const providerTitle = computed(() => props.error || (missingProvider.value ? pendingLabel.value : providers.value.find(p => p.id === currentProvider.value)?.name || t('runtime.inherit')))
const modelTitle = computed(() => props.error || (missingModel.value ? pendingLabel.value : models.value.find(m => m.id === props.binding.model)?.name || t('runtime.inherit')))
const chooseProvider = (event: Event) => {
  const provider = (event.target as HTMLSelectElement).value
  if (provider && !providers.value.some(p => p.id === provider)) return
  // OpenCode requires a provider/model pair. Select a visible model when choosing a provider.
  const model = provider ? props.catalog.models.find(m => m.provider === provider)?.id : undefined
  emit('change', { provider: provider || undefined, model })
}
const chooseModel = (event: Event) => {
  const model = (event.target as HTMLSelectElement).value
  if (model && !models.value.some(m => m.id === model)) return
  emit('change', model ? { provider: effectiveProvider.value || undefined, model } : { provider: undefined, model: undefined })
}
</script>
<style scoped>
.runtime-model-picker { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-8); min-width: 0; }
label { flex: 1 1 calc(var(--space-32) * 2.5); min-width: 0; }
.field-help, .catalog-error { flex-basis: 100%; margin: 0; font-size: var(--font-size-12); line-height: 1.5; }
.catalog-error { color: var(--color-error); }
.catalog-error button { font: inherit; color: inherit; padding: 0 var(--space-3); }
.compact { display: contents; }
.compact label { display: flex; align-items: center; flex: 0 1 auto; gap: var(--space-3); max-width: calc(var(--space-32) * 3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg); color: var(--dimmed-text-color); background: var(--background-color-light); }
.compact label:hover { background: var(--control-button-active-bg-color); }
.compact label:focus-within { outline: var(--space-1) solid var(--highlight-color); outline-offset: var(--space-1); }
.compact .model-control { max-width: calc(var(--space-32) * 4); }
.compact svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.compact .chevron { width: var(--space-6); height: var(--space-6); pointer-events: none; opacity: 0.65; }
.compact select { appearance: none; field-sizing: content; width: auto; min-width: 0; max-width: 100%; padding: 0 !important; margin: 0; border: none; border-radius: 0; background: transparent; color: inherit; font-family: inherit; font-size: var(--font-size-13); line-height: var(--line-height-20); font-weight: var(--font-weight-medium); text-overflow: ellipsis; cursor: pointer; outline: none; box-shadow: none; }
.compact select:disabled { cursor: default; color: var(--faded-text-color); }
.compact label:has(select:disabled) .chevron { display: none; }
@container chat-composer (max-width: 540px) { .compact label > svg:first-child { display: none; } }
@container chat-composer (max-width: 420px) {
  .compact label { flex: 1 1 0; }
  .compact .model-control { flex-grow: 1.4; }
  .compact select { flex: 1; width: 100%; }
}
</style>
