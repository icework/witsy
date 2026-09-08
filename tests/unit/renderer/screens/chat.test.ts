
import { enableAutoUnmount, flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { defaultCapabilities } from 'multi-llm-ts'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import ChatScreen from '@screens/Chat.vue'
import ChatModel from '@models/chat'
import { store } from '@services/store'
import Assistant from '@services/assistant'
import LlmMock from '@tests/mocks/llm'
import { useBrowserMock, useWindowMock } from '@tests/mocks/window'
import { stubTeleport } from '@tests/mocks/stubs'

vi.mock('@services/llms/manager.ts', async () => {
  const LlmManager = vi.fn()
  LlmManager.prototype.initModels = vi.fn()
  LlmManager.prototype.isEngineReady = vi.fn(() => true)
  LlmManager.prototype.isEngineConfigured = vi.fn(() => true)
  LlmManager.prototype.getEngineName = () => 'mock'
  LlmManager.prototype.getCustomEngines = () => [] as any[]
  LlmManager.prototype.getChatModels = vi.fn(() => [{ id: 'chat', name: 'chat', ...defaultCapabilities }])
  LlmManager.prototype.getChatModel = vi.fn(() => ({ id: 'chat', name: 'chat', capabilities: { ...defaultCapabilities, vision: true } }))
  LlmManager.prototype.isComputerUseModel = vi.fn(() => false)
  LlmManager.prototype.getChatEngineModel = () => ({ engine: 'mock', model: 'chat' })
  LlmManager.prototype.getChatEngines = vi.fn(() => ['mock'])
  LlmManager.prototype.hasChatModels = vi.fn(() => true)
  LlmManager.prototype.isCustomEngine = vi.fn(() => false)
  LlmManager.prototype.igniteEngine = vi.fn(() => new LlmMock(store.config.engines.mock))
  LlmManager.prototype.checkModelsCapabilities = vi.fn()
  LlmManager.prototype.loadTools = vi.fn()
  return { default: LlmManager }
})

vi.mock('@renderer/utils/dialog', () => ({
  default: {
    show: vi.fn(),
    alert: vi.fn()
  }
}))

enableAutoUnmount(afterEach)

beforeAll(async () => {
  useWindowMock({ modelDefaults: true })
  useBrowserMock()
  store.loadSettings()
  store.loadHistory()
})

beforeEach(() => {
  vi.clearAllMocks()
  store.config.chatHistory.incognito = false
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([])
})

test('Renders correctly', () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  expect(wrapper.exists()).toBe(true)
  expect(wrapper.find('.chat').exists()).toBe(true)
  expect(wrapper.find('.prompt .model-menu-button').exists()).toBe(false)
  expect(wrapper.findAll('.prompt .actions .chat-configuration select')).toHaveLength(3)
  expect(wrapper.find('.chat-agent-picker > .chat-configuration').exists()).toBe(false)
  expect(wrapper.find('.prompt textarea').exists()).toBe(true)
})

test('main screenshot composer uses the saved Native agent and image without an external runtime or temporary file', async () => {
  store.config.chatHistory.incognito = true
  const agent = { id: 'native-test', name: 'Native vision', kind: 'native' as const, native: { engine: 'mock', model: 'vision', instructions: 'Read images briefly', tools: [] } }
  vi.mocked(window.api.chatAgents.list).mockResolvedValueOnce([agent])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValueOnce({ compact: true, capturing: false, busy: false, image: 'data:image/png;base64,aGVsbG8=' })
  const prompt = vi.spyOn(Assistant.prototype, 'prompt').mockResolvedValue('success')
  const wrapper = mount(ChatScreen, { ...stubTeleport })
  await flushPromises()
  const picker = wrapper.find('.chat-agent-picker')
  await picker.find('select').setValue(agent.id)
  await flushPromises()
  await wrapper.find('.prompt textarea').setValue('Name the colors')
  await wrapper.find('.prompt textarea').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Name the colors'), expect.objectContaining({ model: 'vision', instructions: 'Read images briefly', attachments: [expect.objectContaining({ content: 'aGVsbG8=' })] }), expect.any(Function), expect.any(Function))
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(window.api.file.save).not.toHaveBeenCalled()
  expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ dismiss: true })
  expect(wrapper.vm.assistant.chat.chatAgent).toEqual(agent)
  expect(wrapper.vm.assistant.chat.temporary).toBe(true)
  expect(store.history.chats.some(c => c.uuid === wrapper.vm.assistant.chat.uuid)).toBe(false)
  prompt.mockRestore()
})

