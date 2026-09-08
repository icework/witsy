import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test } from 'vitest'
import InputAccelerator from '@renderer/components/InputAccelerator.vue'
import { useWindowMock } from '@tests/mocks/window'

enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock() })
const setup = (value = 'CmdOrCtrl+Shift+2') => mount(InputAccelerator, {
  props: { label: 'Shortcut', modelValue: value },
})

test('keeps an existing accelerator unchanged until recording a complete combination', async () => {
  const wrapper = setup()
  const button = wrapper.get('.recorder')
  expect(button.text()).toBe('CmdOrCtrl+Shift+2')
  await button.trigger('keydown', { key: 'a', code: 'KeyA', ctrlKey: true })
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await button.trigger('click')
  for (const event of [
    { key: 'Control', code: 'ControlLeft', ctrlKey: true },
    { key: 'a', code: 'KeyA' },
    { key: 'A', code: 'KeyA', shiftKey: true },
    { key: 'Process', code: 'KeyA', ctrlKey: true, isComposing: true },
  ]) await button.trigger('keydown', event)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await button.trigger('keydown', { key: 'å', code: 'KeyA', altKey: true, ctrlKey: true })
  expect(wrapper.emitted('update:modelValue')).toEqual([['Control+Alt+A']])
  expect(button.attributes('aria-pressed')).toBe('false')
})

test.each([
  ['ArrowUp', 'Up'], ['Space', 'Space'], ['Enter', 'Return'], ['F12', 'F12'],
  ['Digit2', '2'], ['Minus', '-'], ['Numpad1', 'num1'], ['Backspace', 'Backspace'],
])('records %s as an Electron accelerator', async (code, key) => {
  const wrapper = setup('')
  await wrapper.get('.recorder').trigger('click')
  await wrapper.get('.recorder').trigger('keydown', { key, code, metaKey: true, shiftKey: true })
  expect(wrapper.emitted('update:modelValue')).toEqual([[`Command+Shift+${key}`]])
})

test('Escape, Tab and blur cancel without modifying the shortcut; Tab keeps native focus navigation', async () => {
  const wrapper = setup()
  const button = wrapper.get('.recorder')
  for (const key of ['Escape', 'Tab']) {
    await button.trigger('click')
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    button.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(event.defaultPrevented).toBe(key === 'Escape')
    expect(button.text()).toBe('CmdOrCtrl+Shift+2')
  }
  await button.trigger('click')
  await button.trigger('blur')
  expect(button.attributes('aria-pressed')).toBe('false')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

test('clear emits an empty accelerator and cannot submit a surrounding form', async () => {
  const wrapper = setup()
  const clear = wrapper.get('button[aria-label="contextWorkflow.clearShortcut"]')
  expect(clear.attributes('type')).toBe('button')
  await clear.trigger('click')
  expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  await wrapper.setProps({ modelValue: '' })
  expect(clear.attributes('disabled')).toBeDefined()
  expect(wrapper.get('.recorder').text()).toBe('contextWorkflow.recordShortcut')
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('.recorder').attributes('disabled')).toBeDefined()
})
