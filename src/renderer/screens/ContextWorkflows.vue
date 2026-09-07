<template>
  <section class="workflow-launcher">
    <header><h2>{{ t('contextWorkflow.title') }}</h2><button @click="settings">{{ t('common.settings') }}</button></header>
    <p>{{ t('contextWorkflow.launchHelp') }}</p>
    <ul>
      <li v-for="workflow in workflows" :key="workflow.id">
        <div><strong>{{ workflow.name }}</strong><p>{{ t('contextWorkflow.' + workflow.contextInput) }} · {{ agents.find(a => a.id === workflow.agentId)?.name || t('chatAgent.chooseAfter') }}</p><small v-if="workflow.accelerator">{{ workflow.accelerator }}</small></div>
        <button :disabled="working || !workflow.enabled" @click="run(workflow.id)">{{ workflow.enabled ? t('contextWorkflow.openChat') : t('contextWorkflow.disabled') }}</button>
      </li>
    </ul>
    <p v-if="!workflows.length">{{ t('contextWorkflow.empty') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@services/i18n'
import { ChatAgent, ContextWorkflow } from '../../types/chat_agent'
const workflows = ref<ContextWorkflow[]>([]), agents = ref<ChatAgent[]>([])
const working = ref(false), error = ref('')
const settings = () => window.api.settings.open({ initialTab: 'contextworkflows' })
onMounted(async () => { try { workflows.value = await window.api.chatAgents.workflows(); agents.value = await window.api.chatAgents.list() } catch (e) { error.value = String(e) } })
const run = async (id: string) => {
  working.value = true; error.value = ''
  try { await window.api.chatAgents.runWorkflow(id) } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
</script>
<style scoped>
.workflow-launcher { flex: 1; overflow: auto; padding: var(--font-size-24); }
header, li { display: flex; align-items: center; justify-content: space-between; gap: var(--form-normal-font-size); }
ul { list-style: none; padding: 0; }
li { padding: var(--form-normal-font-size); margin-block: var(--form-normal-font-size); background: var(--sidebar-bg-color); border-radius: var(--control-border-radius); }
li p, li small { color: var(--dimmed-text-color); }
</style>
