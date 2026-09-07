<template>
  <div class="runtimeconnections tab-content agent-settings">
    <header><div class="title">{{ t('runtime.connections') }}</div></header>
    <main>
      <div class="editor-heading"><h2>{{ t('agentDesign.connectionsTitle') }}</h2><p>{{ t('agentDesign.connectionsHelp') }}</p></div>
      <div class="native-provider-card"><div><strong>Native</strong><p>{{ t('agentDesign.nativeHelp') }}</p></div><button @click="window.api.settings.open({ initialTab: 'models' })">{{ t('settings.tabs.models') }} <ArrowUpRightIcon /></button></div>
      <RuntimeChat :chat="templateChat" configuration @bind="startChat" />
    </main>
  </div>
</template>

<script setup lang="ts">
import Chat from '@models/chat'
import { ArrowUpRightIcon } from 'lucide-vue-next'
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

<style scoped>
.settings .runtimeconnections > main { padding: var(--space-12); box-sizing: border-box; width: 100%; max-width: calc(var(--space-32) * 13); }
.native-provider-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-8); border: var(--space-px) solid var(--border-color); background: var(--background-color-light); border-radius: var(--radius-xl); padding: var(--space-12); margin-bottom: var(--space-12); font-size: var(--font-size-14); }
.native-provider-card p { color: var(--faded-text-color); font-size: var(--font-size-13); margin: var(--space-4) 0 0; line-height: 1.6; }
.native-provider-card button { display: flex; align-items: center; gap: var(--space-4); border-radius: var(--radius-lg); }
.native-provider-card svg { width: var(--icon-md); height: var(--icon-md); }
</style>