test('workflow prefills Native config without sending; a manual model override wins on send', async () => {
  const agent = { id: 'native-preset', name: 'Preset', kind: 'native' as const, native: { engine: 'mock', model: 'vision', instructions: 'Template instruction', tools: [] } }
  vi.mocked(window.api.chatAgents.list).mockResolvedValueOnce([agent])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValueOnce({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', requestId: 'prefill', workflowName: 'Explain', contextText: 'Context to explain', agentId: agent.id, prompt: 'Explain briefly' })
  const prompt = vi.spyOn(Assistant.prototype, 'prompt').mockResolvedValue('success')
  const wrapper = mount(ChatScreen, { ...stubTeleport })
  await flushPromises()
  expect(wrapper.vm.assistant.chat.model).toBe('vision')
  expect(prompt).not.toHaveBeenCalled()
  await wrapper.findAll('.prompt .chat-configuration select')[2].setValue('chat')
  expect(wrapper.vm.assistant.chat.model).toBe('chat')
  await wrapper.find('.prompt textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Context to explain'), expect.objectContaining({ model: 'chat', instructions: 'Template instruction' }), expect.any(Function), expect.any(Function))
  expect(agent.native.model).toBe('vision')
  prompt.mockRestore()
})

test('manual text sends using the current chat without any saved Agent', async () => {
  vi.mocked(window.api.chatAgents.list).mockResolvedValueOnce([])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValueOnce({ compact: false, capturing: false, busy: false, contextKind: 'selected-text', requestId: 'manual', contextText: 'Manual context' })
  const prompt = vi.spyOn(Assistant.prototype, 'prompt').mockResolvedValue('success')
  const wrapper = mount(ChatScreen, { ...stubTeleport })
  await flushPromises()
  const uuid = wrapper.vm.assistant.chat.uuid
  await wrapper.find('.prompt textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(prompt).toHaveBeenCalledWith(expect.stringContaining('Manual context'), expect.objectContaining({ model: 'chat' }), expect.any(Function), expect.any(Function))
  expect(wrapper.vm.assistant.chat.uuid).toBe(uuid)
  expect(wrapper.vm.assistant.chat.chatAgent).toBeUndefined()
  prompt.mockRestore()
})

test.each(['native', 'hermes'] as const)('removing a screenshot keeps the %s chat draft and configuration', async kind => {
  const agent = kind === 'native'
    ? { id: 'draft-agent', name: 'Native', kind, native: { engine: 'mock', model: 'vision', tools: [] } }
    : { id: 'draft-agent', name: 'Hermes', kind, binding: { kind, connectionId: 'local', profile: 'research' } }
  vi.mocked(window.api.chatAgents.list).mockResolvedValueOnce([agent])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValueOnce({ compact: true, capturing: false, busy: false, image: 'data:image/png;base64,aGVsbG8=' })
  const wrapper = mount(ChatScreen, { ...stubTeleport }); await flushPromises()
  const picker = wrapper.find('.chat-agent-picker')
  await picker.find('select').setValue(agent.id)
  await flushPromises()
  const uuid = wrapper.vm.assistant.chat.uuid
  await wrapper.find(kind === 'hermes' ? '.runtime-chat textarea' : '.prompt textarea').setValue('Keep my question')
  await wrapper.find('button[aria-label="chatAgent.removeScreenshot"]').trigger('click'); await flushPromises()
  expect(picker.find('img').exists()).toBe(false)
  expect(wrapper.vm.assistant.chat.uuid).toBe(uuid)
  expect(wrapper.vm.assistant.chat.chatAgent).toEqual(agent)
  if (kind === 'hermes') expect(wrapper.find('.runtime-chat textarea').element.value).toBe('Keep my question')
  else expect(wrapper.find('.prompt textarea').element.value).toBe('Keep my question')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('Registers window API event listeners', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Verify event listeners were registered
  expect(window.api._on).toHaveBeenCalledWith('new-chat', expect.any(Function))
  expect(window.api._on).toHaveBeenCalledWith('delete-chat', expect.any(Function))
  expect(window.api._on).toHaveBeenCalledWith('computer-stop', expect.any(Function))
})

test('Intercepts #settings link clicks', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Create a fake link element
  const link = document.createElement('a')
  link.setAttribute('href', '#settings_models_openai')
  document.body.appendChild(link)

  // Create and dispatch click event
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true
  })
  Object.defineProperty(clickEvent, 'target', { value: link, enumerable: true })

  link.dispatchEvent(clickEvent)
  await wrapper.vm.$nextTick()

  // Should have called window.api.settings.open
  expect(window.api.settings.open).toHaveBeenCalledWith({
    initialTab: 'models',
    engine: 'openai'
  })

  // Clean up
  document.body.removeChild(link)
})

