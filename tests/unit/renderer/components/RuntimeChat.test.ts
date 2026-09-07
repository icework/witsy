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
  await agent.setValue('plan')
  await wrapper.findAll('button').find(b => b.text() === 'runtime.useTarget')!.trigger('click')
  await flushPromises()
  expect(wrapper.emitted('bind')?.[0][0]).toMatchObject({ connectionId: 'o', agent: 'plan', kind: 'opencode' })
  expect((wrapper.emitted('bind')?.[0][0] as any).sessionId).toBeUndefined()
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
