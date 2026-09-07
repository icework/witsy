import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ChatAgentPicker from '@components/ChatAgentPicker.vue'
import Chat from '@models/chat'
import { useWindowMock } from '@tests/mocks/window'
import { store } from '@services/store'
vi.unmock('@composables/event_bus')
const agents = [
  { id: 'h', name: 'Research', kind: 'hermes' as const, binding: { kind: 'hermes' as const, connectionId: 'local', profile: 'research' } },
  { id: 'o', name: 'Code', kind: 'opencode' as const, binding: { kind: 'opencode' as const, connectionId: 'code', agent: 'plan', provider: 'p', model: 'm' } },
]
enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock(); store.loadSettings(); store.loadHistory(); vi.mocked(window.api.chatAgents.list).mockResolvedValue(agents) })
test('selects a saved external agent for a fresh chat without starting a task', async () => {
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } })
  await flushPromises()
  await wrapper.find('select').setValue('h')
  expect(wrapper.emitted('select')?.[0][0]).toEqual(agents[0])
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('chatAgent.manage')
  expect(wrapper.text()).not.toContain('chatAgent.custom')
  expect(wrapper.text()).not.toContain('chatAgent.shortcut')
})

test('chooses the agent after capture and submits the actual image only on Ask', async () => {
  const image = 'data:image/png;base64,aGVsbG8='
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, image })
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } })
  await flushPromises()
  expect(wrapper.find('img').attributes('src')).toBe(image)
  await wrapper.find('select').setValue('h')
  expect(wrapper.emitted('select')?.[0][0]).toEqual(agents[0])
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }; chat.chatAgent = agents[0]
  await wrapper.setProps({ chat })
  expect(wrapper.emitted('ask')).toBeUndefined()
  await wrapper.find('textarea').setValue('What is shown?')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toEqual({ agent: expect.objectContaining({ binding: agents[0].binding }), image, question: 'What is shown?', temporary: false })
})
test('rejects an OpenCode model lacking image capability before creating a conversation', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, image: 'data:image/png;base64,aGVsbG8=' })
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: ['plan'], profiles: [], models: [{ provider: 'p', id: 'm', name: 'text only', vision: false }] })
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } })
  await flushPromises()
  await wrapper.find('textarea').setValue('What is shown?')
  await wrapper.find('select').setValue('o')
  const chat = new Chat(); chat.runtime = { ...agents[1].binding }
  await wrapper.setProps({ chat })
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('ask')).toBeUndefined()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
})

test('selected text workflow preselects its Agent and task, then sends edited text without requiring vision', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', requestId: 'one', contextText: 'Original context', agentId: 'h', prompt: 'Translate into Chinese', workflowName: 'Translate' })
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } })
  await flushPromises()
  expect(wrapper.find('select').element.value).toBe('h')
  expect(wrapper.emitted('select')?.[0][0]).toEqual(agents[0])
  expect(window.api.runtime.start).not.toHaveBeenCalled()
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }
  await wrapper.setProps({ chat })
  expect(wrapper.findAll('textarea')[1].element.value).toBe('Translate into Chinese')
  await wrapper.findAll('textarea')[0].setValue('Edited context')
  expect(wrapper.emitted('ask')).toBeUndefined()
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toEqual({ agent: expect.objectContaining({ binding: agents[0].binding }), text: 'Edited context', question: 'Translate into Chinese', temporary: false })
  expect(wrapper.find('img').exists()).toBe(false)
})

test('background task mode submits with Enter while Shift+Enter remains available for editing', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', contextText: 'Context', workflowMode: 'task', prompt: 'Summarize' })
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }; chat.chatAgent = agents[0]
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  const prompt = wrapper.findAll('textarea')[1]
  expect(wrapper.text()).toContain('contextWorkflow.runTask')
  await prompt.trigger('keydown', { key: 'Enter', shiftKey: true })
  expect(wrapper.emitted('ask')).toBeUndefined()
  await prompt.trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ text: 'Context', question: 'Summarize' })
  await prompt.trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')).toHaveLength(1)
})

test('manual context controls work without saved Agents or a Workflow', async () => {
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([])
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } })
  await flushPromises()
  await wrapper.vm.addContext('screenshot'); await flushPromises()
  expect(window.api.chatAgents.capture).toHaveBeenCalledWith()
  await wrapper.vm.addContext('text'); await flushPromises()
  expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ manualText: true })
  expect(window.api.chatAgents.runWorkflow).not.toHaveBeenCalled()
  expect(wrapper.find('select[aria-label="contextWorkflow.run"]').exists()).toBe(false)
})

test('retaking a task screenshot preserves manual edits and Enter submission without reapplying the Agent', async () => {
  const initial = { compact: true, capturing: false, busy: false, contextKind: 'screenshot' as const, requestId: 'first', image: 'data:image/png;base64,first', agentId: 'h', prompt: 'Preset question', workflowName: 'Background screenshot', workflowMode: 'task' as const }
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue(initial)
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }; chat.chatAgent = agents[0]
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  expect(wrapper.find('textarea').element.value).toBe('Preset question')
  await wrapper.find('textarea').setValue('Manually edited question')
  await wrapper.findAll('form button')[1].trigger('click'); await flushPromises()
  expect(window.api.chatAgents.capture).toHaveBeenCalledWith(true)
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ ...initial, requestId: 'retake', image: 'data:image/png;base64,second' })
  await wrapper.vm.reload(); await flushPromises()
  expect(wrapper.find('textarea').element.value).toBe('Manually edited question')
  expect(wrapper.emitted('select')).toHaveLength(1)
  expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,second')
  expect(wrapper.text()).toContain('Background screenshot')
  expect(wrapper.find('.primary').text()).toBe('contextWorkflow.runTask')
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ image: 'data:image/png;base64,second', question: 'Manually edited question' })
})

test('manual screenshot starts with an empty question and can be removed without submitting', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, image: 'data:image/png;base64,aGVsbG8=' })
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } }); await flushPromises()
  expect(wrapper.find('textarea').element.value).toBe('')
  await wrapper.find('textarea').setValue('Keep this question')
  await wrapper.find('.screenshot-attachment button').trigger('click'); await flushPromises()
  expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ dismiss: true })
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.emitted('removedScreenshot')?.[0]).toEqual(['Keep this question'])
  expect(wrapper.emitted('ask')).toBeUndefined()
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})
