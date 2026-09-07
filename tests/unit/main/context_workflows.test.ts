import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ContextWorkflow } from '../../../src/types/chat_agent'
const state = vi.hoisted(() => ({ home: '', keys: new Map<string, () => void>() }))
vi.mock('electron', () => ({ app: { getPath: () => state.home }, globalShortcut: {
  isRegistered: (key: string) => state.keys.has(key),
  register: (key: string, callback: () => void) => { if (state.keys.has(key)) return false; state.keys.set(key, callback); return true },
  unregister: (key: string) => state.keys.delete(key),
} }))
vi.mock('@main/chat_agents', () => ({ listChatAgents: () => [{ id: 'agent' }] }))
vi.mock('@main/screenshot_action', () => ({ captureScreenshot: vi.fn(), captureSelectedText: vi.fn() }))
import { captureScreenshot, captureSelectedText } from '@main/screenshot_action'
import { listContextWorkflows, registerContextWorkflowShortcuts, removeContextWorkflow, runContextWorkflow, saveContextWorkflow } from '@main/context_workflows'
const selection: ContextWorkflow = { schemaVersion: 1, id: 'selected', name: 'Translate', contextInput: 'selected-text', agentId: 'agent', prompt: 'Translate', accelerator: 'Command+Shift+7', enabled: true }
beforeEach(() => { state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-workflow-')); state.keys.clear(); vi.clearAllMocks() })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(state.home, { recursive: true, force: true }) })
test('migrates the previous screenshot shortcut and Agent once, retaining the old file', () => {
  const oldFile = path.join(state.home, 'screenshot-action.json')
  fs.writeFileSync(oldFile, JSON.stringify({ accelerator: 'Command+Shift+2', agentId: 'agent' }))
  const [workflow] = listContextWorkflows()
  expect(workflow).toMatchObject({ contextInput: 'screenshot', agentId: 'agent', accelerator: 'Command+Shift+2' })
  saveContextWorkflow({ ...workflow, name: 'Renamed' })
  expect(listContextWorkflows()).toHaveLength(1)
  expect(listContextWorkflows()[0].name).toBe('Renamed')
  expect(fs.existsSync(oldFile)).toBe(true)
})
test('different workflow shortcuts route to their own input and Agent; disable unregisters only its own shortcut', async () => {
  registerContextWorkflowShortcuts()
  saveContextWorkflow({ ...listContextWorkflows()[0], accelerator: 'Command+Shift+2', agentId: 'agent' })
  saveContextWorkflow(selection)
  state.keys.get('Command+Shift+7')()
  expect(captureSelectedText).toHaveBeenCalledWith({ ...selection, mode: 'chat' })
  state.keys.get('Command+Shift+2')()
  expect(captureScreenshot).toHaveBeenCalledWith(false, expect.objectContaining({ contextInput: 'screenshot', agentId: 'agent' }))
  saveContextWorkflow({ ...selection, enabled: false })
  expect(state.keys.has('Command+Shift+7')).toBe(false)
  expect(state.keys.has('Command+Shift+2')).toBe(true)
  await expect(runContextWorkflow('selected')).rejects.toThrow('disabled')
  removeContextWorkflow('selected')
  expect(listContextWorkflows().some(w => w.id === 'selected')).toBe(false)
})
test('conflicts and failed disk writes preserve the old binding and saved workflow', () => {
  registerContextWorkflowShortcuts(); saveContextWorkflow(selection)
  state.keys.set('Command+Shift+3', vi.fn())
  expect(() => saveContextWorkflow({ ...selection, accelerator: 'Command+Shift+3' })).toThrow()
  expect(listContextWorkflows().find(w => w.id === 'selected')?.accelerator).toBe('Command+Shift+7')
  vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('Disk error') })
  expect(() => saveContextWorkflow({ ...selection, accelerator: 'Command+Shift+8' })).toThrow('Disk error')
  expect(state.keys.has('Command+Shift+8')).toBe(false)
  expect(state.keys.has('Command+Shift+7')).toBe(true)
  expect(() => saveContextWorkflow({ ...selection, agentId: 'deleted' })).toThrow('no longer exists')
})
