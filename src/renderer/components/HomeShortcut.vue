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
  background: var(--background-color);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  display: flex;
  padding: var(--space-12);
  flex-direction: row;
  align-items: center;
  gap: var(--space-8);
  cursor: pointer;

  &:hover { border-color: var(--highlight-color); background: var(--background-color-light); }
  &:focus-visible { outline: var(--space-1) solid var(--highlight-color); outline-offset: var(--space-2); }

  .icon {
    width: var(--icon-xl);
    height: var(--icon-xl);
    aspect-ratio: 1/1;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;

    h2 {
      margin: 0;
      color: var(--color-on-surface);
      font-family: Inter;
      font-size: 14px;
      font-style: normal;
      font-weight: 500;
      line-height: 20px;
    }

    p {
      margin: 0;
      color: var(--color-on-surface-variant);
      font-family: Inter;
      font-size: 13px;
      font-style: normal;
      font-weight: 400;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

  }

}

</style>
