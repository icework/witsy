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

test.each(['hermes', 'opencode'] as const)('%s Agent customization uses the visible model list and preserves a hidden saved choice on an unrelated edit', async kind => {
  const agent = { id: 'a', name: 'Existing agent', kind, binding: { kind, connectionId: 'local', provider: 'p', model: 'hidden' } }
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([agent])
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'local', name: 'Local', kind, endpoint: 'http://localhost:4096' }])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: [], profiles: [], models: [{ provider: 'p', id: 'visible', name: 'Visible' }] })
  vi.mocked(window.api.chatAgents.save).mockImplementation(async value => value)
  const wrapper = mount(SettingsChatAgents); await wrapper.vm.load(); await flushPromises()
  const picker = wrapper.find('.runtime-model-picker')
  expect(picker.find('option[value="hidden"]').exists()).toBe(false)
  expect(picker.find('option[value="visible"]').exists()).toBe(true)
  await wrapper.find('.md-detail input').setValue('Renamed agent')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenLastCalledWith(expect.objectContaining({ binding: expect.objectContaining({ model: 'hidden' }) }))
  await wrapper.find('.runtime-model-picker').findAll('select')[1].setValue('visible')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenLastCalledWith(expect.objectContaining({ binding: expect.objectContaining({ provider: 'p', model: 'visible' }) }))
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('Hermes profile is inherited from the connection for catalog checks and saves, without an editable profile field', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'local', name: 'Hermes nsfw', kind: 'hermes', endpoint: 'http://localhost:8642', defaultProfile: 'nsfw' }])
  vi.mocked(window.api.chatAgents.save).mockImplementation(async value => value)
  const wrapper = mount(SettingsChatAgents); await wrapper.vm.load(); await flushPromises()
  expect(wrapper.findAll('.md-detail input')).toHaveLength(1) // Agent name only.
  expect(wrapper.find('.inherited-profile').exists()).toBe(true)
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ profile: 'nsfw' }), undefined)
  expect(agents[0].binding.profile).toBe('research') // Opening the editor does not rewrite saved data.
  await wrapper.findAll('button').find(b => b.text() === 'runtime.check')!.trigger('click'); await flushPromises()
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ profile: 'nsfw' }), { refresh: true })
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenLastCalledWith(expect.objectContaining({ binding: expect.objectContaining({ connectionId: 'local', profile: 'nsfw' }) }))
})

test('switching Hermes connections inherits their profiles and Cancel restores the original connection', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([
    { id: 'local', name: 'Research', kind: 'hermes', endpoint: 'http://localhost:8642', defaultProfile: 'research' },
    { id: 'other', name: 'Default', kind: 'hermes', endpoint: 'http://localhost:8642' },
  ])
  vi.mocked(window.api.chatAgents.save).mockImplementation(async value => value)
  const wrapper = mount(SettingsChatAgents); await wrapper.vm.load(); await flushPromises()
  const select = () => wrapper.find('select[aria-label="runtime.connections"]')
  await select().setValue('other'); await flushPromises()
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ connectionId: 'other', profile: 'default' }), undefined)
  await wrapper.findAll('button').find(b => b.text() === 'common.cancel')!.trigger('click'); await flushPromises()
  expect(select().element.value).toBe('local')
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ connectionId: 'local', profile: 'research' }), undefined)
  expect(window.api.chatAgents.save).not.toHaveBeenCalled()
  await select().setValue('other'); await flushPromises()
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenLastCalledWith(expect.objectContaining({ binding: expect.objectContaining({ connectionId: 'other', profile: 'default' }) }))
})

test('missing Hermes connection cannot silently use a saved profile override', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([])
  const wrapper = mount(SettingsChatAgents); await wrapper.vm.load(); await flushPromises()
  expect(wrapper.find('.inherited-profile').exists()).toBe(false)
  expect(wrapper.find('select[aria-label="runtime.connections"]').text()).toContain('chatAgent.connectionUnavailable')
  expect(wrapper.findAll('button').find(b => b.text() === 'runtime.check')!.attributes('disabled')).toBeDefined()
  expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  expect(window.api.runtime.catalog).not.toHaveBeenCalled()
})

test('Connection updates refresh the inherited Hermes profile without saving Agent edits', async () => {
  const wrapper = mount(SettingsChatAgents); await wrapper.vm.load(); await flushPromises()
  await wrapper.find('.md-detail input').setValue('Unfinished edit')
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'local', name: 'Local', kind: 'hermes', endpoint: 'http://localhost:8642', defaultProfile: 'updated' }])
  for (const [signal, listener] of vi.mocked(window.api._on).mock.calls) if (signal === 'runtime-connections-changed') listener(null)
  await flushPromises()
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ profile: 'updated' }), undefined)
  expect(wrapper.find('.md-detail input').element.value).toBe('Unfinished edit')
  expect(window.api.chatAgents.save).not.toHaveBeenCalled()
})