test('Intercepts #retry_without_plugins link and disables tools', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Set up a chat with tools enabled
  wrapper.vm.assistant.chat.tools = ['search']

  // Spy on disableTools
  const disableToolsSpy = vi.spyOn(wrapper.vm.assistant.chat, 'disableTools')

  // Create a fake link element
  const link = document.createElement('a')
  link.setAttribute('href', '#retry_without_plugins')
  document.body.appendChild(link)

  // Create and dispatch click event
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true
  })
  Object.defineProperty(clickEvent, 'target', { value: link, enumerable: true })

  link.dispatchEvent(clickEvent)
  await wrapper.vm.$nextTick()

  // Should have called disableTools
  expect(disableToolsSpy).toHaveBeenCalled()

  // Clean up
  document.body.removeChild(link)
})

test('Intercepts #retry_without_params link and clears modelOpts', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Set up a chat with model opts
  wrapper.vm.assistant.chat.modelOpts = { temperature: 0.5 }

  // Create a fake link element
  const link = document.createElement('a')
  link.setAttribute('href', '#retry_without_params')
  document.body.appendChild(link)

  // Create and dispatch click event
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true
  })
  Object.defineProperty(clickEvent, 'target', { value: link, enumerable: true })

  link.dispatchEvent(clickEvent)
  await wrapper.vm.$nextTick()

  // Should have cleared model opts
  expect(wrapper.vm.assistant.chat.modelOpts).toBeUndefined()

  // Clean up
  document.body.removeChild(link)
})

test('onNewChat initializes a new chat', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Add some messages to current chat
  wrapper.vm.assistant.chat.addMessage({ role: 'user', content: 'test' })
  expect(wrapper.vm.assistant.chat.messages.length).toBeGreaterThan(0)

  // Call onNewChat
  await wrapper.vm.newChat()

  // Should have a fresh chat
  expect(wrapper.vm.assistant.chat.messages).toHaveLength(0)
})

test('onNewChat respects the incognito default', async () => {
  store.config.chatHistory.incognito = true
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.newChat()

  expect(wrapper.vm.assistant.chat.temporary).toBe(true)
  expect(wrapper.find('.incognito-badge').exists()).toBe(true)
})

test('onNewChat with payload sets prompt', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Spy on chatArea methods
  const setPromptSpy = vi.spyOn(wrapper.vm.chatArea, 'setPrompt')

  await wrapper.vm.newChat({ prompt: 'test prompt' })

  expect(setPromptSpy).toHaveBeenCalledWith('test prompt')
})

test('onStopGeneration aborts the controller', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Get the active session and set up an abort controller
  const session = wrapper.vm.activeSession
  session.abortController = new AbortController()
  const abortSpy = vi.spyOn(session.abortController, 'abort')

  // Trigger stop
  await wrapper.vm.onStopGeneration()

  expect(abortSpy).toHaveBeenCalled()
})

