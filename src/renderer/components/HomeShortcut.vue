<template>
  <button type="button" class="shortcut" @click="onClick">
    <component :is="icon" class="icon" v-if="icon"/>
    <AgentIcon class="icon" v-else />
    <div class="info">
      <h2>{{ name }}</h2>
      <p>{{ description }}</p>
    </div>
  </button>
</template>

<script setup lang="ts">
import AgentIcon from '@assets/agent.svg?component'

defineProps({
  icon: { },
  name: { type: String, required: true },
  description: { type: String, required: true },
})

const emit = defineEmits(['run'])

function onClick() {
  emit('run')
}
</script>

<style scoped>

.shortcut {
  width: 100%;
  box-sizing: border-box;
  border-radius: var(--radius-xl);
  margin: 0;
  text-align: left;
  background: var(--color-surface);
  border: var(--space-px) solid transparent;
  display: flex;
  padding: var(--space-8);
  align-items: center;
  gap: var(--space-8);
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.shortcut:hover { border-color: var(--color-outline-variant); background: var(--color-surface-low); }
.shortcut:focus-visible { outline: var(--space-1) solid var(--color-focus); outline-offset: var(--space-2); }
.icon { width: var(--icon-lg); height: var(--icon-lg); aspect-ratio: 1; flex-shrink: 0; color: var(--faded-text-color); }
.info { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; flex: 1; }
h2 { margin: 0; color: var(--text-color); font-size: var(--font-size-13); font-weight: var(--font-weight-medium); line-height: var(--line-height-20); overflow-wrap: anywhere; }
p { margin: 0; color: var(--faded-text-color); font-size: var(--font-size-12); font-weight: var(--font-weight-regular); line-height: var(--line-height-18); overflow-wrap: anywhere; }

</style>
