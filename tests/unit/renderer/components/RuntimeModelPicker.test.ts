import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test } from 'vitest'
import RuntimeModelPicker from '@components/RuntimeModelPicker.vue'
import { useWindowMock } from '@tests/mocks/window'
import { RuntimeCatalog } from '@/types/runtime'
enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock() })
const binding = { kind: 'hermes' as const, connectionId: 'h', provider: 'p', model: 'hidden' }
const catalog: RuntimeCatalog = { providers: [{ id: 'p', name: 'P' }, { id: 'empty', name: 'Empty' }], agents: [], profiles: [], models: [{ provider: 'p', id: 'visible', name: 'Visible model' }], defaults: { provider: 'p', model: 'visible' } }
test('keeps a hidden saved model out of selectable options without mutating the binding', async () => {
  const wrapper = mount(RuntimeModelPicker, { props: { binding, catalog } })
  expect(wrapper.find('option[value="hidden"]').exists()).toBe(false)
  expect(wrapper.find('option[value="empty"]').exists()).toBe(false)
  expect(wrapper.findAll('select')[1].element.value).toBe('unavailable')
  await wrapper.findAll('select')[1].setValue('visible')
  expect(wrapper.emitted('change')?.[0]).toEqual([{ provider: 'p', model: 'visible' }])
  expect(binding.model).toBe('hidden')
})
test('the runtime default is explicit, and choosing a listed model pins its provider', async () => {
  const wrapper = mount(RuntimeModelPicker, { props: { binding: { kind: 'hermes', connectionId: 'h' }, catalog } })
  await wrapper.findAll('select')[1].setValue('visible')
  expect(wrapper.emitted('change')?.[0]).toEqual([{ provider: 'p', model: 'visible' }])
  await wrapper.findAll('select')[0].setValue('')
  expect(wrapper.emitted('change')?.[1]).toEqual([{ provider: undefined, model: undefined }])
})
test('busy controls are disabled and an unavailable catalog has a retry action', async () => {
  const wrapper = mount(RuntimeModelPicker, { props: { binding, catalog, disabled: true } })
  expect(wrapper.findAll('select').every(s => s.element.disabled)).toBe(true)
  await wrapper.setProps({ disabled: false, error: 'Connection unavailable' }); await flushPromises()
  expect(wrapper.findAll('select').every(s => s.element.disabled)).toBe(true)
  await wrapper.find('button').trigger('click')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
})
