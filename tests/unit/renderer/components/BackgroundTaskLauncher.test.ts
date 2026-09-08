import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import BackgroundTaskLauncher from '@components/BackgroundTaskLauncher.vue'

enableAutoUnmount(afterEach)
const props = { modelValue: 'Selected context', instructions: 'Summarize', contextKind: 'selected-text' as const, name: 'Quick Save', agent: 'Research' }

test('shows one editable context field with read-only task details and no options', async () => {
  const wrapper = mount(BackgroundTaskLauncher, { props, attachTo: document.body })
  expect(wrapper.findAll('textarea')).toHaveLength(1)
  expect(wrapper.find('select, button, input').exists()).toBe(false)
  expect(wrapper.text()).toContain('Quick Save')
  expect(wrapper.text()).toContain('Research')
  expect(wrapper.text()).toContain('Summarize')
  expect(document.activeElement).toBe(wrapper.find('textarea').element)
  await wrapper.find('textarea').setValue('Edited context')
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Edited context'])
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('submit')).toHaveLength(1)
})

test('Enter respects composition, repeat keys, empty content and loading; Escape cancels', async () => {
  const wrapper = mount(BackgroundTaskLauncher, { props })
  const input = wrapper.find('textarea')
  for (const modifier of [{ shiftKey: true }, { isComposing: true }, { repeat: true }]) {
    await input.trigger('keydown', { key: 'Enter', ...modifier })
  }
  await wrapper.setProps({ modelValue: '   ' })
  await input.trigger('keydown', { key: 'Enter' })
  await wrapper.setProps({ modelValue: 'Context', disabled: true })
  await input.trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('submit')).toBeUndefined()
  await input.trigger('keydown', { key: 'Escape' })
  expect(wrapper.emitted('cancel')).toHaveLength(1)
})

test('keeps screenshot context visible and reports submission errors', () => {
  const wrapper = mount(BackgroundTaskLauncher, { props: { ...props, contextKind: 'screenshot', image: 'data:image/png;base64,aGVsbG8=', error: 'Connection unavailable' } })
  expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,aGVsbG8=')
  expect(wrapper.findAll('textarea')).toHaveLength(1)
  expect(wrapper.find('[role="alert"]').text()).toBe('Connection unavailable')
})
