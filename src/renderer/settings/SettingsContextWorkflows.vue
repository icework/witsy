<template>
  <div class="contextworkflows tab-content agent-settings">
    <header><div class="title">{{ t('contextWorkflow.title') }}</div></header>
    <main>
      <div class="master-detail">
        <aside class="md-master">
          <div class="list-heading"><span>{{ t('chatAgent.total', { count: workflows.length }) }}</span><button :aria-label="t('contextWorkflow.new')" @click="create"><PlusIcon /></button></div>
          <div class="md-master-list">
            <button v-for="workflow in workflows" :key="workflow.id" class="md-master-list-item" :class="{ selected: draft?.id === workflow.id }" :title="workflow.name" @click="select(workflow)"><WorkflowIcon aria-hidden="true" /><span><strong>{{ workflow.name }}</strong><small>{{ t(workflow.mode === 'task' ? 'contextWorkflow.taskMode' : 'contextWorkflow.chatMode') }} · {{ t('contextWorkflow.' + workflow.contextInput) }}{{ workflow.enabled ? '' : ' · ' + t('contextWorkflow.disabled') }}</small></span></button>
          </div>
        </aside>
        <section class="md-detail">
          <div v-if="draft" class="editor-heading"><h2>{{ draft.name || t('contextWorkflow.new') }}</h2><p>{{ t('agentDesign.workflowHelp') }}</p></div>
          <form v-if="draft" class="agent-form" @submit.prevent="save">
            <section class="form-section">
            <label>{{ t('contextWorkflow.name') }}<input v-model="draft.name" required /></label>
            <fieldset class="mode-picker"><legend>{{ t('contextWorkflow.mode') }}</legend><p>{{ t('contextWorkflow.modeHelp') }}</p><div class="mode-options">
              <label :class="{ selected: (draft.mode || 'chat') === 'chat' }"><input v-model="draft.mode" type="radio" value="chat" /><span><strong>{{ t('contextWorkflow.chatMode') }}</strong><small>{{ t('contextWorkflow.chatModeHelp') }}</small></span></label>
              <label :class="{ selected: draft.mode === 'task' }"><input v-model="draft.mode" type="radio" value="task" /><span><strong>{{ t('contextWorkflow.taskMode') }}</strong><small>{{ t('contextWorkflow.taskModeHelp') }}</small></span></label>
            </div></fieldset>
            <label>{{ t('contextWorkflow.input') }}<select v-model="draft.contextInput"><option value="none">{{ t('contextWorkflow.none') }}</option><option value="screenshot">{{ t('contextWorkflow.screenshot') }}</option><option value="selected-text">{{ t('contextWorkflow.selected-text') }}</option></select></label>
            <p>{{ t(draft.contextInput === 'none' ? 'contextWorkflow.noneHelp' : draft.contextInput === 'selected-text' ? 'contextWorkflow.selectionHelp' : 'contextWorkflow.screenshotHelp') }}</p>
            <label>{{ t('chatAgent.label') }}<select v-model="draft.agentId"><option value="">{{ t('chatAgent.chooseAfter') }}</option><option v-if="draft.agentId && !agents.some(a => a.id === draft.agentId)" :value="draft.agentId" disabled>{{ t('contextWorkflow.missingAgent') }}</option><option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{ agent.kind }})</option></select></label>
            <label>{{ t('contextWorkflow.prompt') }}<textarea v-model="draft.prompt" rows="4" /></label>
            </section>
            <section class="form-section">
            <h3>{{ t('agentDesign.activation') }}</h3>
            <label>{{ t('chatAgent.accelerator') }}<input v-model="draft.accelerator" placeholder="Command+Shift+2" /></label>
            <p>{{ t('contextWorkflow.shortcutHelp') }}</p>
            <label class="enabled"><input type="checkbox" v-model="draft.enabled" />{{ t('contextWorkflow.enabled') }}</label>
            <p>{{ t('contextWorkflow.previewHelp') }}</p>
            </section>
            <div class="form-actions">
              <button class="primary" type="submit" :disabled="working">{{ t('common.save') }}</button>
              <button type="button" @click="reset">{{ t('common.cancel') }}</button>
              <button class="danger" v-if="draft.id" type="button" @click="remove" :disabled="working">{{ t('common.delete') }}</button>
            </div>
          </form>
          <div v-else class="empty-state"><WorkflowIcon /><p>{{ t('contextWorkflow.empty') }}</p><button @click="create">{{ t('contextWorkflow.new') }}</button></div>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="savedNotice" role="status">{{ t('contextWorkflow.saved') }}</p>
        </section>
      </div>
    </main>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { PlusIcon, WorkflowIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'
import useEventBus from '@composables/event_bus'
import { ChatAgent, ContextWorkflow } from '../../types/chat_agent'
const workflows = ref<ContextWorkflow[]>([]), agents = ref<ChatAgent[]>([])
const draft = ref<ContextWorkflow>(), working = ref(false), error = ref(''), savedNotice = ref(false)
const { emitBusEvent } = useEventBus()
const attempt = async (action: () => Promise<void>) => {
  working.value = true; error.value = ''; savedNotice.value = false
  try { await action() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { working.value = false }
}
const select = (workflow: ContextWorkflow) => { draft.value = { ...JSON.parse(JSON.stringify(workflow)), mode: workflow.mode || 'chat' }; error.value = ''; savedNotice.value = false }
const create = () => { draft.value = { schemaVersion: 1, id: '', name: '', contextInput: 'screenshot', mode: 'chat', agentId: '', prompt: '', accelerator: '', enabled: true }; error.value = ''; savedNotice.value = false }
const load = () => attempt(async () => {
  workflows.value = await window.api.chatAgents.workflows()
  agents.value = await window.api.chatAgents.list()
  if (!draft.value && workflows.value[0]) select(workflows.value[0])
})
const save = () => attempt(async () => {
  const saved = await window.api.chatAgents.saveWorkflow(JSON.parse(JSON.stringify(draft.value)))
  workflows.value = await window.api.chatAgents.workflows(); select(saved); savedNotice.value = true
  emitBusEvent('chat-agent-settings-changed')
})
const reset = () => { const saved = workflows.value.find(w => w.id === draft.value?.id); if (saved) select(saved); else draft.value = undefined }
const remove = () => attempt(async () => { await window.api.chatAgents.removeWorkflow(draft.value.id); workflows.value = await window.api.chatAgents.workflows(); draft.value = undefined; if (workflows.value[0]) select(workflows.value[0]); emitBusEvent('chat-agent-settings-changed') })
defineExpose({ load })
</script>
<style scoped>
.mode-picker { min-width: 0; margin: 0; padding: 0; border: 0; }
.mode-picker legend { margin-bottom: var(--space-4); font-size: var(--font-size-13); font-weight: var(--font-weight-medium); }
.mode-picker > p { margin-bottom: var(--space-8); }
.mode-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8); }
.mode-options label { flex-direction: row; align-items: flex-start; padding: var(--space-8); border: var(--space-px) solid var(--control-border-color); border-radius: var(--radius-lg); background: var(--control-bg-color); cursor: pointer; }
.mode-options label.selected { border-color: var(--highlight-color); background: color-mix(in srgb, var(--highlight-color) 7%, var(--control-bg-color)); }
.agent-form .mode-options input[type='radio'] { flex: 0 0 var(--space-8); width: var(--space-8); min-width: var(--space-8); height: var(--space-8); min-height: var(--space-8); margin: var(--space-2) 0 0; padding: 0; accent-color: var(--highlight-color); }
.mode-options span { flex: 1 1 0; min-width: 0; }
.mode-options strong, .mode-options small { display: block; overflow-wrap: anywhere; }
.mode-options small { margin-top: var(--space-2); color: var(--faded-text-color); font-weight: var(--font-weight-regular); line-height: 1.5; }
@container agent-settings (max-width: 520px) { .mode-options { grid-template-columns: 1fr; } }
</style>
