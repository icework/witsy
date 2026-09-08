<template>
  <div class="accelerator-control">
    <button type="button" class="recorder" :class="{ recording }" :disabled="disabled"
      :aria-label="label" :aria-pressed="recording" :aria-describedby="helpId"
      :title="value || t('contextWorkflow.recordShortcut')" @click="recording = !recording"
      @keydown="onKeyDown" @blur="recording = false">
      <KeyboardIcon aria-hidden="true" />
      <span aria-live="polite">{{ recording ? t('contextWorkflow.pressShortcut') : value || t('contextWorkflow.recordShortcut') }}</span>
    </button>
    <button type="button" :disabled="disabled || !value" :aria-label="t('contextWorkflow.clearShortcut')"
      :title="t('contextWorkflow.clearShortcut')" @click="value = ''; recording = false"><XIcon aria-hidden="true" /></button>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { KeyboardIcon, XIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'

defineProps<{ label: string; helpId?: string; disabled?: boolean }>()
const value = defineModel<string>({ default: '' })
const recording = ref(false)
const punctuation: Record<string, string> = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
}
const onKeyDown = (event: KeyboardEvent) => {
  if (!recording.value) return
  if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    recording.value = false
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { recording.value = false; return }
  if (event.isComposing || event.repeat) return
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return
  // Physical codes keep Option and Shift combinations stable across keyboard layouts.
  const code = event.code
  let key = punctuation[code]
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code
  else if (['Space', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert'].includes(code)) key = code
  else if (code === 'Enter' || code === 'NumpadEnter') key = 'Return'
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`
  if (!key) return
  value.value = [event.metaKey && 'Command', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+')
  recording.value = false
}
</script>
<style scoped>
.accelerator-control { display: flex; gap: var(--space-4); min-width: 0; }
.accelerator-control .recorder { flex: 1; min-width: 0; justify-content: flex-start; text-align: left; background: var(--control-bg-color); border: var(--space-px) solid var(--control-border-color); color: var(--text-color); }
.recorder span { min-width: 0; overflow-wrap: anywhere; }
.recorder svg { flex-shrink: 0; }
.accelerator-control .recorder.recording { border-color: var(--highlight-color); color: var(--highlight-color); }
</style>
