import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SettingsChat from '@renderer/settings/SettingsChat.vue'
import { store } from '@services/store'
import { useWindowMock } from '@tests/mocks/window'

const agents = [
  { id: 'h', name: 'Research with a long agent name', kind: 'hermes' as const, binding: { kind: 'hermes' as const, connectionId: 'local' } },
  { id: 'n', name: 'Native writer', kind: 'native' as const, native: { engine: 'mock', model: 'chat', tools: [] } },
]
enableAutoUnmount(afterEach)
beforeEach(() => {
  useWindowMock(); store.loadSettings()
  vi.mocked(window.api.chatAgents.list).mockResolvedValue(agents)
})
const open = async () => {
  const wrapper = mount(SettingsChat, { global: { stubs: { MessageItem: true } } })
  wrapper.vm.load(); await flushPromises()
  return wrapper
}

test('saving and clearing the default persists independently of appearance and agent definitions', async () => {
  const wrapper = await open()
  const save = vi.spyOn(store, 'saveSettings')
  const select = wrapper.find('.quick-chat-settings select')
  await select.setValue('h')
  expect(store.config.prompt.defaultAgentId).toBe('h')
  expect(select.attributes('title')).toBe(agents[0].name)
  expect(save).toHaveBeenCalledOnce()
  wrapper.vm.load(); await flushPromises()
  expect(select.element.value).toBe('h')
  await wrapper.find('.form-field.theme select').setValue('conversation')
  expect(store.config.prompt.defaultAgentId).toBe('h')
  await select.setValue('')
  expect(store.config.prompt.defaultAgentId).toBe('')
  expect(window.api.chatAgents.save).not.toHaveBeenCalled()
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  await wrapper.find('.quick-chat-settings button').trigger('click')
  expect(window.api.settings.open).toHaveBeenCalledWith({ initialTab: 'chatagents' })
  save.mockRestore()
})

test('a missing saved default is labelled and can be replaced without a silent settings rewrite', async () => {
  store.config.prompt.defaultAgentId = 'removed'
  const wrapper = await open()
  const select = wrapper.find('.quick-chat-settings select')
  expect(select.find('option[value="removed"]').text()).toBe('quickChat.missingDefault')
  expect(select.element.value).toBe('removed')
  await select.setValue('n')
  expect(store.config.prompt.defaultAgentId).toBe('n')
})

test('empty and failed lists remain explained and do not erase the preference', async () => {
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([])
  const wrapper = await open()
  expect(wrapper.findAll('.quick-chat-settings option')).toHaveLength(1)
  store.config.prompt.defaultAgentId = 'h'
  vi.mocked(window.api.chatAgents.list).mockRejectedValueOnce(new Error('List unavailable'))
  wrapper.vm.load(); await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toContain('List unavailable')
  expect(wrapper.find('.quick-chat-settings select').attributes('disabled')).toBeDefined()
  expect(store.config.prompt.defaultAgentId).toBe('h')
  vi.mocked(window.api.chatAgents.list).mockResolvedValue(agents)
  await wrapper.find('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.find('.quick-chat-settings select').element.value).toBe('h')
})
