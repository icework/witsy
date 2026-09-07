<template>
  <ModelVisibilityEditor :key="connection.id" :visibility="connection.modelVisibility" :catalog-key="catalogKey" :load-catalog="loadCatalog" :save-visibility="saveVisibility" />
</template>
<script setup lang="ts">
import { computed } from 'vue'
import ModelVisibilityEditor from './ModelVisibilityEditor.vue'
import { RuntimeBinding, RuntimeConnection, RuntimeModelVisibility } from '../../types/runtime'
const props = defineProps<{ connection: RuntimeConnection; binding: RuntimeBinding }>()
const emit = defineEmits<{ saved: [connection: RuntimeConnection] }>()
const catalogKey = computed(() => JSON.stringify([props.binding.connectionId, props.binding.profile, props.binding.directory]))
const loadCatalog = (refresh: boolean) => window.api.runtime.catalog({ ...props.binding }, { includeHidden: true, refresh })
const saveVisibility = async (visibility: RuntimeModelVisibility) => {
  const result = await window.api.runtime.setModelVisibility(props.connection.id, visibility)
  emit('saved', result)
}
</script>
