import { app, globalShortcut } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ContextWorkflow } from '../types/chat_agent'
import { listChatAgents } from './chat_agents'
import { captureScreenshot, captureSelectedText, openPromptWorkflow } from './screenshot_action'

const registered = new Map<string, string>()
const file = () => path.join(app.getPath('userData'), 'context-workflows.json')
const persist = (items: ContextWorkflow[]) => {
  const temporary = file() + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(items, null, 2), { mode: 0o600 })
  fs.renameSync(temporary, file())
}
export const listContextWorkflows = (): ContextWorkflow[] => {
  if (fs.existsSync(file())) return JSON.parse(fs.readFileSync(file(), 'utf8'))
  const oldFile = path.join(app.getPath('userData'), 'screenshot-action.json')
  const old = fs.existsSync(oldFile) ? JSON.parse(fs.readFileSync(oldFile, 'utf8')) : {}
  const items: ContextWorkflow[] = [{ schemaVersion: 1, id: 'screenshot-ask', name: 'Screenshot Ask', contextInput: 'screenshot', agentId: old.agentId, prompt: 'Explain what is shown in this screenshot and answer any visible question.', accelerator: old.accelerator || '', enabled: true }]
  persist(items)
  return items
}
export const runContextWorkflow = async (id?: string): Promise<void> => {
  const items = listContextWorkflows()
  const workflow = id ? items.find(w => w.id === id) : items.find(w => w.enabled && w.contextInput === 'screenshot')
  if (id && (!workflow || !workflow.enabled)) throw new Error('This workflow is missing or disabled.')
  if (workflow?.contextInput === 'none') openPromptWorkflow(workflow)
  else if (workflow?.contextInput === 'selected-text') await captureSelectedText(workflow)
  else await captureScreenshot(false, workflow || null)
}
export const registerContextWorkflowShortcuts = (): void => {
  // The standard shortcut registry has just unregistered all accelerators.
  registered.clear()
  for (const workflow of listContextWorkflows()) {
    if (!workflow.enabled || !workflow.accelerator) continue
    try {
      if (!globalShortcut.register(workflow.accelerator, () => { void runContextWorkflow(workflow.id).catch(() => {}) })) throw new Error('Unavailable workflow shortcut')
      registered.set(workflow.id, workflow.accelerator)
    } catch { console.warn(`Workflow shortcut unavailable: ${workflow.name}`) }
  }
}
export const saveContextWorkflow = (input: ContextWorkflow): ContextWorkflow => {
  if (!input.name?.trim() || !['screenshot', 'selected-text', 'none'].includes(input.contextInput)) throw new Error('Enter a workflow name and context input.')
  const accelerator = input.accelerator?.trim() || ''
  if (accelerator && !/(Command|Control|Ctrl|Alt|Option|CmdOrCtrl|CommandOrControl)\+/i.test(accelerator)) throw new Error('Use a shortcut with Command, Control or Option.')
  if (input.agentId && !listChatAgents().some(a => a.id === input.agentId)) throw new Error('The selected Agent no longer exists. Choose another Agent.')
  if (input.mode && !['chat', 'task'].includes(input.mode)) throw new Error('Choose a valid workflow mode.')
  const item: ContextWorkflow = { schemaVersion: 1, id: input.id || crypto.randomUUID(), name: input.name.trim(), contextInput: input.contextInput, mode: input.mode || 'chat', agentId: input.agentId || undefined, prompt: input.prompt?.trim() || '', accelerator, enabled: !!input.enabled }
  const items = listContextWorkflows()
  if (item.enabled && accelerator && items.some(w => w.id !== item.id && w.enabled && w.accelerator.toLowerCase() === accelerator.toLowerCase())) throw new Error('Another workflow uses this shortcut. The previous settings are unchanged.')
  const previous = registered.get(item.id)
  const next = item.enabled ? accelerator : ''
  let added = false
  if (next && next !== previous) {
    if (globalShortcut.isRegistered(next) || !globalShortcut.register(next, () => { void runContextWorkflow(item.id).catch(() => {}) })) throw new Error('Shortcut is already in use or unavailable. The previous settings are unchanged.')
    added = true
  }
  const index = items.findIndex(w => w.id === item.id)
  if (index >= 0) items[index] = item
  else items.push(item)
  try { persist(items) } catch (e) { if (added) globalShortcut.unregister(next); throw e }
  if (previous && previous !== next) globalShortcut.unregister(previous)
  if (next) registered.set(item.id, next)
  else registered.delete(item.id)
  return item
}
export const removeContextWorkflow = (id: string): void => {
  persist(listContextWorkflows().filter(w => w.id !== id))
  const accelerator = registered.get(id)
  if (accelerator) globalShortcut.unregister(accelerator)
  registered.delete(id)
}
