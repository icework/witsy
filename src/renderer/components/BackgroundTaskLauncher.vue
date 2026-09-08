<template>
  <form class="background-task-launcher" :aria-label="t('contextWorkflow.taskMode')" :aria-busy="disabled" @submit.prevent="submit" @keydown="onKeydown">
    <header class="task-heading">
      <WorkflowIcon class="task-icon" aria-hidden="true" />
      <div class="task-title">
        <h1 :title="name">{{ name || t('contextWorkflow.taskMode') }}</h1>
        <p>{{ t('contextWorkflow.taskMode') }}</p>
      </div>
    </header>
    <div class="task-body">
      <p v-if="contextKind === 'selected-text' && instructions" class="task-instructions" :title="instructions">{{ instructions }}</p>
      <div class="task-input-row">
        <ContextScreenshot v-if="image" class="task-image" :image="image" />
        <textarea ref="input" v-model="value" :aria-label="inputLabel" :placeholder="inputLabel" :readonly="disabled" aria-describedby="task-keyboard-hint" rows="3" :maxlength="contextKind === 'selected-text' ? 64000 : undefined" />
      </div>
      <p v-if="error" class="task-error" role="alert">{{ error }}</p>
    </div>
    <footer class="task-footer">
      <span class="task-agent" :title="agent"><BotIcon aria-hidden="true" />{{ agent }}</span>
      <div id="task-keyboard-hint" class="task-hints">
        <span :title="t('common.cancel')"><kbd>esc</kbd></span>
        <span class="task-submit-hint" :class="{ unavailable: !canSubmit }" :title="t('contextWorkflow.taskKeyboardHelp')" :aria-label="t('contextWorkflow.taskKeyboardHelp')">
          {{ t('contextWorkflow.runTask') }}<kbd><CornerDownLeftIcon aria-hidden="true" /></kbd>
        </span>
      </div>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BotIcon, CornerDownLeftIcon, WorkflowIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'
import ContextScreenshot from './ContextScreenshot.vue'
import type { ScreenshotState } from '../../types/chat_agent'

const props = defineProps<{ name?: string; agent: string; contextKind?: ScreenshotState['contextKind']; image?: string; instructions: string; disabled?: boolean; error?: string }>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ submit: []; cancel: [] }>()
const input = ref<HTMLTextAreaElement>()
const inputLabel = computed(() => t(props.contextKind === 'selected-text' ? 'contextWorkflow.selected-text' : 'contextWorkflow.prompt'))
const canSubmit = computed(() => !props.disabled && !!value.value.trim() && !!props.instructions.trim())
const submit = () => { if (canSubmit.value) emit('submit') }
const onKeydown = (event: KeyboardEvent) => {
  if (event.isComposing || event.repeat) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('cancel') }
  else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
}
onMounted(() => input.value?.focus())
</script>

<style scoped>
.background-task-launcher { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; color: var(--text-color); background: var(--background-color); }
.task-heading { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-8) var(--space-12); flex-shrink: 0; }
.task-icon { width: var(--icon-lg); height: var(--icon-lg); flex-shrink: 0; color: var(--highlight-color); }
.task-title { min-width: 0; }
.task-title h1 { margin: 0; font-size: var(--font-size-16); font-weight: var(--font-weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-title p { margin: var(--space-2) 0 0; color: var(--faded-text-color); font-size: var(--font-size-12); }
.task-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--space-12) var(--space-8); gap: var(--space-6); }
.task-instructions { flex-shrink: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dimmed-text-color); font-size: var(--font-size-13); line-height: 1.5; }
.task-input-row { display: flex; flex: 1; align-items: stretch; gap: var(--space-8); min-height: var(--space-32); }
.task-image { align-self: flex-start; width: calc(var(--space-20) * 2); }
.task-input-row textarea { flex: 1; width: 100%; min-width: 0; min-height: var(--space-32); box-sizing: border-box; resize: none; padding: var(--space-6); margin: 0; border: var(--space-px) solid var(--border-color); border-radius: var(--radius-lg); background: var(--background-color-light); color: var(--text-color); font: inherit; font-size: var(--font-size-16); line-height: 1.5; }
.task-input-row textarea::placeholder { color: var(--faded-text-color); }
.task-input-row textarea:focus-visible { outline: var(--space-px) solid var(--highlight-color); outline-offset: var(--space-px); }
.task-error { flex-shrink: 0; margin: 0; color: var(--color-error); font-size: var(--font-size-13); line-height: 1.5; overflow-wrap: anywhere; }
.task-footer { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-6); padding: var(--space-6) var(--space-12); border-top: var(--space-px) solid var(--border-color); flex-shrink: 0; font-size: var(--font-size-12); color: var(--faded-text-color); }
.task-agent { display: flex; align-items: center; gap: var(--space-3); min-width: 0; flex: 1; overflow-wrap: anywhere; }
.task-agent svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.task-hints, .task-submit-hint { display: flex; align-items: center; gap: var(--space-6); }
.task-submit-hint { color: var(--text-color); }
.task-submit-hint.unavailable { color: var(--faded-text-color); }
kbd { display: inline-flex; align-items: center; justify-content: center; height: var(--space-10); min-width: var(--space-10); padding: 0 var(--space-2); border: var(--space-px) solid var(--border-color); border-radius: var(--radius-sm); font: inherit; }
kbd svg { width: var(--icon-md); height: var(--icon-md); }
</style>
