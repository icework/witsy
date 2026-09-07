<template>
  <div class="chatagents tab-content">
    <header><div class="title">{{ t('chatAgent.settingsTitle') }}</div></header>
    <main>
      <div class="master-detail">
        <aside class="md-master">
          <div class="list-heading"><span>{{ t('chatAgent.total', { count: agents.length }) }}</span><button :aria-label="t('chatAgent.newAgent')" @click="create"><PlusIcon /></button></div>
          <div class="md-master-list">
            <button v-for="agent in agents" :key="agent.id" class="md-master-list-item" :class="{ selected: edited?.id === agent.id }" @click="edited = agent">
              <span><strong>{{ agent.name }}</strong><small>{{ agent.kind }}{{ agent.description ? ' · ' + agent.description : '' }}</small></span>
            </button>
          </div>
        </aside>
        <section class="md-detail">
          <ChatAgentEditor v-if="edited !== undefined" :key="edited?.id || newKey" :agent="edited" @saved="saved" @removed="removed" />
          <p v-else>{{ t('chatAgent.emptyAgents') }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
        </section>
      </div>
    </main>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { PlusIcon } from 'lucide-vue-next'
import ChatAgentEditor from '@components/ChatAgentEditor.vue'
import useEventBus from '@composables/event_bus'
import { t } from '@services/i18n'
import { ChatAgent } from '../../types/chat_agent'
const agents = ref<ChatAgent[]>([])
const edited = ref<ChatAgent | null | undefined>()
const newKey = ref(0), error = ref('')
const { emitBusEvent } = useEventBus()
const load = async () => {
  try { agents.value = await window.api.chatAgents.list(); if (edited.value === undefined) edited.value = agents.value[0] }
  catch (e) { error.value = String(e) }
}
const create = () => { newKey.value++; edited.value = null }
const saved = async (agent: ChatAgent) => { await load(); edited.value = agent; emitBusEvent('chat-agent-settings-changed') }
const removed = async () => { edited.value = undefined; await load(); emitBusEvent('chat-agent-settings-changed') }
defineExpose({ load })
</script>
<style scoped>
.chatagents { height: 100%; }
.chatagents > main { padding: 0; flex: 1; min-height: 0; }
.master-detail { height: 100%; }
.list-heading { display: flex; justify-content: space-between; align-items: center; color: var(--dimmed-text-color); }
.list-heading svg { width: var(--form-normal-font-size); height: var(--form-normal-font-size); }
.md-master-list-item { justify-content: flex-start; text-align: left; border: none; background: transparent; }
.md-master-list-item span { overflow: hidden; }
.md-master-list-item strong, .md-master-list-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-master-list-item small { color: var(--dimmed-text-color); }
</style>
