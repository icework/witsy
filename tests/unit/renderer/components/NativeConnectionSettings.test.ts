import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import NativeConnectionSettings from '@components/NativeConnectionSettings.vue'
import ChatConfiguration from '@components/ChatConfiguration.vue'
import ChatAgentEditor from '@components/ChatAgentEditor.vue'
import ProviderCredentials from '@components/ProviderCredentials.vue'
import Chat from '@models/chat'
import { store } from '@services/store'
import { nativeDefault } from '@services/native_models'
import LlmFactory from '@services/llms/llm'
import LlmManager from '@services/llms/manager'
import { installMockModels } from '@tests/mocks/llm'
import { useWindowMock } from '@tests/mocks/window'

enableAutoUnmount(afterEach)
beforeEach(() => { useWindowMock({ modelDefaults: true }); store.loadSettings(); installMockModels(); delete store.config.nativeRuntime })
afterEach(() => vi.restoreAllMocks())
const button = (wrapper: ReturnType<typeof mount>, text: string) => wrapper.findAll('button').find(b => b.text() === text)!

test('Native visibility is a draft until Save, hides model choices in chat and agents, and Cancel restores it', async () => {
  const wrapper = mount(NativeConnectionSettings); await flushPromises()
  const providerRow = () => wrapper.findAll('.provider-row').find(row => row.text().includes('mock_label'))!
  await providerRow().find('button').trigger('click'); await flushPromises()
  const original = JSON.stringify(store.config.engines.mock)
  await wrapper.findAll('.model-row input')[0].setValue(false)
  expect(store.config.nativeRuntime).toBeUndefined()
  await button(wrapper, 'runtimeModels.save').trigger('click'); await flushPromises()
  expect(store.config.nativeRuntime.modelVisibility.models.mock).toEqual(['chat2', 'vision'])
  expect(JSON.stringify(store.config.engines.mock)).toBe(original)
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const picker = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  expect(picker.findAll('select')[2].find('option[value="chat"]').text()).toBe('runtimeModels.unavailable')
  expect(picker.findAll('select')[2].find('option[value="chat2"]').exists()).toBe(true)
  expect(chat.model).toBe('chat')
  const agent = mount(ChatAgentEditor, { props: { agent: { id: 'a', name: 'Saved', kind: 'native', native: { engine: 'mock', model: 'chat', tools: [] } } } }); await flushPromises()
  expect(agent.find('option[value="chat"]').text()).toBe('runtimeModels.unavailable')
  expect(agent.find('option[value="chat2"]').exists()).toBe(true)
  await providerRow().find('input').setValue(false)
  await wrapper.findAll('.visibility-actions button')[1].trigger('click'); await flushPromises()
  expect(providerRow().find<HTMLInputElement>('input').element.checked).toBe(true)
  await providerRow().find('input').setValue(false)
  await button(wrapper, 'runtimeModels.save').trigger('click'); await flushPromises()
  expect(picker.find('option[value="mock"]').exists()).toBe(false)
  expect(nativeDefault(store.config, LlmFactory.manager(store.config))).toEqual({ engine: '', model: '' })
})

test('saving a Native default is independent of provider defaults, and selecting Native replaces an old selection', async () => {
  const wrapper = mount(NativeConnectionSettings); await flushPromises()
  const selects = wrapper.findAll('.native-defaults select')
  await selects[0].setValue('mock'); await selects[1].setValue('vision')
  expect(store.config.nativeRuntime).toBeUndefined()
  await button(wrapper, 'runtimeDefaults.save').trigger('click'); await flushPromises()
  expect(store.config.nativeRuntime).toMatchObject({ defaultProvider: 'mock', defaultModel: 'vision' })
  expect(store.config.engines.mock.model.chat).toBe('chat')
  const chat = new Chat(); chat.setEngineModel('mock', 'chat'); chat.runtime = { kind: 'hermes', connectionId: 'h' }
  const picker = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  await picker.find('select').setValue('native')
  expect(picker.emitted('change')?.[0][0]).toEqual({ engine: 'mock', model: 'vision' })
  expect(chat.model).toBe('chat')
  const agent = mount(ChatAgentEditor, { props: { agent: null } }); await flushPromises()
  expect(agent.find('select[aria-label="chatAgent.provider"]').element.value).toBe('mock')
  expect(agent.find('option[value="vision"]').element.selected).toBe(true)
  store.config.nativeRuntime.modelVisibility = { models: { mock: ['chat2'] } }; await flushPromises()
  expect(nativeDefault(store.config, LlmFactory.manager(store.config))).toEqual({ engine: 'mock', model: 'chat2' })
  expect(store.config.nativeRuntime.defaultModel).toBe('vision')
  await selects[0].setValue(''); await button(wrapper, 'runtimeDefaults.save').trigger('click'); await flushPromises()
  expect(store.config.nativeRuntime.defaultModel).toBeUndefined()
  expect(store.config.nativeRuntime.modelVisibility.models.mock).toEqual(['chat2'])
})

