import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RuntimeChat from '@components/RuntimeChat.vue'
import Chat from '@models/chat'
import Message from '@models/message'
import LlmUtils from '@services/llm_utils'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'
import { RuntimeKind, RuntimeRun } from '@/types/runtime'

enableAutoUnmount(afterEach)
beforeEach(() => {
  useWindowMock(); store.loadSettings(); store.loadHistory()
  vi.spyOn(LlmUtils.prototype, 'getTitle').mockResolvedValue('Conversation summary')
})
afterEach(() => { vi.restoreAllMocks() })
test('connects to a selected OpenCode agent and emits a new binding without a remote session', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'o', kind: 'opencode', name: 'Local OpenCode', endpoint: 'http://localhost:4096' }])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: ['build', 'plan'], models: [] })
  const wrapper = mount(RuntimeChat, { props: { chat: new Chat(), configuration: true } })
  await flushPromises()
  await wrapper.find('select').setValue('o')
  await flushPromises()
  const agent = wrapper.findAll('select').find(s => s.text().includes('build'))!
  expect(agent.element.selectedOptions[0].textContent).toBe('runtime.inherit')
  await agent.setValue('plan')
  await wrapper.findAll('button').find(b => b.text() === 'runtime.useTarget')!.trigger('click')
  await flushPromises()
  expect(wrapper.emitted('bind')?.[0][0]).toMatchObject({ connectionId: 'o', agent: 'plan', kind: 'opencode' })
  expect((wrapper.emitted('bind')?.[0][0] as any).sessionId).toBeUndefined()
  await agent.setValue('')
  await wrapper.findAll('button').find(b => b.text() === 'runtime.useTarget')!.trigger('click')
  await flushPromises()
  expect((wrapper.emitted('bind')?.[1][0] as any).agent).toBeUndefined()
  expect(agent.element.selectedOptions[0].textContent).toBe('runtime.inherit')
})
test('sends through runtime IPC without a Native provider and does not save a temporary chat', async () => {
  const chat = new Chat(); chat.temporary = true; chat.runtime = { connectionId: 'h', kind: 'hermes', profile: 'research', sessionId: 'prior' }
  vi.mocked(window.api.runtime.start).mockResolvedValue({ chatId: chat.uuid, id: 'run', binding: chat.runtime, status: 'completed', text: 'hello back', detail: '' })
  const save = vi.spyOn(store, 'saveHistory')
  const wrapper = mount(RuntimeChat, { props: { chat } })
  await flushPromises()
  await wrapper.find('textarea').setValue('hello')
  await wrapper.findAll('form').at(-1)!.trigger('submit')
  await flushPromises()
  expect(window.api.runtime.start).toHaveBeenCalledWith(chat.uuid, expect.objectContaining({ profile: 'research', sessionId: 'prior' }), 'hello')
  expect(chat.lastMessage().content).toBe('hello back')
  expect(chat.title).toBe('Conversation summary')
  expect(save).not.toHaveBeenCalled()
  save.mockRestore()
})

test('settings can configure a new target without exposing a composer or changing the existing chat', async () => {
  const chat = new Chat(); chat.runtime = { connectionId: 'h', kind: 'hermes', profile: 'default' }
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'h', kind: 'hermes', name: 'Hermes', endpoint: 'http://localhost:8642' }, { id: 'o', kind: 'opencode', name: 'OpenCode', endpoint: 'http://localhost:4096' }])
  const wrapper = mount(RuntimeChat, { props: { chat, configuration: true } })
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  await wrapper.find('select').setValue('o')
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(chat.runtime.kind).toBe('hermes')
})


