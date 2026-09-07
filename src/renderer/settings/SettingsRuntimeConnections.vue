<template>
  <div class="runtimeconnections tab-content agent-settings">
    <header><div class="title">{{ t('runtime.connections') }}</div></header>
    <main>
      <div class="editor-heading"><h2>{{ t('agentDesign.connectionsTitle') }}</h2><p>{{ t('agentDesign.connectionsHelp') }}</p></div>
      <RuntimeChat ref="runtimeSettings" :chat="templateChat" configuration @bind="startChat" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Chat from '@models/chat'
import RuntimeChat from '@components/RuntimeChat.vue'
import useEventBus from '@composables/event_bus'
import { store } from '@services/store'
import { t } from '@services/i18n'
import { RuntimeBinding } from '../../types/runtime'

const templateChat = new Chat()
templateChat.setEngineModel(store.config.llm.engine, store.config.engines[store.config.llm.engine]?.model?.chat)
const { emitBusEvent } = useEventBus()
const startChat = (runtime?: RuntimeBinding) => emitBusEvent('new-chat', runtime ? { runtime: { ...runtime } } : undefined)
const runtimeSettings = ref<InstanceType<typeof RuntimeChat>>()
const load = (payload?: { native?: boolean }) => { if (payload?.native) runtimeSettings.value?.configureNative() }
defineExpose({ load })
</script>

<style scoped>
.settings .runtimeconnections > main { padding: var(--space-12); box-sizing: border-box; width: 100%; max-width: calc(var(--space-32) * 13); }
</style>
