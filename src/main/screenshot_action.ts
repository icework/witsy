import { app, BrowserWindow, desktopCapturer, globalShortcut, NativeImage, screen, systemPreferences } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readSelectedContext } from './context_selection'
import { setTimeout as compositorDelay } from 'node:timers/promises'
import { ContextWorkflow, ScreenshotSettings, ScreenshotState } from '../types/chat_agent'
import { createWindow, emitIpcEvent, mainWindow, openMainWindow } from './window'

const state: ScreenshotState = { capturing: false, compact: false, busy: false }
let originalBounds: Electron.Rectangle | undefined
let registered = ''
let overlay: BrowserWindow | undefined
let sourceImage: NativeImage | undefined
let hiddenWindows: BrowserWindow[] = []
const settingsFile = () => path.join(app.getPath('userData'), 'screenshot-action.json')
export const screenshotState = (): ScreenshotState => ({ ...state })
const publish = () => { if (mainWindow && !mainWindow.isDestroyed()) emitIpcEvent(mainWindow, 'screenshot-state', { ...state }) }
export const screenshotSettings = (): ScreenshotSettings => fs.existsSync(settingsFile()) ? JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) : { accelerator: '' }

export const registerScreenshotShortcut = (): void => {
  registered = '' // called after the standard shortcut registry has been rebuilt
  const settings = screenshotSettings()
  if (!settings.accelerator) return
  try {
    if (globalShortcut.isRegistered(settings.accelerator) || !globalShortcut.register(settings.accelerator, () => { void captureScreenshot() })) throw new Error('Shortcut is already in use or unavailable.')
    registered = settings.accelerator
    state.error = undefined
  } catch (e) { state.error = String(e); publish() }
}
export const saveScreenshotSettings = (settings: ScreenshotSettings): ScreenshotSettings => {
  const accelerator = settings.accelerator.trim()
  if (accelerator && !/(Command|Control|Ctrl|Alt|Option|CmdOrCtrl|CommandOrControl)\+/i.test(accelerator)) throw new Error('Use a shortcut with Command, Control or Option.')
  if (accelerator !== registered) {
    if (accelerator && (globalShortcut.isRegistered(accelerator) || !globalShortcut.register(accelerator, () => { void captureScreenshot() }))) throw new Error('Shortcut is already in use or unavailable. The previous shortcut is unchanged.')
    if (registered) globalShortcut.unregister(registered)
    registered = accelerator
  }
  const next = { accelerator, agentId: settings.agentId }
  fs.writeFileSync(settingsFile(), JSON.stringify(next), { mode: 0o600 })
  state.error = undefined
  return next
}

const show = () => {
  openMainWindow({ queryParams: { view: 'chat' } })
  if (!state.compact) {
    originalBounds = mainWindow.getBounds()
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    mainWindow.setMinimumSize(600, 500)
    mainWindow.setBounds({ x: area.x + Math.max(0, area.width - 820), y: area.y + 40, width: Math.min(800, area.width), height: Math.min(740, area.height - 40) })
    mainWindow.setAlwaysOnTop(true)
    state.compact = true
  }
  publish()
}

export const openQuickChat = (fresh = false): void => {
  if (state.capturing) { overlay?.show(); return }
  // Reopening pending context or a running chat must not replace its state.
  if (!state.busy && !state.image && state.contextKind !== 'selected-text') {
    state.quickChatRequest = { id: crypto.randomUUID(), fresh }
    state.chatId = undefined
    state.error = undefined
  }
  show()
}

export const updateScreenshot = (update: { manualText?: boolean; dismiss?: boolean; chatId?: string; busy?: boolean; expand?: boolean; hide?: boolean }) => {
  if (update.manualText && !state.busy && !state.capturing && !state.image && state.contextKind !== 'selected-text') { beginContext('selected-text', null); state.error = undefined }
  if (update.dismiss) { state.image = undefined; state.contextText = undefined; state.contextKind = undefined; state.workflowMode = undefined; state.error = undefined }
  if (update.chatId) { state.chatId = update.chatId; state.image = undefined; state.contextText = undefined; state.contextKind = undefined; state.error = undefined }
  if (update.busy !== undefined && (!update.chatId || update.chatId === state.chatId)) state.busy = update.busy
  if (update.expand && mainWindow) {
    state.compact = false
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setMinimumSize(800, 600)
    if (originalBounds) mainWindow.setBounds(originalBounds)
    originalBounds = undefined
  }
  if (update.hide) mainWindow?.hide()
  publish()
}

