import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SettingsChatAgents from '@renderer/settings/SettingsChatAgents.vue'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'
import { emitBusEventMock } from '../../../../vitest.setup'
const agents = [{ id: 'h', name: 'Research', kind: 'hermes' as const, binding: { kind: 'hermes' as const, connectionId: 'local', profile: 'research' } }]
enableAutoUnmount(afterEach)
beforeEach(() => {
  useWindowMock(); store.loadSettings(); store.loadHistory(); emitBusEventMock.mockClear()
  vi.mocked(window.api.chatAgents.list).mockResolvedValue(agents)
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'local', name: 'Local', kind: 'hermes', endpoint: 'http://localhost:8642' }])
})

test('selects existing agents from the left and saves edits without starting a chat', async () => {
  const wrapper = mount(SettingsChatAgents)
  await wrapper.vm.load(); await flushPromises()
  expect(wrapper.find('.md-master').text()).toContain('Research')
  expect(wrapper.find('.md-detail input').element.value).toBe('Research')
  await wrapper.find('.md-detail input').setValue('Research updated')
  expect(wrapper.find('.md-master').text()).not.toContain('updated')
  const saved = { ...agents[0], name: 'Research updated' }
  vi.mocked(window.api.chatAgents.save).mockResolvedValue(saved)
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([saved])
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('.md-master').text()).toContain('Research updated')
  expect(window.api.chatAgents.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'h', name: 'Research updated' }))
  expect(emitBusEventMock).toHaveBeenCalledWith('chat-agent-settings-changed')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('chatAgent.shortcut')
})

test('plus starts an empty draft, and Save creates a separate Agent', async () => {
  const wrapper = mount(SettingsChatAgents)
  await wrapper.vm.load(); await flushPromises()
  await wrapper.find('button[aria-label="chatAgent.newAgent"]').trigger('click'); await flushPromises()
  expect(wrapper.find('.md-detail input').element.value).toBe('')
  expect(window.api.chatAgents.save).not.toHaveBeenCalled()
  await wrapper.find('.md-detail input').setValue('New research')
  await wrapper.find('.md-detail select').setValue('hermes')
  await wrapper.findAll('.md-detail select')[1].setValue('local'); await flushPromises()
  const saved = { ...agents[0], id: 'h2', name: 'New research' }
  vi.mocked(window.api.chatAgents.save).mockResolvedValue(saved)
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([...agents, saved])
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenCalledWith(expect.objectContaining({ id: '', name: 'New research' }))
  expect(wrapper.findAll('.md-master-list-item')).toHaveLength(2)
})