test('onToggleSidebar calls sidebar hide when visible', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Make sidebar visible first
  wrapper.vm.sidebar.show()
  await wrapper.vm.$nextTick()

  const hideSpy = vi.spyOn(wrapper.vm.sidebar, 'hide')

  // Toggle should hide
  wrapper.vm.onToggleSidebar()

  expect(hideSpy).toHaveBeenCalled()
})

test('onToggleSidebar calls sidebar show when hidden', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Hide sidebar first
  wrapper.vm.sidebar.hide()
  await wrapper.vm.$nextTick()

  const showSpy = vi.spyOn(wrapper.vm.sidebar, 'show')

  // Toggle should show
  wrapper.vm.onToggleSidebar()

  expect(showSpy).toHaveBeenCalled()
})

test('onRenameChat shows dialog and updates title', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const chat = wrapper.vm.assistant.chat
  chat.title = 'Old Title'

  // Mock Dialog.show to return new title
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ value: 'New Title', isConfirmed: true, isDenied: false, isDismissed: false })

  await wrapper.vm.onRenameChat(chat)

  expect(chat.title).toBe('New Title')
})

test('onRenameChat does nothing when cancelled', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const chat = wrapper.vm.assistant.chat
  chat.title = 'Old Title'

  // Mock Dialog.show to return cancelled
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ value: null, isConfirmed: false, isDenied: false, isDismissed: true })

  await wrapper.vm.onRenameChat(chat)

  expect(chat.title).toBe('Old Title')
})

test('onDeleteChat shows confirmation dialog', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Mock Dialog.show to cancel
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true, value: null })

  await wrapper.vm.onDeleteChat('chat-id')

  expect(Dialog.show).toHaveBeenCalledWith(expect.objectContaining({
    showCancelButton: true
  }))
})

test('onRenameFolder shows dialog and updates name', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Setup folder in store
  store.history.folders = [{ id: 'folder1', name: 'Old Name', chats: [] }]

  // Mock Dialog.show
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ value: 'New Name', isConfirmed: true, isDenied: false, isDismissed: false })

  await wrapper.vm.onRenameFolder('folder1')

  expect(store.history.folders[0].name).toBe('New Name')
})

test('onDeleteFolder shows dialog with options', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Setup folder in store
  store.history.folders = [{ id: 'folder1', name: 'Test Folder', chats: ['chat1'] }]

  // Mock Dialog.show to dismiss
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true, value: null })

  await wrapper.vm.onDeleteFolder('folder1')

  expect(Dialog.show).toHaveBeenCalledWith(expect.objectContaining({
    showDenyButton: true,
    showCancelButton: true
  }))

  // Folder should still exist (user dismissed)
  expect(store.history.folders).toHaveLength(1)
})

test('onDeleteFolder confirms and keeps conversations', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Setup folder in store with a chat
  store.history.folders = [{ id: 'folder1', name: 'Test Folder', chats: ['chat1'] }]

  // Mock Dialog.show to confirm (keep conversations)
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false, value: null })

  await wrapper.vm.onDeleteFolder('folder1')

  // Folder should be deleted
  expect(store.history.folders).toHaveLength(0)
})

test('onDeleteFolder denies and deletes conversations', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Setup folder in store with a chat
  store.history.folders = [{ id: 'folder1', name: 'Test Folder', chats: ['chat1'] }]
  store.history.chats = [{ uuid: 'chat1', delete: vi.fn() } as any]

  // Mock Dialog.show to deny (delete conversations)
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ isConfirmed: false, isDenied: true, isDismissed: false, value: null })

  await wrapper.vm.onDeleteFolder('folder1')

  // Folder should be deleted
  expect(store.history.folders).toHaveLength(0)
  // Chat should also be deleted
  expect(store.history.chats).toHaveLength(0)
})

test('importChat adds chat to history', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const initialChatCount = store.history.chats.length

  // Import a chat
  wrapper.vm.importChat({
    uuid: 'imported-chat',
    title: 'Imported Chat',
    messages: []
  })

  expect(store.history.chats.length).toBe(initialChatCount + 1)
})

