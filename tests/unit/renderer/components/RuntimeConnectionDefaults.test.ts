import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RuntimeConnectionDefaults from '@components/RuntimeConnectionDefaults.vue'
import { useWindowMock } from '@tests/mocks/window'
import { RuntimeConnection } from '@/types/runtime'
enableAutoUnmount(afterEach)
const connection: RuntimeConnection = { id: 'h', kind: 'hermes', name: 'Hermes', endpoint: 'http://localhost:8642', defaultProfile: 'research', defaultProvider: 'p', defaultModel: 'm1' }
beforeEach(() => {
  useWindowMock()
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: [], providers: [{ id: 'p', name: 'Provider' }], models: [{ provider: 'p', id: 'm1', name: 'Model one' }, { provider: 'p', id: 'm2', name: 'Model two' }] })
  vi.mocked(window.api.runtime.setDefaultModel).mockImplementation(async (_id, selection) => ({ ...connection, defaultProvider: selection?.provider, defaultModel: selection?.model }))
})
test.each(['hermes', 'opencode'] as const)('%s saves only the selected default model after an explicit Save', async kind => {
  const wrapper = mount(RuntimeConnectionDefaults, { props: { connection: { ...connection, kind } } }); await flushPromises()
  expect(wrapper.findAll('select')[1].element.value).toBe('m1')
  await wrapper.findAll('select')[1].setValue('m2')
  expect(window.api.runtime.setDefaultModel).not.toHaveBeenCalled()
  await wrapper.find('button.primary').trigger('click'); await flushPromises()
  expect(window.api.runtime.setDefaultModel).toHaveBeenCalledWith('h', { provider: 'p', model: 'm2' })
  expect(wrapper.find('[role=status]').exists()).toBe(true)
  expect(connection.defaultModel).toBe('m1')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})
test('Cancel restores saved defaults; selecting Runtime default explicitly clears both fields', async () => {
  const wrapper = mount(RuntimeConnectionDefaults, { props: { connection } }); await flushPromises()
  await wrapper.findAll('select')[1].setValue('m2')
  await wrapper.findAll('button').find(b => b.text() === 'common.cancel')!.trigger('click')
  expect(wrapper.findAll('select')[1].element.value).toBe('m1')
  expect(window.api.runtime.setDefaultModel).not.toHaveBeenCalled()
  await wrapper.findAll('select')[0].setValue('')
  await wrapper.find('button.primary').trigger('click'); await flushPromises()
  expect(window.api.runtime.setDefaultModel).toHaveBeenCalledWith('h', null)
})
test('a failed save retains the draft and can be retried', async () => {
  vi.mocked(window.api.runtime.setDefaultModel).mockRejectedValueOnce(new Error('Save failed'))
  const wrapper = mount(RuntimeConnectionDefaults, { props: { connection } }); await flushPromises()
  await wrapper.findAll('select')[1].setValue('m2')
  await wrapper.find('button.primary').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=alert]').text()).toContain('Save failed')
  expect(wrapper.findAll('select')[1].element.value).toBe('m2')
  expect(wrapper.emitted('saved')).toBeUndefined()
  await wrapper.find('button.primary').trigger('click'); await flushPromises()
  expect(wrapper.emitted('saved')).toHaveLength(1)
})
test('a hidden saved default remains intact and outside selectable model options', async () => {
  const wrapper = mount(RuntimeConnectionDefaults, { props: { connection: { ...connection, defaultModel: 'hidden' } } }); await flushPromises()
  expect(wrapper.find('option[value="hidden"]').exists()).toBe(false)
  expect(wrapper.findAll('select')[1].element.value).toBe('unavailable')
  expect(window.api.runtime.setDefaultModel).not.toHaveBeenCalled()
})
test('catalog failures provide a retry without discarding saved defaults', async () => {
  vi.mocked(window.api.runtime.catalog).mockRejectedValueOnce(new Error('Offline'))
  const wrapper = mount(RuntimeConnectionDefaults, { props: { connection } }); await flushPromises()
  expect(wrapper.findAll('select').every(s => s.element.disabled)).toBe(true)
  await wrapper.find('.catalog-error button').trigger('click'); await flushPromises()
  expect(wrapper.findAll('select')[1].element.value).toBe('m1')
  expect(window.api.runtime.setDefaultModel).not.toHaveBeenCalled()
})
