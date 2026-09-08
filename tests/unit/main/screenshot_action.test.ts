import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const state = vi.hoisted(() => ({ home: '', registered: new Set<string>() }))
const win = vi.hoisted(() => ({ isDestroyed: () => false, isVisible: () => true, hide: vi.fn(), show: vi.fn(), getBounds: () => ({ x: 0, y: 0, width: 1400, height: 1000 }), setMinimumSize: vi.fn(), setBounds: vi.fn(), setAlwaysOnTop: vi.fn(), setWindowButtonVisibility: vi.fn() }))
const capture = vi.hoisted(() => ({ webContents: { id: 9 }, destroy: vi.fn(), show: vi.fn(), setAlwaysOnTop: vi.fn(), once: vi.fn() }))
const image = vi.hoisted(() => ({ isEmpty: () => false, getSize: () => ({ width: 200, height: 100 }), toDataURL: () => 'data:image/png;base64,aGVsbG8=', crop: vi.fn() }))
vi.mock('@main/window', () => ({ mainWindow: win, createWindow: vi.fn(() => capture), emitIpcEvent: vi.fn(), openMainWindow: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => state.home }, BrowserWindow: { getAllWindows: () => [win] },
  screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }), getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 2, size: { width: 1600, height: 1000 }, bounds: { x: 0, y: 0, width: 1600, height: 1000 }, workArea: { x: 0, y: 0, width: 1600, height: 1000 } }) },
  systemPreferences: { getMediaAccessStatus: () => 'granted' },
  desktopCapturer: { getSources: vi.fn(async () => [{ display_id: '1', thumbnail: image }]) },
  globalShortcut: { isRegistered: (key: string) => state.registered.has(key), register: (key: string) => { state.registered.add(key); return true }, unregister: (key: string) => state.registered.delete(key) },
}))
vi.mock('@main/context_selection', () => ({ readSelectedContext: vi.fn().mockResolvedValue('A controlled selection') }))
import { readSelectedContext } from '@main/context_selection'
import { desktopCapturer } from 'electron'
import { openPromptWorkflow, captureSelectedText, captureScreenshot, cropBounds, finishScreenshot, saveScreenshotSettings, screenshotSource, screenshotState, updateScreenshot } from '@main/screenshot_action'
beforeEach(() => { state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-action-test-')); image.crop.mockReturnValue(image); vi.clearAllMocks(); updateScreenshot({ dismiss: true, busy: false, expand: true }) })
afterEach(() => fs.rmSync(state.home, { recursive: true, force: true }))
test('cancel does not create an image and restores hidden windows', async () => {
  await captureScreenshot(true)
  finishScreenshot(9)
  expect(screenshotState().image).toBeUndefined()
  expect(screenshotState().capturing).toBe(false)
  expect(win.hide).toHaveBeenCalledOnce()
  expect(win.show).toHaveBeenCalledOnce()
  expect(() => screenshotSource(9)).toThrow()
})
test('capture is preview-only and repeated activation does not recapture a running task', async () => {
  await captureScreenshot(true)
  expect(() => screenshotSource(10)).toThrow()
  finishScreenshot(9, { x: 0.2, y: 0.1, width: 0.5, height: 0.5 })
  expect(image.crop).toHaveBeenCalledWith({ x: 40, y: 10, width: 100, height: 50 })
  expect(screenshotState()).toMatchObject({ image: 'data:image/png;base64,aGVsbG8=', compact: false, busy: false })
  expect(() => screenshotSource(9)).toThrow()
  updateScreenshot({ chatId: 'chat', busy: true })
  await captureScreenshot(true)
  expect(desktopCapturer.getSources).toHaveBeenCalledOnce()
  expect(screenshotState().chatId).toBe('chat')
  updateScreenshot({ expand: true })
  expect(win.setAlwaysOnTop).not.toHaveBeenCalled()
  expect(win.setBounds).not.toHaveBeenCalled()
})
test('retaking a pending task screenshot preserves its workflow and starts a new capture request', async () => {
  const workflow = { schemaVersion: 1 as const, id: 'task', name: 'Background screenshot', contextInput: 'screenshot' as const, mode: 'task' as const, agentId: 'agent', prompt: 'Describe the image', accelerator: '', enabled: true }
  await captureScreenshot(false, workflow)
  finishScreenshot(9, { x: 0, y: 0, width: 1, height: 1 })
  const first = screenshotState()
  await captureScreenshot(true)
  finishScreenshot(9, { x: 0, y: 0, width: 0.5, height: 0.5 })
  expect(screenshotState()).toMatchObject({ agentId: workflow.agentId, prompt: workflow.prompt, workflowName: workflow.name, workflowMode: 'task', image: 'data:image/png;base64,aGVsbG8=', capturing: false })
  expect(screenshotState().requestId).not.toBe(first.requestId)
  expect(desktopCapturer.getSources).toHaveBeenCalledTimes(2)
})
test.each([false, true])('ordinary capture after dismissing a task clears workflow metadata (fresh=%s)', async fresh => {
  await captureScreenshot(false, { schemaVersion: 1, id: 'task', name: 'Background screenshot', contextInput: 'screenshot', mode: 'task', agentId: 'agent', prompt: 'Describe the image', accelerator: '', enabled: true })
  finishScreenshot(9, { x: 0, y: 0, width: 1, height: 1 })
  updateScreenshot({ dismiss: true })
  await captureScreenshot(fresh)
  finishScreenshot(9, { x: 0, y: 0, width: 1, height: 1 })
  expect(screenshotState()).toMatchObject({ contextKind: 'screenshot', workflowMode: 'chat' })
  expect(screenshotState().agentId).toBeUndefined()
  expect(screenshotState().prompt).toBeUndefined()
  expect(screenshotState().workflowName).toBeUndefined()
})
test('a shortcut conflict retains the working binding and settings', () => {
  saveScreenshotSettings({ accelerator: 'Command+Shift+2', agentId: 'a' })
  state.registered.add('Command+Shift+3')
  expect(() => saveScreenshotSettings({ accelerator: 'Command+Shift+3' })).toThrow()
  expect(state.registered.has('Command+Shift+2')).toBe(true)
  saveScreenshotSettings({ accelerator: '' })
  expect(state.registered.has('Command+Shift+2')).toBe(false)
})

test('maps normalized selections to Retina pixels and rejects invalid regions', () => {
  expect(cropBounds(3200, 2000, { x: 0.25, y: 0.2, width: 0.5, height: 0.5 })).toEqual({ x: 800, y: 400, width: 1600, height: 1000 })
  expect(() => cropBounds(100, 100, { x: -1, y: 0, width: 1, height: 1 })).toThrow()
})

test('selected text previews its workflow context without capturing the screen or submitting a task', async () => {
  const workflow = { schemaVersion: 1 as const, id: 'selection', name: 'Translate', contextInput: 'selected-text' as const, agentId: 'agent', prompt: 'Translate into Chinese', accelerator: '', enabled: true }
  await captureSelectedText(workflow)
  expect(screenshotState()).toMatchObject({ contextKind: 'selected-text', contextText: 'A controlled selection', agentId: 'agent', prompt: 'Translate into Chinese', compact: false, busy: false })
  expect(desktopCapturer.getSources).not.toHaveBeenCalled()
  await captureSelectedText({ ...workflow, agentId: 'other' })
  expect(readSelectedContext).toHaveBeenCalledOnce()
  expect(screenshotState().agentId).toBe('agent')
  updateScreenshot({ dismiss: true })
  expect(screenshotState().contextText).toBeUndefined()
  expect(screenshotState().contextKind).toBeUndefined()
})
test('unavailable selected text opens an editable empty preview', async () => {
  vi.mocked(readSelectedContext).mockRejectedValueOnce(new Error('Selection unavailable'))
  await captureSelectedText({ schemaVersion: 1, id: 'selection', name: 'Translate', contextInput: 'selected-text', prompt: '', accelerator: '', enabled: true })
  expect(screenshotState()).toMatchObject({ contextKind: 'selected-text', compact: false, capturing: false, error: 'Selection unavailable' })
  expect(screenshotState().contextText).toBeUndefined()
})

test('manual text clears workflow defaults and repeated clicks preserve the pending draft', async () => {
  await captureSelectedText({ schemaVersion: 1, id: 'w', name: 'Preset', contextInput: 'selected-text', mode: 'task', agentId: 'a', prompt: 'Old task', accelerator: '', enabled: true })
  updateScreenshot({ dismiss: true, expand: true })
  updateScreenshot({ manualText: true })
  const pending = screenshotState()
  expect(pending).toMatchObject({ contextKind: 'selected-text', compact: false, busy: false })
  expect(pending.agentId).toBeUndefined()
  expect(pending.prompt).toBeUndefined()
  expect(pending.workflowName).toBeUndefined()
  expect(pending.workflowMode).toBe('chat')
  updateScreenshot({ manualText: true })
  expect(screenshotState().requestId).toBe(pending.requestId)
  expect(readSelectedContext).toHaveBeenCalledOnce()
})


test.each(['chat', 'task'] as const)('a %s workflow with no context prepares instructions without reading the screen or selection', mode => {
  const workflow = { schemaVersion: 1 as const, id: 'none', name: 'Quick task', contextInput: 'none' as const, mode, prompt: 'Write a checklist', agentId: 'a', accelerator: '', enabled: true }
  openPromptWorkflow(workflow)
  const pending = screenshotState()
  expect(pending).toMatchObject({ contextKind: 'none', workflowMode: mode, prompt: workflow.prompt, agentId: 'a', compact: mode === 'task', busy: false, capturing: false })
  expect(pending.image).toBeUndefined()
  expect(pending.contextText).toBeUndefined()
  expect(desktopCapturer.getSources).not.toHaveBeenCalled()
  expect(readSelectedContext).not.toHaveBeenCalled()
  openPromptWorkflow({ ...workflow, prompt: 'Other task' })
  updateScreenshot({ manualText: true })
  expect(screenshotState()).toEqual(pending)
  updateScreenshot({ dismiss: true })
  openPromptWorkflow({ ...workflow, prompt: 'New task' })
  expect(screenshotState().prompt).toBe('New task')
  expect(screenshotState().requestId).not.toBe(pending.requestId)
  updateScreenshot({ chatId: 'running', busy: true })
  const running = screenshotState()
  openPromptWorkflow(workflow)
  expect(screenshotState()).toEqual(running)
})

test('background launcher restores regular chat sizing after submission and original bounds on expand', () => {
  openPromptWorkflow({ schemaVersion: 1, id: 'launcher', name: 'Task', contextInput: 'none', mode: 'task', prompt: 'Summarize', accelerator: '', enabled: true })
  expect(win.setMinimumSize).toHaveBeenLastCalledWith(480, 220)
  expect(win.setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ width: 640, height: 260 }))
  updateScreenshot({ chatId: 'running', busy: true })
  expect(win.setMinimumSize).toHaveBeenLastCalledWith(800, 600)
  if (process.platform === 'darwin') expect(win.setWindowButtonVisibility).toHaveBeenLastCalledWith(true)
  updateScreenshot({ expand: true })
  expect(win.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1400, height: 1000 })
})
