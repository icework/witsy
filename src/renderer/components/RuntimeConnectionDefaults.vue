<template>
  <section class="form-section connection-defaults" :aria-busy="loading || saving">
    <h3>{{ t('runtimeDefaults.title') }}</h3>
    <p>{{ t('runtimeDefaults.help') }}</p>
    <RuntimeModelPicker :binding="binding" :catalog="catalog" :loading="loading" :error="catalogError" :disabled="saving" @change="choose" @refresh="reload(true)" />
    <div class="form-actions">
      <button type="button" class="primary" :disabled="!dirty || saving || loading" @click="save">{{ t('runtimeDefaults.save') }}</button>
      <button type="button" :disabled="!dirty || saving" @click="reset">{{ t('common.cancel') }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="saved && !dirty" role="status">{{ t('runtimeDefaults.saved') }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RuntimeConnection } from '../../types/runtime'
import { t } from '@services/i18n'
import { connectionBinding } from '@services/runtime_defaults'
import useRuntimeCatalog from '@composables/runtime_catalog'
import RuntimeModelPicker from './RuntimeModelPicker.vue'

const props = defineProps<{ connection: RuntimeConnection }>()
const emit = defineEmits<{ saved: [connection: RuntimeConnection] }>()
type Choice = { provider?: string; model?: string }
const selection = ref<Choice>({})
const baseline = ref(''), saving = ref(false), saved = ref(false), error = ref('')
let active = true
const key = (choice: Choice) => JSON.stringify([choice.provider || '', choice.model || ''])
const dirty = computed(() => key(selection.value) !== baseline.value)
const binding = computed(() => ({ ...connectionBinding(props.connection), ...selection.value }))
const { catalog, loading, error: catalogError, reload } = useRuntimeCatalog(() => connectionBinding(props.connection))
const reset = () => {
  selection.value = { provider: props.connection.defaultProvider, model: props.connection.defaultModel }
  baseline.value = key(selection.value); saved.value = false; error.value = ''
}
watch(() => [props.connection.id, props.connection.defaultProvider, props.connection.defaultModel], () => {
  if (key({ provider: props.connection.defaultProvider, model: props.connection.defaultModel }) !== baseline.value) reset()
}, { immediate: true })
const choose = (choice: Choice) => { selection.value = choice; saved.value = false; error.value = '' }
const save = async () => {
  const choice = { ...selection.value }
  saving.value = true; error.value = ''
  try {
    const result = await window.api.runtime.setDefaultModel(props.connection.id, choice.provider && choice.model ? { provider: choice.provider, model: choice.model } : null)
    if (!active) return
    baseline.value = key(choice); emit('saved', result); saved.value = true
  } catch (e) { if (active) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (active) saving.value = false }
}
onBeforeUnmount(() => { active = false })
</script>