test('external runtime composer offers context attachments without submitting a run', async () => {
  const chat = new Chat(); chat.runtime = { connectionId: 'h', kind: 'hermes', profile: 'default' }
  const wrapper = mount(RuntimeChat, { props: { chat }, attachTo: document.body })
  await flushPromises()
  await wrapper.find('.runtime-context').trigger('click'); await flushPromises()
  const item = document.querySelector('.context-text') as HTMLElement
  expect(item).not.toBeNull()
  item.click(); await flushPromises()
  expect(wrapper.emitted('contextRequested')?.[0]).toEqual(['text'])
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('new connection opens an editable draft and Cancel leaves saved connections alone', async () => {
  const wrapper = mount(RuntimeChat, { props: { chat: new Chat(), configuration: true } })
  await flushPromises()
  expect(wrapper.findAll('button').find(button => button.text() === 'agentDesign.editConnection')?.attributes('disabled')).toBeDefined()
  await wrapper.findAll('button').find(button => button.text() === 'runtime.add')!.trigger('click')
  const form = wrapper.find('form')
  expect(form.exists()).toBe(true)
  await form.findAll('input')[0].setValue('Draft connection')
  await form.findAll('button').find(button => button.text() === 'common.cancel')!.trigger('click')
  expect(wrapper.find('form').exists()).toBe(false)
  expect(window.api.runtime.save).not.toHaveBeenCalled()
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('saving an existing connection retains its selectable providers and models', async () => {
  const connection = { id: 'h', kind: 'hermes' as const, name: 'Hermes', endpoint: 'http://localhost:8642', defaultProfile: 'default' }
  vi.mocked(window.api.runtime.list).mockResolvedValue([connection])
  vi.mocked(window.api.runtime.save).mockResolvedValue({ ...connection, name: 'Renamed Hermes' })
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: ['default'], agents: [], providers: [{ id: 'go', name: 'Go' }], models: [{ provider: 'go', id: 'luna', name: 'Luna' }], defaults: { provider: 'go', model: 'luna' } })
  const wrapper = mount(RuntimeChat, { props: { chat: new Chat(), configuration: true } })
  await flushPromises()
  await wrapper.find('select').setValue('h')
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'agentDesign.editConnection')!.trigger('click')
  const form = wrapper.find('form')
  await form.findAll('input')[0].setValue('Renamed Hermes')
  await form.trigger('submit')
  await flushPromises()
  expect(wrapper.find('.runtime-model-picker select[aria-label="chatAgent.provider"]').text()).toContain('Go')
  expect(wrapper.find('.runtime-model-picker select[aria-label="runtime.model"]').text()).toContain('Luna')
  expect(wrapper.find('form').exists()).toBe(false)
})

const runtimeChat = (kind: RuntimeKind = 'hermes') => {
  const chat = new Chat()
  chat.runtime = { connectionId: 'runtime', kind }
  return chat
}
const runtimeRun = (chat: Chat, status: RuntimeRun['status'] = 'completed'): RuntimeRun => ({
  chatId: chat.uuid, id: `run-${chat.uuid}`, binding: { ...chat.runtime! }, status,
  text: status === 'completed' ? 'A useful answer to the question.' : '', detail: '',
})
const sendRuntimeMessage = async (chat: Chat, text = 'Please explain this topic in detail.') => {
  const wrapper = mount(RuntimeChat, { props: { chat } })
  await flushPromises()
  await wrapper.find('textarea').setValue(text)
  await wrapper.findAll('form').at(-1)!.trigger('submit')
  await flushPromises()
  return wrapper
}
const publishRun = (run: RuntimeRun) => {
  for (const [signal, listener] of vi.mocked(window.api._on).mock.calls) {
    if (signal === 'runtime-run') listener(run)
  }
}

test.each(['hermes', 'opencode'] as const)('%s replaces the initial title with a saved conversation summary', async kind => {
  const chat = runtimeChat(kind)
  chat.initTitle()
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat))
  await sendRuntimeMessage(chat)
  expect(LlmUtils.prototype.getTitle).toHaveBeenCalledWith(chat.messages)
  expect(chat.title).toBe('Conversation summary')
  expect(chat.titleSource).toBe('generated')
  expect(store.history.chats.find(saved => saved.uuid === chat.uuid)?.title).toBe('Conversation summary')
  expect(window.api.history.save).toHaveBeenLastCalledWith(store.config.workspaceId, expect.objectContaining({
    chats: expect.arrayContaining([expect.objectContaining({ uuid: chat.uuid, title: 'Conversation summary', titleSource: 'generated' })]),
  }))
})

