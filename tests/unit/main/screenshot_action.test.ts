import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const state = vi.hoisted(() => ({ home: '', registered: new Set<string>() }))
const win = vi.hoisted(() => ({ isDestroyed: () => false, isVisible: () => true, hide: vi.fn(), show: vi.fn(), getBounds: () => ({ x: 0, y: 0, width: 1400, height: 1000 }), setMinimumSize: vi.fn(), setBounds: vi.fn(), setAlwaysOnTop: vi.fn() }))
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
import { captureSelectedText, captureScreenshot, cropBounds, finishScreenshot, saveScreenshotSettings, screenshotSource, screenshotState, updateScreenshot } from '@main/screenshot_action'
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
  expect(screenshotState()).toMatchObject({ image: 'data:image/png;base64,aGVsbG8=', compact: true, busy: false })
  expect(() => screenshotSource(9)).toThrow()
  updateScreenshot({ chatId: 'chat', busy: true })
  await captureScreenshot(true)
  expect(desktopCapturer.getSources).toHaveBeenCalledOnce()
  expect(screenshotState().chatId).toBe('chat')
  updateScreenshot({ expand: true })
  expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
  expect(win.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1400, height: 1000 })
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
  expect(screenshotState()).toMatchObject({ contextKind: 'selected-text', contextText: 'A controlled selection', agentId: 'agent', prompt: 'Translate into Chinese', compact: true, busy: false })
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
  expect(screenshotState()).toMatchObject({ contextKind: 'selected-text', compact: true, capturing: false, error: 'Selection unavailable' })
  expect(screenshotState().contextText).toBeUndefined()
})

test('manual text clears workflow defaults and repeated clicks preserve the pending draft', async () => {
  await captureSelectedText({ schemaVersion: 1, id: 'w', name: 'Preset', contextInput: 'selected-text', agentId: 'a', prompt: 'Old task', accelerator: '', enabled: true })
  updateScreenshot({ dismiss: true, expand: true })
  updateScreenshot({ manualText: true })
  const pending = screenshotState()
  expect(pending).toMatchObject({ contextKind: 'selected-text', compact: false, busy: false })
  expect(pending.agentId).toBeUndefined()
  expect(pending.prompt).toBeUndefined()
  updateScreenshot({ manualText: true })
  expect(screenshotState().requestId).toBe(pending.requestId)
  expect(readSelectedContext).toHaveBeenCalledOnce()
})