test('onMoveChat shows folder selection dialog', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Setup folders
  store.history.folders = [
    { id: 'folder1', name: 'Folder 1', chats: ['chat1'] },
    { id: 'folder2', name: 'Folder 2', chats: [] }
  ]

  // Mock Dialog.show to dismiss
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ value: null, isConfirmed: false, isDenied: false, isDismissed: true })

  await wrapper.vm.onMoveChat('chat1')

  expect(Dialog.show).toHaveBeenCalledWith(expect.objectContaining({
    input: 'select'
  }))
})

test('onForkChat sets up editor and shows it', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Spy on chatEditor.show
  const showSpy = vi.spyOn(wrapper.vm.chatEditor, 'show')

  const message = { uuid: 'msg1', role: 'assistant', content: 'test' }
  wrapper.vm.onForkChat(message)

  expect(wrapper.vm.chatEditorTitle).toBe('chat.fork.title')
  expect(wrapper.vm.chatEditorConfirmButtonText).toBe('common.fork')
  expect(showSpy).toHaveBeenCalled()
})

test('onDeleteMessage shows confirmation dialog', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const message = { uuid: 'msg1', role: 'assistant', content: 'test', delete: vi.fn() }

  // Mock Dialog.show to cancel
  const Dialog = (await import('@renderer/utils/dialog')).default
  vi.mocked(Dialog.show).mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true, value: null })

  await wrapper.vm.onDeleteMessage(message)

  expect(Dialog.show).toHaveBeenCalledWith(expect.objectContaining({
    showCancelButton: true
  }))
})

// Parallel sessions tests

test('Creates session on mount', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Should have an active session
  expect(wrapper.vm.activeSessionId).not.toBeNull()
  expect(wrapper.vm.activeSession).not.toBeNull()
  expect(wrapper.vm.activeSession.status).toBe('idle')
})

test('Creates new session on new chat', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const firstSessionId = wrapper.vm.activeSessionId

  // Create new chat
  await wrapper.vm.newChat()

  // Should have a different session
  expect(wrapper.vm.activeSessionId).not.toBe(firstSessionId)
  expect(wrapper.vm.activeSession).not.toBeNull()
})

test('Switches session on select chat', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const firstSessionId = wrapper.vm.activeSessionId

  // Create another chat and select it
  const newChat = new ChatModel()
  wrapper.vm.onSelectChat(newChat)
  await wrapper.vm.$nextTick()

  // Should switch to new session
  expect(wrapper.vm.activeSessionId).toBe(newChat.uuid)
  expect(wrapper.vm.activeSessionId).not.toBe(firstSessionId)
})

test('Cleans up idle session when switching', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const firstSessionId = wrapper.vm.activeSessionId

  // Switch to another chat
  const newChat = new ChatModel()
  wrapper.vm.onSelectChat(newChat)
  await wrapper.vm.$nextTick()

  // Old idle session should be cleaned up
  expect(wrapper.vm.sessions[firstSessionId]).toBeUndefined()
})

test('generatingChatIds returns empty when only active session is generating', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  // Set active session to generating
  wrapper.vm.activeSession.status = 'generating'

  // Should return empty array (user already sees streaming)
  expect(wrapper.vm.generatingChatIds).toEqual([])
})

test('generatingChatIds returns ids when background session is generating', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const firstSessionId = wrapper.vm.activeSessionId

  // Set first session to generating
  wrapper.vm.sessions[firstSessionId].status = 'generating'

  // Create new chat (switch away)
  await wrapper.vm.newChat()

  // First session should now show in generatingChatIds
  expect(wrapper.vm.generatingChatIds).toContain(firstSessionId)
})

test('setSessionStatus updates session status', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const sessionId = wrapper.vm.activeSessionId

  wrapper.vm.setSessionStatus(sessionId, 'generating')
  expect(wrapper.vm.sessions[sessionId].status).toBe('generating')

  wrapper.vm.setSessionStatus(sessionId, 'idle')
  expect(wrapper.vm.sessions[sessionId].status).toBe('idle')
})

