<template>
  <div class="capture-region" @pointerdown="start" @pointermove="move" @pointerup="finish" @contextmenu.prevent="cancel">
    <img v-if="image" :src="image" draggable="false" :alt="t('chatAgent.frozenScreen')" />
    <div v-if="selection" class="selection" :style="selection" />
    <div class="capture-hint"><span>{{ error || t('chatAgent.dragRegion') }}</span><button @pointerdown.stop @click.stop="cancel">{{ t('common.cancel') }}</button></div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { t } from '@services/i18n'
import { store } from '@services/store'
import useEventListener from '@composables/event_listener'
store.loadSettings()
const image = ref('')
const error = ref('')
const origin = ref<{ x: number; y: number }>()
const cursor = ref<{ x: number; y: number }>()
const rect = computed(() => origin.value && cursor.value ? { x: Math.min(origin.value.x, cursor.value.x), y: Math.min(origin.value.y, cursor.value.y), width: Math.abs(cursor.value.x - origin.value.x), height: Math.abs(cursor.value.y - origin.value.y) } : null)
const selection = computed(() => rect.value ? { left: `${rect.value.x}px`, top: `${rect.value.y}px`, width: `${rect.value.width}px`, height: `${rect.value.height}px` } : undefined)
const start = (event: PointerEvent) => { if (event.button !== 0 || !image.value) return; origin.value = { x: event.clientX, y: event.clientY }; cursor.value = origin.value; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) }
const move = (event: PointerEvent) => { if (origin.value) cursor.value = { x: Math.min(window.innerWidth, Math.max(0, event.clientX)), y: Math.min(window.innerHeight, Math.max(0, event.clientY)) } }
const finish = async () => {
  if (!rect.value || rect.value.width < 4 || rect.value.height < 4) return
  try { await window.api.chatAgents.screenshotFinish({ x: rect.value.x / window.innerWidth, y: rect.value.y / window.innerHeight, width: rect.value.width / window.innerWidth, height: rect.value.height / window.innerHeight }) }
  catch (e) { error.value = String(e) }
}
const cancel = () => window.api.chatAgents.screenshotFinish()
const { onDomEvent } = useEventListener()
onDomEvent(document, 'keydown', (event: KeyboardEvent) => { if (event.key === 'Escape') void cancel() })
onMounted(async () => { try { image.value = await window.api.chatAgents.screenshotSource() } catch (e) { error.value = String(e) } })
</script>
<style scoped>
.capture-region { position: fixed; inset: 0; cursor: crosshair; touch-action: none; }
.capture-region img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.selection { position: absolute; outline: var(--control-border-radius) solid var(--highlight-color); pointer-events: none; }
.capture-hint { position: absolute; top: var(--form-normal-font-size); left: var(--form-normal-font-size); background: var(--background-color); color: var(--text-color); padding: var(--form-normal-font-size); border-radius: var(--control-border-radius); }
</style>
