<template>
  <div class="context-screenshot">
    <button class="screenshot-thumbnail" type="button" :aria-label="t('chatAgent.preview')" :title="t('chatAgent.preview')" @click="preview?.showModal()"><img :src="image" :alt="t('chatAgent.preview')" /></button>
    <div v-if="editable" class="screenshot-actions">
      <button type="button" :disabled="disabled" :aria-label="t('chatAgent.retake')" :title="t('chatAgent.retake')" @click="emit('retake')"><ScanLineIcon /></button>
      <button type="button" :disabled="disabled" :aria-label="t('chatAgent.removeScreenshot')" :title="t('chatAgent.removeScreenshot')" @click="emit('remove')"><XIcon /></button>
    </div>
    <dialog ref="preview" class="screenshot-dialog" :aria-label="t('chatAgent.preview')" @click="onBackdrop">
      <button class="preview-close" type="button" :aria-label="t('common.close')" @click="preview?.close()"><XIcon /></button>
      <img :src="image" :alt="t('chatAgent.preview')" />
    </dialog>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ScanLineIcon, XIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'
defineProps<{ image: string; disabled?: boolean; editable?: boolean }>()
const emit = defineEmits<{ retake: []; remove: [] }>()
const preview = ref<HTMLDialogElement>()
const onBackdrop = (event: MouseEvent) => { if (event.target === preview.value) preview.value.close() }
</script>
<style scoped>
.context-screenshot { position: relative; width: calc(var(--space-32) * 2); max-width: 100%; flex-shrink: 0; }
.screenshot-thumbnail { display: block; width: 100%; height: var(--space-32); padding: 0; overflow: hidden; border: var(--space-px) solid var(--border-color); border-radius: var(--radius-lg); background: var(--background-color-light); cursor: zoom-in; }
.screenshot-thumbnail img { display: block; width: 100%; height: 100%; object-fit: contain; }
.screenshot-actions { position: absolute; top: var(--space-2); right: var(--space-2); display: flex; gap: var(--space-2); }
.screenshot-actions button, .preview-close { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-2); border: var(--space-px) solid var(--border-color); border-radius: var(--radius-md); background: var(--background-color); color: var(--text-color); }
button svg { width: var(--icon-md); height: var(--icon-md); }
button:focus-visible { outline: var(--space-1) solid var(--highlight-color); outline-offset: var(--space-1); }
button:disabled { opacity: 0.5; }
.screenshot-dialog { padding: var(--space-24) var(--space-8) var(--space-8); width: fit-content; max-width: calc(100vw - var(--space-16)); max-height: calc(100vh - var(--space-16)); box-sizing: border-box; border: var(--space-px) solid var(--border-color); border-radius: var(--radius-xl); background: var(--background-color); }
.screenshot-dialog::backdrop { background: color-mix(in srgb, var(--text-color) 40%, transparent); }
.screenshot-dialog > img { display: block; max-width: 100%; max-height: calc(100vh - var(--space-32) * 2); object-fit: contain; margin: auto; }
.preview-close { position: absolute; top: var(--space-4); right: var(--space-4); }
</style>
