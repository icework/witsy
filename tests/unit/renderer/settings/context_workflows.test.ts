import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SettingsContextWorkflows from '@renderer/settings/SettingsContextWorkflows.vue'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'
const workflow = { schemaVersion: 1 as const, id: 'screen', name: 'Screenshot Ask', contextInput: 'screenshot' as const, agentId: 'h', prompt: 'Explain', accelerator: 'Command+Shift+2', enabled: true }
enableAutoUnmount(afterEach)
beforeEach(() => {
  useWindowMock(); store.loadSettings(); store.loadHistory()
  vi.mocked(window.api.chatAgents.workflows).mockResolvedValue([workflow])
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([{ id: 'h', name: 'Research', kind: 'hermes' }])
})
test('new workflow saves context input, Agent, instructions and its own hotkey', async () => {
  const wrapper = mount(SettingsContextWorkflows)
  await wrapper.vm.load(); await flushPromises()
  await wrapper.find('button[aria-label="contextWorkflow.new"]').trigger('click')
  await wrapper.find('form input').setValue('Translate selection')
  await wrapper.findAll('form select')[0].setValue('selected-text')
  await wrapper.findAll('form select')[1].setValue('h')
  await wrapper.find('textarea').setValue('Translate into Chinese')
  await wrapper.findAll('form input')[1].setValue('Command+Shift+7')
  const saved = { ...workflow, id: 'selection', name: 'Translate selection', contextInput: 'selected-text' as const, prompt: 'Translate into Chinese', accelerator: 'Command+Shift+7' }
  vi.mocked(window.api.chatAgents.saveWorkflow).mockResolvedValue(saved)
  vi.mocked(window.api.chatAgents.workflows).mockResolvedValue([workflow, saved])
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.saveWorkflow).toHaveBeenCalledWith({ ...saved, id: '' })
  expect(wrapper.findAll('.md-master-list-item')).toHaveLength(2)
  expect(window.api.chatAgents.runWorkflow).not.toHaveBeenCalled()
})
test('a failed shortcut save leaves the saved item and edited draft visible', async () => {
  const wrapper = mount(SettingsContextWorkflows)
  await wrapper.vm.load(); await flushPromises()
  await wrapper.findAll('form input')[1].setValue('Command+Shift+3')
  vi.mocked(window.api.chatAgents.saveWorkflow).mockRejectedValue(new Error('Shortcut conflict'))
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toBe('Shortcut conflict')
  expect(wrapper.findAll('form input')[1].element.value).toBe('Command+Shift+3')
  expect(workflow.accelerator).toBe('Command+Shift+2')
})
