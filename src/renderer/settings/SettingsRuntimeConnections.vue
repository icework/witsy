<template>
  <div class="runtimeconnections tab-content">
    <header><div class="title">{{ t('runtime.connections') }}</div></header>
    <main>
      <h3>{{ t('chatAgent.custom') }}</h3>
      <p>{{ t('chatAgent.manualHelp') }}</p>
      <button @click="window.api.settings.open({ initialTab: 'models' })">{{ t('settings.tabs.models') }}</button>
      <RuntimeChat :chat="templateChat" configuration @bind="startChat" />
    </main>
  </div>
</template>

<script setup lang="ts">
import Chat from '@models/chat'
import RuntimeChat from '@components/RuntimeChat.vue'
import useEventBus from '@composables/event_bus'
import { store } from '@services/store'
import { t } from '@services/i18n'
import { RuntimeBinding } from '../../types/runtime'

const window = globalThis.window
const templateChat = new Chat()
templateChat.setEngineModel(store.config.llm.engine, store.config.engines[store.config.llm.engine]?.model?.chat)
const { emitBusEvent } = useEventBus()
const startChat = (runtime?: RuntimeBinding) => emitBusEvent('new-chat', runtime ? { runtime: { ...runtime } } : undefined)
const load = () => {}
defineExpose({ load })
</script>