test('an existing Native agent keeps its independent model when the connection default changes', async () => {
  store.config.nativeRuntime = { defaultProvider: 'mock', defaultModel: 'vision' }
  const agent = { id: 'a', name: 'Saved', kind: 'native' as const, native: { engine: 'mock', model: 'chat2', tools: [] } }
  vi.mocked(window.api.chatAgents.save).mockImplementation(async a => a)
  const wrapper = mount(ChatAgentEditor, { props: { agent } }); await flushPromises()
  await wrapper.find('input').setValue('Renamed')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(window.api.chatAgents.save).toHaveBeenLastCalledWith(expect.objectContaining({ native: expect.objectContaining({ model: 'chat2' }) }))
})

test('catalog refresh preserves visibility and cached models on failure and can be retried', async () => {
  const refresh = vi.spyOn(LlmManager.prototype, 'loadModels').mockImplementation(async provider => { store.config.engines[provider].models = { chat: [] }; return false })
  store.config.nativeRuntime = { defaultProvider: 'mock', defaultModel: 'chat2', modelVisibility: { models: { mock: ['chat2'] } } }
  const before = JSON.stringify(store.config.nativeRuntime)
  const wrapper = mount(NativeConnectionSettings); await flushPromises()
  await wrapper.find('.model-visibility .section-heading button').trigger('click'); await flushPromises()
  expect(wrapper.find('.model-visibility [role="alert"]').exists()).toBe(true)
  expect(store.config.engines.mock.models.chat).toHaveLength(3)
  expect(JSON.stringify(store.config.nativeRuntime)).toBe(before)
  refresh.mockResolvedValue(true)
  await wrapper.find('.model-visibility .section-heading button').trigger('click'); await flushPromises()
  expect(wrapper.find('.model-visibility [role="alert"]').exists()).toBe(false)
})

test('credential saves patch only edited authentication fields and cancel leaves data unchanged', async () => {
  store.config.engines.custom = { label: 'Custom', api: 'azure', apiKey: 'old-secret', baseURL: 'http://localhost:1234', deployment: 'dep', apiVersion: 'old', models: { chat: [] }, model: { chat: 'retained' }, disableTools: true }
  const wrapper = mount(ProviderCredentials, { props: { engine: 'custom', name: 'Custom' } })
  const original = JSON.stringify(store.config.engines.custom)
  await wrapper.find('input[name="apiKey"]').setValue('discard')
  await button(wrapper, 'common.cancel').trigger('click')
  expect(JSON.stringify(store.config.engines.custom)).toBe(original)
  await wrapper.find('input[name="apiKey"]').setValue('new-secret')
  await wrapper.find('input[name="deployment"]').setValue('new-deployment')
  store.config.engines.custom.model.chat = 'changed-elsewhere'
  await wrapper.find('form').trigger('submit')
  expect(store.config.engines.custom).toMatchObject({ apiKey: 'new-secret', deployment: 'new-deployment', apiVersion: 'old', disableTools: true, model: { chat: 'changed-elsewhere' } })
  expect(wrapper.find('input[name="apiKey"]').attributes('type')).toBe('password')
  expect(wrapper.find('select').exists()).toBe(false)
  expect(window.api.runtime.start).not.toHaveBeenCalled()
})

test('a partial refresh shows successful providers new models while retaining failed providers cache', async () => {
  store.config.engines.offline = { label: 'Offline', api: 'openai', baseURL: 'http://localhost:9999', models: { chat: [{ id: 'cached', name: 'Cached', capabilities: { tools: false, vision: false, reasoning: false, caching: false } }] }, model: { chat: 'cached' } }
  vi.spyOn(LlmManager.prototype, 'loadModels').mockImplementation(async provider => {
    if (provider !== 'mock') return false
    store.config.engines.mock.models.chat.push({ id: 'new', name: 'New model', capabilities: { tools: false, vision: false, reasoning: false, caching: false } })
    return true
  })
  const wrapper = mount(NativeConnectionSettings); await flushPromises()
  await wrapper.find('.model-visibility .section-heading button').trigger('click'); await flushPromises()
  expect(wrapper.find('.model-visibility [role="alert"]').exists()).toBe(true)
  expect(wrapper.find('.model-list').text()).toContain('New model')
  expect(store.config.engines.offline.models.chat[0].id).toBe('cached')
})
