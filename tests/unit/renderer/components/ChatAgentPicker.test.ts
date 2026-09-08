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

test('background task mode submits with Enter while Shift+Enter remains available for editing', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', contextText: 'Context', workflowMode: 'task', prompt: 'Summarize' })
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }; chat.chatAgent = agents[0]
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  const prompt = wrapper.find('textarea')
  expect(wrapper.findAll('textarea')).toHaveLength(1)
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.text()).toContain('contextWorkflow.runTask')
  await prompt.trigger('keydown', { key: 'Enter', shiftKey: true })
  expect(wrapper.emitted('ask')).toBeUndefined()
  await prompt.trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ text: 'Context', question: 'Summarize' })
  await prompt.trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')).toHaveLength(1)
})

test.each(['native', 'hermes'] as const)('a workflow using a saved %s Agent keeps the incognito default when submitted', async kind => {
  store.config.chatHistory.incognito = true
  const agent = kind === 'native' ? { id: 'native', name: 'Native', kind: 'native' as const, native: { engine: 'mock', model: 'chat' } } : agents[0]
  vi.mocked(window.api.chatAgents.list).mockResolvedValue([agent])
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', requestId: 'incognito', contextText: 'Private context', agentId: agent.id, workflowMode: 'task', prompt: 'Summarize privately' })
  const chat = new Chat(); chat.temporary = true; chat.chatAgent = agent
  if (agent.kind === 'hermes') chat.runtime = { ...agent.binding }
  else chat.setEngineModel(agent.native.engine, agent.native.model)
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  expect(wrapper.text()).toContain(agent.name)
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ text: 'Private context', question: 'Summarize privately', temporary: true })
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

test.each(['native', 'hermes', 'opencode'] as const)('no-context workflow sends only instructions with a %s Agent', async kind => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'none', requestId: 'none', prompt: 'Write a checklist', workflowMode: 'task' })
  const chat = new Chat()
  if (kind !== 'native') chat.runtime = { kind, connectionId: 'local' }
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  expect(wrapper.findAll('textarea')).toHaveLength(1)
  expect(wrapper.find('textarea').element.value).toBe('Write a checklist')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.emitted('ask')).toBeUndefined()
  await wrapper.find('textarea').setValue('Edited checklist')
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toEqual({ agent: expect.objectContaining({ kind }), question: 'Edited checklist', temporary: false })
  expect(window.api.chatAgents.capture).not.toHaveBeenCalled()
})

test('task launcher sends edited context with its saved instructions, and Escape dismisses it', async () => {
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'selected-text', contextText: 'Original', workflowMode: 'task', prompt: 'Summarize' })
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } }); await flushPromises()
  await wrapper.find('textarea').setValue('Edited context')
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ text: 'Edited context', question: 'Summarize' })
  await wrapper.find('textarea').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(window.api.chatAgents.screenshotUpdate).toHaveBeenCalledWith({ dismiss: true, hide: true, expand: true })
})

test('task launcher submits its screenshot without exposing chat configuration', async () => {
  const image = 'data:image/png;base64,aGVsbG8='
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'screenshot', image, workflowMode: 'task', prompt: 'Describe' })
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }; chat.chatAgent = agents[0]
  const wrapper = mount(ChatAgentPicker, { props: { chat }, slots: { 'composer-controls': '<select><option>Model</option></select>' } }); await flushPromises()
  expect(wrapper.find('select, input, .screenshot-actions, button[type="submit"]').exists()).toBe(false)
  expect(wrapper.find('.screenshot-thumbnail').exists()).toBe(true)
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises()
  expect(wrapper.emitted('ask')?.[0][0]).toMatchObject({ image, question: 'Describe' })
})

test('Escape during runtime validation prevents the pending task from being sent', async () => {
  let resolveCatalog: (value: Awaited<ReturnType<typeof window.api.runtime.catalog>>) => void
  vi.mocked(window.api.runtime.catalog).mockImplementationOnce(() => new Promise(resolve => { resolveCatalog = resolve }))
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue({ compact: true, capturing: false, busy: false, contextKind: 'none', workflowMode: 'task', prompt: 'Summarize' })
  const chat = new Chat(); chat.runtime = { ...agents[0].binding }
  const wrapper = mount(ChatAgentPicker, { props: { chat } }); await flushPromises()
  await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
  await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
  resolveCatalog({ agents: [], profiles: [], models: [] }); await flushPromises()
  expect(wrapper.emitted('ask')).toBeUndefined()
})

test.each(['none', 'selected-text', 'screenshot'] as const)('conversation %s context is handed to the main composer without a separate preview form', async contextKind => {
  const state = { compact: false, capturing: false, busy: false, contextKind, workflowMode: 'chat' as const, requestId: 'main', agentId: 'h', prompt: 'Summarize', workflowName: 'Summary', ...(contextKind === 'screenshot' ? { image: 'data:image/png;base64,aGVsbG8=' } : {}) }
  vi.mocked(window.api.chatAgents.screenshotState).mockResolvedValue(state)
  const wrapper = mount(ChatAgentPicker, { props: { chat: new Chat() } }); await flushPromises()
  expect(wrapper.emitted('context')?.[0]).toEqual([state, agents[0]])
  expect(wrapper.emitted('select')).toBeUndefined()
  expect(wrapper.find('form, textarea, button').exists()).toBe(false)
})
