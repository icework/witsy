<template>
  <form class="background-task-launcher" :class="{ 'text-context': contextKind === 'selected-text' }" :aria-label="name ? `${t('contextWorkflow.taskMode')}: ${name}` : t('contextWorkflow.taskMode')" :aria-busy="disabled" @submit.prevent="submit" @keydown="onKeydown">
    <header class="task-heading">
      <WorkflowIcon class="task-icon" aria-hidden="true" />
      <div class="task-title">
        <span v-if="name" class="task-kind">{{ t('contextWorkflow.workflow') }}</span>
        <h1 :title="name">{{ name || t('contextWorkflow.taskMode') }}</h1>
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
      <span class="task-agent" :title="agent"><BotIcon aria-hidden="true" /><span class="task-agent-name">{{ agent }}</span></span>
      <div id="task-keyboard-hint" class="task-hints">
        <span class="task-cancel-hint" :title="t('common.cancel')"><kbd>esc</kbd></span>
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
.background-task-launcher { container: quick-launcher / inline-size; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; color: var(--text-color); background: var(--color-surface-lowest); }
.task-heading { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-8) var(--space-10) var(--space-6); flex-shrink: 0; -webkit-app-region: drag; user-select: none; }
.task-icon { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; color: var(--faded-text-color); }
.task-title { display: flex; align-items: baseline; gap: var(--space-4); min-width: 0; }
.task-kind { flex-shrink: 0; font-size: var(--font-size-12); color: var(--faded-text-color); }
.task-title h1 { min-width: 0; margin: 0; font-size: var(--font-size-16); line-height: var(--line-height-24); font-weight: var(--font-weight-semibold); color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--space-10) var(--space-8); gap: var(--space-6); }
.task-instructions { flex-shrink: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faded-text-color); font-size: var(--font-size-12); line-height: 1.5; }
.task-input-row { display: flex; flex: 1; align-items: stretch; gap: var(--space-8); min-height: var(--space-32); }
.task-image { align-self: flex-start; width: var(--space-32); }
.task-input-row textarea { flex: 1; width: 100%; min-width: 0; min-height: var(--space-32); box-sizing: border-box; resize: none; padding: var(--space-2) var(--space-4); margin: 0 calc(-1 * var(--space-4)); border: none; border-radius: 0; background: transparent; color: var(--text-color); font-family: inherit; font-size: var(--font-size-18); line-height: var(--line-height-28); outline: none; box-shadow: none; }
.text-context .task-input-row textarea { font-size: var(--font-size-15); line-height: var(--line-height-24); }
.task-input-row textarea::placeholder { color: var(--faded-text-color); opacity: 1; }
.task-input-row textarea:focus-visible { box-shadow: inset var(--space-1) 0 0 var(--color-primary-container); }
.task-error { flex-shrink: 0; margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--color-error-container); color: var(--color-on-error-container); font-size: var(--font-size-12); line-height: 1.5; overflow-wrap: anywhere; }
.task-footer { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-4) var(--space-10); min-height: var(--space-24); box-sizing: border-box; border-top: var(--space-px) solid var(--color-outline-subtle); background: var(--color-surface); flex-shrink: 0; font-size: var(--font-size-12); color: var(--faded-text-color); }
.task-agent { display: flex; align-items: center; gap: var(--space-3); min-width: 0; flex: 1; }
.task-agent-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.task-agent svg { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.task-hints, .task-submit-hint { display: flex; align-items: center; gap: var(--space-4); white-space: nowrap; }
.task-hints { flex-shrink: 0; }
.task-submit-hint { padding-left: var(--space-6); border-left: var(--space-px) solid var(--color-outline-variant); color: var(--text-color); }
.task-submit-hint.unavailable { color: var(--faded-text-color); }
kbd { display: inline-flex; align-items: center; justify-content: center; height: var(--space-10); min-width: var(--space-10); padding: 0 var(--space-2); border: var(--space-px) solid var(--color-outline-variant); border-radius: var(--radius-sm); background: var(--color-surface-lowest); font: inherit; }
kbd svg { width: var(--icon-md); height: var(--icon-md); }
@container quick-launcher (max-width: 480px) { .task-cancel-hint { display: none; } }
</style>
