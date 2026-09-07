import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ContextWorkflows from '@screens/ContextWorkflows.vue'
import { useWindowMock } from '@tests/mocks/window'
enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock() })
test('separate launcher opens a workflow draft without starting a runtime', async () => {
  vi.mocked(window.api.chatAgents.workflows).mockResolvedValue([{ schemaVersion: 1, id: 'text', name: 'Translate', contextInput: 'selected-text', prompt: 'Translate', accelerator: '', enabled: true }])
  const wrapper = mount(ContextWorkflows); await flushPromises()
  expect(wrapper.text()).toContain('Translate')
  await wrapper.find('li button').trigger('click'); await flushPromises()
  expect(window.api.chatAgents.runWorkflow).toHaveBeenCalledWith('text')
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  await wrapper.find('header button').trigger('click')
  expect(window.api.settings.open).toHaveBeenCalledWith({ initialTab: 'contextworkflows' })
})