test('cleanupSession aborts and removes session', async () => {
  const wrapper: VueWrapper<any> = mount(ChatScreen, { ...stubTeleport })
  await wrapper.vm.$nextTick()

  const sessionId = wrapper.vm.activeSessionId
  const session = wrapper.vm.sessions[sessionId]

  // Set up abort controller
  session.abortController = new AbortController()
  const abortSpy = vi.spyOn(session.abortController, 'abort')

  // Cleanup
  wrapper.vm.cleanupSession(sessionId)

  expect(abortSpy).toHaveBeenCalled()
  expect(wrapper.vm.sessions[sessionId]).toBeUndefined()
})

test.each(['screenshot', 'text'])('Plus menu starts the existing %s context flow', async (kind) => {
  const wrapper = mount(ChatScreen, { ...stubTeleport })
  await flushPromises()
  await wrapper.find('.prompt-menu').trigger('click')
  await wrapper.find(`.context-${kind}`).trigger('click')
  await flushPromises()
  if (kind === 'screenshot') {
    expect(window.api.chatAgents.capture).toHaveBeenCalledWith()
  } else {
    expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ manualText: true })
  }
})


test('Runtime switch keeps configuration dropdowns inside the active chat composer', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'h', kind: 'hermes', name: 'Local Hermes', endpoint: 'http://localhost:8642' }])
  const wrapper = mount(ChatScreen, { ...stubTeleport })
  await flushPromises()
  await wrapper.find('.prompt .chat-configuration select').setValue('h')
  await flushPromises()
  expect(wrapper.find('.prompt').exists()).toBe(false)
  const controls = wrapper.find('.runtime-composer .chat-configuration')
  expect(controls.findAll('select')).toHaveLength(3)
  expect(wrapper.findAll('.chat-configuration')).toHaveLength(1)
  await controls.find('select').setValue('native')
  await flushPromises()
  expect(wrapper.findAll('.prompt .chat-configuration select')).toHaveLength(3)
})

test.each(['hermes', 'opencode'] as const)('%s model changes preserve an unsent draft and use a new conversation', async kind => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'runtime', kind, name: 'Local', endpoint: 'http://localhost:8642' }])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: [], models: [{ provider: 'p', id: 'm1', name: 'M1' }, { provider: 'p', id: 'm2', name: 'M2' }] })
  const wrapper = mount(ChatScreen, { ...stubTeleport }); await flushPromises()
  await wrapper.find('.prompt .chat-configuration select').setValue('runtime'); await flushPromises()
  await wrapper.find('.runtime-chat textarea').setValue('Keep this draft')
  const previous = wrapper.vm.assistant.chat
  await wrapper.find('.runtime-composer .chat-configuration').findAll('select')[1].setValue('p'); await flushPromises()
  expect(wrapper.find<HTMLTextAreaElement>('.runtime-chat textarea').element.value).toBe('Keep this draft')
  expect(wrapper.vm.assistant.chat.uuid).not.toBe(previous.uuid)
  expect(wrapper.vm.assistant.chat.runtime).toMatchObject({ provider: 'p', model: 'm1' })
  await wrapper.find('.runtime-composer .chat-configuration').findAll('select')[2].setValue('m2'); await flushPromises()
  expect(wrapper.find<HTMLTextAreaElement>('.runtime-chat textarea').element.value).toBe('Keep this draft')
  expect(wrapper.vm.assistant.chat.runtime?.model).toBe('m2')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})