export const screenshotSource = (senderId: number): string => {
  if (overlay?.webContents.id !== senderId) throw new Error('Only the capture overlay can read the frozen screen.')
  return sourceImage?.toDataURL() || ''
}
export const cropBounds = (width: number, height: number, region: { x: number; y: number; width: number; height: number }) => {
  if (Object.values(region).some(n => !Number.isFinite(n)) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1.001 || region.y + region.height > 1.001) throw new Error('Choose a region inside the screen.')
  const x = Math.floor(region.x * width), y = Math.floor(region.y * height)
  return { x, y, width: Math.min(width - x, Math.max(1, Math.floor(region.width * width))), height: Math.min(height - y, Math.max(1, Math.floor(region.height * height))) }
}
export const finishScreenshot = (senderId: number, region?: { x: number; y: number; width: number; height: number }) => {
  if (overlay?.webContents.id !== senderId) throw new Error('The capture overlay is no longer active.')
  let image: string | undefined
  if (region && sourceImage) {
    const size = sourceImage.getSize()
    let img = sourceImage.crop(cropBounds(size.width, size.height, region))
    const cropped = img.getSize()
    if (Math.max(cropped.width, cropped.height) > 2048) img = img.resize(cropped.width >= cropped.height ? { width: 2048 } : { height: 2048 })
    image = img.toDataURL()
    if (image.length > 7 * 1024 * 1024) image = `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}`
  }
  const window = overlay
  overlay = undefined; sourceImage = undefined; state.capturing = false
  window.destroy()
  if (image) { state.image = image; state.chatId = undefined; show() }
  else hiddenWindows.forEach(w => { if (!w.isDestroyed()) w.show() })
  hiddenWindows = []
  publish()
}
export const captureScreenshot = async (fresh = false, workflow?: ContextWorkflow | null): Promise<void> => {
  if (state.capturing) { overlay?.show(); return }
  if (state.busy || ((state.image || state.contextKind === 'selected-text') && !fresh)) { show(); return }
  if (process.platform !== 'darwin') { state.error = 'Region capture is currently available on macOS.'; show(); return }
  if (systemPreferences.getMediaAccessStatus('screen') === 'denied') { state.error = 'Enable Screen Recording for Summon (Electron in development) in macOS System Settings, then restart the app.'; show(); return }
  // Retake replaces only the pending image; a new ordinary capture starts clean.
  const previousWorkflow = fresh && workflow === undefined && state.contextKind === 'screenshot' && state.image
    ? { agentId: state.agentId, prompt: state.prompt, workflowName: state.workflowName, workflowMode: state.workflowMode }
    : undefined
  beginContext('screenshot', workflow)
  if (previousWorkflow) Object.assign(state, previousWorkflow)
  state.capturing = true; state.error = undefined
  publish()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  hiddenWindows = BrowserWindow.getAllWindows().filter(w => w.isVisible())
  hiddenWindows.forEach(w => w.hide())
  try {
    // macOS fades hidden windows out; wait for that animation before freezing the display.
    await compositorDelay(300)
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } })
    sourceImage = sources.find(s => s.display_id === String(display.id))?.thumbnail
    if (!sourceImage || sourceImage.isEmpty()) throw new Error('Screen capture is unavailable. Enable Screen Recording for Summon (Electron in development), then restart it.')
    overlay = createWindow({ title: 'Summon Capture', ...display.bounds, frame: false, alwaysOnTop: true, resizable: false, movable: false, skipTaskbar: true, hash: '/capture' })
    const captureWindow = overlay
    captureWindow.setAlwaysOnTop(true, 'screen-saver')
    captureWindow.once('closed', () => {
      if (overlay === captureWindow) {
        overlay = undefined; sourceImage = undefined; state.capturing = false
        hiddenWindows.forEach(w => { if (!w.isDestroyed()) w.show() }); hiddenWindows = []; publish()
      }
    })
  } catch (e) {
    sourceImage = undefined; state.capturing = false
    hiddenWindows.forEach(w => { if (!w.isDestroyed()) w.show() }); hiddenWindows = []
    state.error = e instanceof Error ? e.message : 'Screen capture failed.'
    show(); publish()
  }
}

const beginContext = (kind: 'screenshot' | 'selected-text', workflow?: ContextWorkflow | null) => {
  state.quickChatRequest = undefined
  state.contextKind = kind; state.contextText = undefined; state.image = undefined; state.chatId = undefined
  state.requestId = crypto.randomUUID()
  state.agentId = workflow?.agentId; state.prompt = workflow?.prompt; state.workflowName = workflow?.name; state.workflowMode = workflow?.mode || 'chat'
}
export const captureSelectedText = async (workflow: ContextWorkflow): Promise<void> => {
  if (state.capturing) { overlay?.show(); return }
  if (state.busy || state.image || state.contextKind === 'selected-text') { show(); return }
  beginContext('selected-text', workflow)
  state.capturing = true; state.error = undefined
  // Read before bringing Summon to the foreground, so the source selection stays active.
  try {
    if (process.platform !== 'darwin') throw new Error('Selected text capture is currently available on macOS. Paste text in the preview instead.')
    const text = await readSelectedContext()
    if (text.length > 64000) throw new Error('The selected text is too long. Paste a smaller selection in the preview.')
    state.contextText = text
    if (!text.trim()) state.error = 'No selected text was available. Select text in the source app and use the workflow shortcut, or paste it below.'
  } catch (e) { state.error = e instanceof Error ? e.message : String(e) }
  finally { state.capturing = false; show(); publish() }
}
