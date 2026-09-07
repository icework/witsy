import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RuntimeChat from '@components/RuntimeChat.vue'
import Chat from '@models/chat'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'

enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock(); store.loadSettings(); store.loadHistory() })
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
