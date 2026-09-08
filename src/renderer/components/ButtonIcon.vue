<template>
  <button type="button" class="button-icon" @click="onClick">
    <slot />
  </button>
</template>

<script setup lang="ts">

const emit = defineEmits(['click'])

function onClick(event: MouseEvent) {
  emit('click', event)
}

</script>

<style scoped>

.button-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  margin: 0;
  border: none;
  background: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:deep() svg {
    flex-shrink: 0;
    color: var(--chatarea-toolbar-icon-color);
    width: var(--icon-md);
    height: var(--icon-md);
  }

  &:hover:not(:disabled) {
    background-color: var(--color-surface-low);
  }

  &:active:not(:disabled) {
    background-color: var(--color-surface-high);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  &:disabled { cursor: default; }
}

</style>
