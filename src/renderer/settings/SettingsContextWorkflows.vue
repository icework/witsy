<template>
  <div class="contextworkflows tab-content">
    <header><div class="title">{{ t('contextWorkflow.title') }}</div></header>
    <main>
      <div class="master-detail">
        <aside class="md-master">
          <div class="list-heading"><span>{{ t('chatAgent.total', { count: workflows.length }) }}</span><button :aria-label="t('contextWorkflow.new')" @click="create"><PlusIcon /></button></div>
          <div class="md-master-list">
            <button v-for="workflow in workflows" :key="workflow.id" class="md-master-list-item" :class="{ selected: draft?.id === workflow.id }" @click="select(workflow)"><span><strong>{{ workflow.name }}</strong><small>{{ t('contextWorkflow.' + workflow.contextInput) }}{{ workflow.enabled ? '' : ' · ' + t('contextWorkflow.disabled') }}</small></span></button>
          </div>
        </aside>
        <section class="md-detail">
          <form v-if="draft" class="form form-large" @submit.prevent="save">
            <label>{{ t('contextWorkflow.name') }}<input v-model="draft.name" required /></label>
            <label>{{ t('contextWorkflow.input') }}<select v-model="draft.contextInput"><option value="screenshot">{{ t('contextWorkflow.screenshot') }}</option><option value="selected-text">{{ t('contextWorkflow.selected-text') }}</option></select></label>
            <p>{{ draft.contextInput === 'selected-text' ? t('contextWorkflow.selectionHelp') : t('contextWorkflow.screenshotHelp') }}</p>
            <label>{{ t('chatAgent.label') }}<select v-model="draft.agentId"><option value="">{{ t('chatAgent.chooseAfter') }}</option><option v-if="draft.agentId && !agents.some(a => a.id === draft.agentId)" :value="draft.agentId" disabled>{{ t('contextWorkflow.missingAgent') }}</option><option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{ agent.kind }})</option></select></label>
            <label>{{ t('contextWorkflow.prompt') }}<textarea v-model="draft.prompt" rows="4" /></label>
            <label>{{ t('chatAgent.accelerator') }}<input v-model="draft.accelerator" placeholder="Command+Shift+2" /></label>
            <p>{{ t('contextWorkflow.shortcutHelp') }}</p>
            <label class="enabled"><input type="checkbox" v-model="draft.enabled" />{{ t('contextWorkflow.enabled') }}</label>
            <p>{{ t('contextWorkflow.previewHelp') }}</p>
            <div class="actions">
              <button type="submit" :disabled="working">{{ t('common.save') }}</button>
              <button type="button" @click="reset">{{ t('common.cancel') }}</button>
              <button v-if="draft.id" type="button" @click="remove" :disabled="working">{{ t('common.delete') }}</button>
            </div>
          </form>
          <p v-else>{{ t('contextWorkflow.empty') }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="savedNotice" role="status">{{ t('contextWorkflow.saved') }}</p>
        </section>
      </div>
    </main>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { PlusIcon } from 'lucide-vue-next'
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
const select = (workflow: ContextWorkflow) => { draft.value = JSON.parse(JSON.stringify(workflow)); error.value = ''; savedNotice.value = false }
const create = () => { draft.value = { schemaVersion: 1, id: '', name: '', contextInput: 'screenshot', agentId: '', prompt: '', accelerator: '', enabled: true }; error.value = ''; savedNotice.value = false }
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
.contextworkflows { height: 100%; }
.contextworkflows > main { padding: 0; flex: 1; min-height: 0; }
.master-detail { height: 100%; }
.list-heading { display: flex; justify-content: space-between; align-items: center; color: var(--dimmed-text-color); }
.list-heading svg { width: var(--form-normal-font-size); height: var(--form-normal-font-size); }
.md-master-list-item { justify-content: flex-start; text-align: left; border: none; background: transparent; }
.md-master-list-item span { overflow: hidden; }
.md-master-list-item strong, .md-master-list-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-master-list-item small { color: var(--dimmed-text-color); }
form > label { display: flex; flex-direction: column; margin-block: var(--form-normal-font-size); }
form > label.enabled { flex-direction: row; align-items: center; }
.actions { display: flex; gap: var(--control-border-radius); flex-wrap: wrap; }
</style>
