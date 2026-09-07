import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SettingsRuntimeConnections from '@renderer/settings/SettingsRuntimeConnections.vue'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'
import { emitBusEventMock } from '../../../../vitest.setup'

enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock(); store.loadSettings(); store.loadHistory(); emitBusEventMock.mockClear() })

test('Connections contains the manual Native entry point', async () => {
  const wrapper = mount(SettingsRuntimeConnections)
  await flushPromises()
  expect(wrapper.text()).toContain('agentDesign.nativeHelp')
  expect(wrapper.text()).not.toContain('chatAgent.capture')
  await wrapper.findAll('button').find(b => b.text() === 'chatAgent.startNative')!.trigger('click')
  expect(emitBusEventMock).toHaveBeenCalledWith('new-chat', undefined)
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('manual OpenCode configuration starts a new chat with the selected binding', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'o', kind: 'opencode', name: 'Code', endpoint: 'http://localhost:4096', defaultProvider: 'p', defaultModel: 'm' }])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: ['plan'], profiles: [], models: [{ provider: 'p', id: 'm', name: 'Model' }] })
  const wrapper = mount(SettingsRuntimeConnections)
  await flushPromises()
  await wrapper.find('.runtime-chat select').setValue('o')
  await flushPromises()
  await wrapper.findAll('.runtime-chat select').find(s => s.text().includes('plan'))!.setValue('plan')
  await wrapper.findAll('button').find(b => b.text() === 'runtime.useTarget')!.trigger('click')
  await flushPromises()
  expect(emitBusEventMock).toHaveBeenCalledWith('new-chat', { runtime: expect.objectContaining({ connectionId: 'o', kind: 'opencode', agent: 'plan', provider: 'p', model: 'm' }) })
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})