test('summary generation stays asynchronous and repeated completed events reuse the pending request', async () => {
  const chat = runtimeChat()
  let finish!: (title: string) => void
  vi.mocked(LlmUtils.prototype.getTitle).mockReturnValue(new Promise(resolve => { finish = resolve }))
  const completed = runtimeRun(chat)
  vi.mocked(window.api.runtime.start).mockResolvedValue(completed)
  const wrapper = await sendRuntimeMessage(chat)
  expect(chat.title).toBe('Please explain this topic in detail.')
  expect(chat.lastMessage().content).toBe(completed.text)
  expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
  publishRun(completed)
  publishRun(completed)
  await flushPromises()
  expect(LlmUtils.prototype.getTitle).toHaveBeenCalledTimes(1)
  finish('A short summary')
  await flushPromises()
  expect(chat.title).toBe('A short summary')
  publishRun(completed)
  await flushPromises()
  expect(LlmUtils.prototype.getTitle).toHaveBeenCalledTimes(1)
})

test('a pending summary updates its original conversation after switching chats', async () => {
  const original = runtimeChat()
  let finish!: (title: string) => void
  vi.mocked(LlmUtils.prototype.getTitle).mockReturnValue(new Promise(resolve => { finish = resolve }))
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(original))
  const wrapper = await sendRuntimeMessage(original)
  const selected = runtimeChat('opencode')
  selected.title = 'Another conversation'
  await wrapper.setProps({ chat: selected })
  await flushPromises()
  finish('Original conversation summary')
  await flushPromises()
  expect(original.title).toBe('Original conversation summary')
  expect(selected.title).toBe('Another conversation')
  expect(store.history.chats.find(chat => chat.uuid === original.uuid)?.title).toBe('Original conversation summary')
})

test('a manual rename made while a summary is pending is preserved', async () => {
  const chat = runtimeChat()
  let finish!: (title: string) => void
  vi.mocked(LlmUtils.prototype.getTitle).mockReturnValue(new Promise(resolve => { finish = resolve }))
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat))
  await sendRuntimeMessage(chat)
  chat.title = 'My chosen title'
  chat.titleSource = 'manual'
  finish('Generated title')
  await flushPromises()
  expect(chat.title).toBe('My chosen title')
  expect(chat.titleSource).toBe('manual')
})

test('sending a runtime message preserves an explicitly named New Chat title', async () => {
  const chat = runtimeChat()
  chat.title = 'New Chat'
  chat.titleSource = 'manual'
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat))
  await sendRuntimeMessage(chat)
  expect(chat.title).toBe('New Chat')
  expect(LlmUtils.prototype.getTitle).not.toHaveBeenCalled()
})

test('summary failure leaves the prompt title and completed answer usable', async () => {
  const chat = runtimeChat()
  vi.mocked(LlmUtils.prototype.getTitle).mockRejectedValue(new Error('Title generation unavailable'))
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat))
  const wrapper = await sendRuntimeMessage(chat)
  expect(chat.title).toBe('Please explain this topic in detail.')
  expect(chat.titleSource).toBeUndefined()
  expect(chat.lastMessage().content).toBe('A useful answer to the question.')
  expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
  expect(wrapper.text()).not.toContain('Title generation unavailable')
})

test.each(['running', 'waiting', 'failed', 'cancelled'] as const)('a %s runtime run does not start title generation', async status => {
  const chat = runtimeChat()
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat, status))
  await sendRuntimeMessage(chat)
  expect(LlmUtils.prototype.getTitle).not.toHaveBeenCalled()
})

test('finishing a title request does not restore a deleted conversation', async () => {
  const chat = runtimeChat()
  let finish!: (title: string) => void
  vi.mocked(LlmUtils.prototype.getTitle).mockReturnValue(new Promise(resolve => { finish = resolve }))
  vi.mocked(window.api.runtime.start).mockResolvedValue(runtimeRun(chat))
  await sendRuntimeMessage(chat)
  store.removeChat(chat)
  const save = vi.spyOn(store, 'saveHistory')
  finish('Deleted conversation summary')
  await flushPromises()
  expect(store.history.chats.some(saved => saved.uuid === chat.uuid)).toBe(false)
  expect(save).not.toHaveBeenCalled()
})

