<template>
  <section class="workflow-launcher">
    <header><div><h2>{{ t('contextWorkflow.title') }}</h2><p>{{ t('contextWorkflow.launchHelp') }}</p></div><button @click="settings"><Settings2Icon />{{ t('common.settings') }}</button></header>
    <ul>
      <li v-for="workflow in workflows" :key="workflow.id" :class="{ disabled: !workflow.enabled }">
        <div class="workflow-symbol"><CameraIcon v-if="workflow.contextInput === 'screenshot'" /><TextSelectIcon v-else-if="workflow.contextInput === 'selected-text'" /><WorkflowIcon v-else /></div>
        <div><strong>{{ workflow.name }}</strong><p>{{ t('contextWorkflow.' + workflow.contextInput) }} · {{ t(workflow.mode === 'task' ? 'contextWorkflow.taskMode' : 'contextWorkflow.chatMode') }} · {{ agents.find(a => a.id === workflow.agentId)?.name || t('chatAgent.chooseAfter') }}</p><kbd v-if="workflow.accelerator">{{ workflow.accelerator }}</kbd></div>
        <button :disabled="working || !workflow.enabled" @click="run(workflow.id)">{{ workflow.enabled ? t(workflow.mode === 'task' ? 'contextWorkflow.prepareTask' : 'contextWorkflow.openChat') : t('contextWorkflow.disabled') }}<ArrowUpRightIcon /></button>
      </li>
    </ul>
    <p v-if="!workflows.length">{{ t('contextWorkflow.empty') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowUpRightIcon, CameraIcon, Settings2Icon, TextSelectIcon, WorkflowIcon } from 'lucide-vue-next'
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
.workflow-launcher { flex: 1; min-width: 0; overflow: auto; padding: var(--space-16); background: var(--background-color); color: var(--text-color); }
header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-12); margin-bottom: var(--space-16); }
h2 { margin: 0 0 var(--space-4); font-size: var(--font-size-24); line-height: 1.4; font-weight: var(--font-weight-semibold); }
header p { margin: 0; font-size: var(--font-size-14); line-height: 1.6; color: var(--faded-text-color); }
button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-4); min-height: var(--space-20); margin: 0; padding: var(--space-4) var(--space-8); border-radius: var(--radius-lg); font-size: var(--font-size-13); }
button svg { width: var(--icon-md); height: var(--icon-md); }
ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(var(--space-32) * 5)), 1fr)); gap: var(--space-12); list-style: none; padding: 0; margin: 0; max-width: calc(var(--space-32) * 16); }
li { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-12); min-width: 0; padding: var(--space-12); border: var(--space-px) solid var(--border-color); background: var(--background-color); border-radius: var(--radius-2xl); box-shadow: var(--shadow-card); }
.workflow-symbol { display: flex; align-items: center; justify-content: center; width: var(--space-24); height: var(--space-24); border-radius: var(--radius-xl); color: var(--highlight-color); background: color-mix(in srgb, var(--highlight-color) 8%, var(--background-color)); }
.workflow-symbol svg { width: var(--icon-xl); height: var(--icon-xl); }
li strong { font-size: var(--font-size-16); font-weight: var(--font-weight-semibold); line-height: 1.5; overflow-wrap: anywhere; }
li p { margin: var(--space-4) 0 var(--space-8); font-size: var(--font-size-13); line-height: 1.6; color: var(--faded-text-color); }
kbd { display: inline-block; max-width: 100%; box-sizing: border-box; border: var(--space-px) solid var(--border-color); border-radius: var(--radius-sm); background: var(--background-color-light); padding: var(--space-2) var(--space-4); font-family: inherit; font-size: var(--font-size-12); color: var(--faded-text-color); overflow-wrap: anywhere; }
li button { margin-top: auto; width: 100%; justify-content: space-between; background: var(--background-color-light); }
li button:not(:disabled):hover { border-color: var(--highlight-color); color: var(--highlight-color); }
li.disabled { opacity: 0.6; }
[role=alert] { color: var(--color-error); overflow-wrap: anywhere; }
</style>
