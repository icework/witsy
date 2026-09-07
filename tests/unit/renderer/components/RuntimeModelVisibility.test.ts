import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RuntimeModelVisibility from '@components/RuntimeModelVisibility.vue'
import { useWindowMock } from '@tests/mocks/window'
import { RuntimeCatalog, RuntimeConnection } from '@/types/runtime'

enableAutoUnmount(afterEach)
const connection: RuntimeConnection = { id: 'h', kind: 'hermes', name: 'Hermes', endpoint: 'http://localhost:8642' }
const binding = { connectionId: 'h', kind: 'hermes' as const, profile: 'research' }
const catalog: RuntimeCatalog = { agents: [], profiles: ['research'], defaults: { provider: 'p', model: 'm1' }, providers: [{ id: 'p', name: 'Provider P' }, { id: 'q', name: 'Provider Q' }], models: [
  { provider: 'p', id: 'm1', name: 'Model One' }, { provider: 'p', id: 'm2', name: 'Model Two' }, { provider: 'q', id: 'other', name: 'Other' },
] }
beforeEach(() => {
  useWindowMock()
  vi.mocked(window.api.runtime.catalog).mockResolvedValue(catalog)
  vi.mocked(window.api.runtime.setModelVisibility).mockImplementation(async (id, visibility) => ({ ...connection, id, modelVisibility: visibility }))
})
test('provider and model checkboxes stay in a draft until saved, including explicit hide-all', async () => {
  const wrapper = mount(RuntimeModelVisibility, { props: { connection, binding } }); await flushPromises()
  expect(window.api.runtime.catalog).toHaveBeenCalledWith(binding, { includeHidden: true, refresh: false })
  await wrapper.findAll('.provider-row input')[1].setValue(false)
  await wrapper.findAll('.model-row input')[0].setValue(false)
  expect(window.api.runtime.setModelVisibility).not.toHaveBeenCalled()
  await wrapper.find('.primary').trigger('click'); await flushPromises()
  expect(window.api.runtime.setModelVisibility).toHaveBeenCalledWith('h', { providers: ['p'], models: { p: ['m2'] } })
  expect(wrapper.find('.primary').attributes('disabled')).toBeDefined()
  await wrapper.findAll('.bulk-actions button')[1].trigger('click')
  await wrapper.find('.primary').trigger('click'); await flushPromises()
  expect(window.api.runtime.setModelVisibility).toHaveBeenLastCalledWith('h', { providers: ['p'], models: { p: [] } })
  expect(connection.modelVisibility).toBeUndefined()
})
test('search and refresh preserve draft visibility, and Cancel restores the saved selection', async () => {
  const savedConnection = { ...connection, modelVisibility: { models: { p: ['m1'] } } }
  const wrapper = mount(RuntimeModelVisibility, { props: { connection: savedConnection, binding } }); await flushPromises()
  await wrapper.findAll('.model-row input')[1].setValue(true)
  await wrapper.find('input[type="search"]').setValue('Two')
  expect(wrapper.findAll('.model-row')).toHaveLength(1)
  await wrapper.find('.section-heading button').trigger('click'); await flushPromises()
  expect(window.api.runtime.catalog).toHaveBeenLastCalledWith(binding, { includeHidden: true, refresh: true })
  expect(wrapper.find<HTMLInputElement>('.model-row input').element.checked).toBe(true)
  await wrapper.findAll('.visibility-actions button')[1].trigger('click')
  expect(wrapper.find<HTMLInputElement>('.model-row input').element.checked).toBe(false)
  expect(window.api.runtime.setModelVisibility).not.toHaveBeenCalled()
})
test('a failed refresh retains the existing catalog and selections, and a failed save stays retryable', async () => {
  const wrapper = mount(RuntimeModelVisibility, { props: { connection, binding } }); await flushPromises()
  await wrapper.findAll('.model-row input')[0].setValue(false)
  vi.mocked(window.api.runtime.catalog).mockRejectedValue(new Error('Offline'))
  await wrapper.find('.section-heading button').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toBe('Offline')
  expect(wrapper.findAll('.model-row')).toHaveLength(2)
  vi.mocked(window.api.runtime.setModelVisibility).mockRejectedValue(new Error('Save failed'))
  await wrapper.find('.primary').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toBe('Save failed')
  expect(wrapper.find('.primary').attributes('disabled')).toBeUndefined()
})
test('a configured provider with zero models has an explicit empty state', async () => {
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ providers: [{ id: 'p', name: 'Provider' }], models: [], agents: [], profiles: [] })
  const wrapper = mount(RuntimeModelVisibility, { props: { connection, binding } }); await flushPromises()
  expect(wrapper.text()).toContain('runtimeModels.emptyProvider')
  expect(wrapper.findAll('.model-row')).toHaveLength(0)
})