test.each(['chat', 'task'] as const)('no-context %s workflow sends plain instructions and follows its interaction mode', async workflowMode => {
  const agent = { id: 'plain', name: 'Plain task', kind: 'native' as const, native: { engine: 'mock', model: 'chat', tools: [] } }
  vi.mocked(window.api.chatAgents.list).mockResolvedValueOnce([agent])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValueOnce({ compact: true, capturing: false, busy: false, contextKind: 'none', workflowName: 'Checklist', requestId: 'plain', agentId: agent.id, prompt: 'Write a checklist', workflowMode })
  const prompt = vi.spyOn(Assistant.prototype, 'prompt').mockResolvedValue('success')
  const wrapper = mount(ChatScreen, { ...stubTeleport }); await flushPromises()
  expect(prompt).not.toHaveBeenCalled()
  expect(wrapper.find('.prompt textarea').exists()).toBe(workflowMode === 'chat')
  if (workflowMode === 'task') await wrapper.find('.background-task-launcher textarea').trigger('keydown', { key: 'Enter' })
  else await wrapper.find('.prompt textarea').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(prompt).toHaveBeenCalledWith('Write a checklist', expect.objectContaining({ attachments: [] }), expect.any(Function), expect.any(Function))
  if (workflowMode === 'task') expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ hide: true })
  else expect(window.api.chatAgents.screenshotUpdate).not.toHaveBeenCalledWith({ hide: true })
  prompt.mockRestore()
})

test('each workflow creates a fresh main chat even without an Agent and does not auto-submit', async () => {
  const wrapper = mount(ChatScreen, { ...stubTeleport }); await flushPromises()
  const previous = wrapper.vm.assistant.chat.uuid
  const listener = vi.mocked(window.api._on).mock.calls.find(([signal]) => signal === 'screenshot-state')[1]
  listener({ compact: false, capturing: false, busy: false, contextKind: 'none', workflowMode: 'chat', workflowName: 'Checklist', requestId: 'one', prompt: 'Make a checklist' }); await flushPromises()
  const first = wrapper.vm.assistant.chat.uuid
  expect(first).not.toBe(previous)
  expect(wrapper.find('.prompt textarea').element.value).toBe('Make a checklist')
  expect(wrapper.find('.chat').classes()).not.toContain('task-launcher')
  expect(wrapper.find('.chat-agent-picker form').exists()).toBe(false)
  listener({ compact: false, capturing: false, busy: false, contextKind: 'selected-text', workflowMode: 'chat', workflowName: 'Translate', requestId: 'two', prompt: 'Translate', contextText: 'Selected sentence' }); await flushPromises()
  expect(wrapper.vm.assistant.chat.uuid).not.toBe(first)
  expect(wrapper.find('.prompt textarea').element.value).toBe('Translate\n\nSelected sentence')
  expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ dismiss: true })
  listener({ compact: false, capturing: false, busy: false, contextKind: 'none', workflowMode: 'chat', workflowName: 'Blank', requestId: 'three', prompt: '' }); await flushPromises()
  expect(wrapper.find('.prompt textarea').element.value).toBe('')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('a screenshot uses the regular main composer, retakes in the same chat and removes without clearing the draft', async () => {
  const wrapper = mount(ChatScreen, { ...stubTeleport }); await flushPromises()
  const listener = vi.mocked(window.api._on).mock.calls.find(([signal]) => signal === 'screenshot-state')[1]
  const state = { compact: false, capturing: false, busy: false, contextKind: 'screenshot', workflowMode: 'chat', workflowName: 'Screenshot', requestId: 'first', image: 'data:image/png;base64,first', prompt: 'Explain' }
  listener(state); await flushPromises()
  const id = wrapper.vm.assistant.chat.uuid
  expect(wrapper.find('.prompt .context-screenshot img').attributes('src')).toBe(state.image)
  await wrapper.find('.prompt textarea').setValue('Edited question')
  await wrapper.find('button[aria-label="chatAgent.retake"]').trigger('click'); await flushPromises()
  expect(window.api.chatAgents.capture).toHaveBeenCalled()
  listener({ ...state, requestId: 'second', image: 'data:image/png;base64,second' }); await flushPromises()
  expect(wrapper.vm.assistant.chat.uuid).toBe(id)
  expect(wrapper.find('.prompt textarea').element.value).toBe('Edited question')
  expect(wrapper.find('.prompt .context-screenshot img').attributes('src')).toBe('data:image/png;base64,second')
  await wrapper.find('button[aria-label="chatAgent.removeScreenshot"]').trigger('click')
  expect(wrapper.find('.prompt .context-screenshot').exists()).toBe(false)
  expect(wrapper.find('.prompt textarea').element.value).toBe('Edited question')
})
