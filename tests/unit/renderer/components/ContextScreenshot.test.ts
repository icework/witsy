import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import ContextScreenshot from '@components/ContextScreenshot.vue'
enableAutoUnmount(afterEach)

test('thumbnail opens an image preview and corner icons retake or remove without submitting', async () => {
  const show = vi.fn(function (this: HTMLDialogElement) { this.open = true })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: show })
  const close = vi.fn(function (this: HTMLDialogElement) { this.open = false })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close })
  const wrapper = mount(ContextScreenshot, { props: { image: 'data:image/png;base64,aGVsbG8=', editable: true } })
  await wrapper.find('.screenshot-thumbnail').trigger('click')
  expect(show).toHaveBeenCalledOnce()
  expect(wrapper.find('dialog img').attributes('src')).toBe('data:image/png;base64,aGVsbG8=')
  await wrapper.find('.preview-close').trigger('click')
  expect(close).toHaveBeenCalledOnce()
  await wrapper.find('button[aria-label="chatAgent.retake"]').trigger('click')
  await wrapper.find('button[aria-label="chatAgent.removeScreenshot"]').trigger('click')
  expect(wrapper.emitted('retake')).toHaveLength(1)
  expect(wrapper.emitted('remove')).toHaveLength(1)
  await wrapper.setProps({ disabled: true })
  expect(wrapper.find('button[aria-label="chatAgent.retake"]').attributes()).toHaveProperty('disabled')

})
