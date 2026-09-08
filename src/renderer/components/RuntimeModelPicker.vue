<template>
  <div class="runtime-model-picker" :class="{ compact }" :aria-busy="loading">
    <label class="provider-control" :class="{ 'composer-choice': compact }" :title="providerTitle">
      <GlobeIcon v-if="compact" aria-hidden="true" /><span v-else>{{ t('chatAgent.provider') }}</span>
      <select :aria-label="t('chatAgent.provider')" :value="providerValue" :disabled="disabled || loading || !!error" @change="chooseProvider">
        <option v-if="missingProvider" value="unavailable" disabled>{{ pendingLabel }}</option>
        <option value="">{{ defaultLabel || t('runtime.inherit') }}</option>
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
      </select>
      <ChevronDownIcon v-if="compact" class="chevron" aria-hidden="true" />
    </label>
    <label class="model-control" :class="{ 'composer-choice': compact }" :title="modelTitle">
      <BoxIcon v-if="compact" aria-hidden="true" /><span v-else>{{ t('runtime.model') }}</span>
      <select :aria-label="t('runtime.model')" :value="modelValue" :disabled="disabled || loading || !!error || missingProvider || !models.length" @change="chooseModel">
        <option v-if="missingModel" value="unavailable" disabled>{{ pendingLabel }}</option>
        <option value="">{{ effectiveProvider && !models.length && !loading ? t('runtimeModels.noVisibleModels') : defaultLabel || t('runtime.inherit') }}</option>
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
const props = defineProps<{ binding: Pick<RuntimeBinding, 'provider' | 'model'>; defaultLabel?: string; catalog: RuntimeCatalog; loading?: boolean; error?: string; disabled?: boolean; compact?: boolean }>()
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
const providerTitle = computed(() => props.error || (missingProvider.value ? pendingLabel.value : providers.value.find(p => p.id === currentProvider.value)?.name || props.defaultLabel || t('runtime.inherit')))
const modelTitle = computed(() => props.error || (missingModel.value ? pendingLabel.value : models.value.find(m => m.id === props.binding.model)?.name || props.defaultLabel || t('runtime.inherit')))
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
label:not(.composer-choice) { flex: 1 1 calc(var(--space-32) * 2.5); min-width: 0; }
.field-help, .catalog-error { flex-basis: 100%; margin: 0; font-size: var(--font-size-12); line-height: 1.5; }
.catalog-error { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); color: var(--color-error); }
.catalog-error button { min-height: var(--space-16); margin: 0; padding: var(--space-2) var(--space-4); border: none; border-radius: var(--radius-md); background: var(--color-error-container); font: inherit; color: var(--color-on-error-container); }
.catalog-error button:focus-visible { outline: var(--space-1) solid var(--color-focus); outline-offset: var(--space-1); }
.compact { display: contents; }
</style>