test.each(['hermes', 'opencode'] as const)('opening an old %s conversation upgrades its truncated prompt title', async kind => {
  const chat = runtimeChat(kind)
  const prompt = 'This is an older conversation with a long first message that was previously copied directly into the title.'
  chat.title = prompt.slice(0, 70)
  chat.addMessage(new Message('system', ''))
  chat.addMessage(new Message('user', prompt))
  chat.addMessage(new Message('assistant', 'The original answer.'))
  store.addChat(chat)
  mount(RuntimeChat, { props: { chat } })
  await flushPromises()
  expect(chat.title).toBe('Conversation summary')
  expect(chat.titleSource).toBe('generated')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('opening a conversation with a running snapshot keeps its title until completion', async () => {
  const chat = runtimeChat()
  chat.title = 'An existing question'
  chat.addMessage(new Message('system', ''))
  chat.addMessage(new Message('user', chat.title))
  chat.addMessage(new Message('assistant', 'A partial answer'))
  store.addChat(chat)
  vi.mocked(window.api.runtime.get).mockResolvedValue({ ...runtimeRun(chat, 'running'), text: 'A partial answer' })
  mount(RuntimeChat, { props: { chat } })
  await flushPromises()
  expect(LlmUtils.prototype.getTitle).not.toHaveBeenCalled()
  publishRun(runtimeRun(chat))
  await flushPromises()
  expect(chat.title).toBe('Conversation summary')
})

test.each(['hermes', 'opencode'] as const)('the %s main composer sends its screenshot and consumes it after submission', async kind => {
  const image = 'data:image/png;base64,aGVsbG8='
  const chat = new Chat(); chat.temporary = true; chat.runtime = { kind, connectionId: 'local', provider: 'p', model: 'vision' }
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: [], profiles: [], models: [{ provider: 'p', id: 'vision', name: 'Vision', vision: true }] })
  vi.mocked(window.api.runtime.start).mockResolvedValue({ chatId: chat.uuid, id: 'run', binding: chat.runtime, status: 'completed', text: 'done', detail: '' })
  const wrapper = mount(RuntimeChat, { props: { chat, contextImage: image } }); await flushPromises()
  await wrapper.find('textarea').setValue('Describe the screenshot')
  await wrapper.find('.runtime-composer').trigger('submit'); await flushPromises()
  expect(window.api.runtime.start).toHaveBeenCalledWith(chat.uuid, expect.objectContaining({ kind }), 'Describe the screenshot', [image])
  expect(wrapper.emitted('contextConsumed')?.[0]).toEqual([chat.uuid])
  expect(chat.messages.find(m => m.role === 'user').attachments[0].content).toBe('aGVsbG8=')
})

test('an OpenCode screenshot on a text-only model stays editable and is not submitted', async () => {
  const chat = new Chat(); chat.runtime = { kind: 'opencode', connectionId: 'local', provider: 'p', model: 'text' }
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: [], profiles: [], models: [{ provider: 'p', id: 'text', name: 'Text', vision: false }] })
  const wrapper = mount(RuntimeChat, { props: { chat, contextImage: 'data:image/png;base64,aGVsbG8=' } }); await flushPromises()
  await wrapper.find('textarea').setValue('Describe this')
  await wrapper.find('.runtime-composer').trigger('submit'); await flushPromises()
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(wrapper.find('[role="alert"]').text()).toBe('chatAgent.noVision')
  expect(wrapper.find('textarea').element.value).toBe('Describe this')
  expect(wrapper.emitted('contextConsumed')).toBeUndefined()
})


test('Enter confirms IME composition without sending an external runtime request', async () => {
  const chat = new Chat(); chat.runtime = { connectionId: 'h', kind: 'hermes' }
  const wrapper = mount(RuntimeChat, { props: { chat } })
  await flushPromises()
  const input = wrapper.find('textarea')
  await input.setValue('整理设计规范')
  await input.trigger('keydown', { key: 'Enter', isComposing: true })
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(input.element.value).toBe('整理设计规范')
  await input.trigger('keydown', { key: 'Enter', shiftKey: true })
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})
