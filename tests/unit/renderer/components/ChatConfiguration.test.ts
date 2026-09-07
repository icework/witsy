import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ChatConfiguration from '@components/ChatConfiguration.vue'
import Chat from '@models/chat'
import { useWindowMock } from '@tests/mocks/window'
import { installMockModels } from '@tests/mocks/llm'
import { store } from '@services/store'
enableAutoUnmount(afterEach)
beforeEach(() => {
  useWindowMock({ modelDefaults: true }); store.loadSettings(); installMockModels()
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'h', kind: 'hermes', name: 'Local', endpoint: 'http://localhost:8642', defaultProfile: 'research' }])
})
test('native Provider and Model can change independently of saved Agent defaults', async () => {
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  const selects = wrapper.findAll('select')
  expect(selects.every(s => !s.element.disabled)).toBe(true)
  await selects[2].setValue('vision')
  expect(wrapper.emitted('change')?.[0][0]).toEqual({ engine: 'mock', model: 'vision' })
  expect(chat.model).toBe('chat')
  await selects[0].setValue('h')
  expect(wrapper.emitted('change')?.[1][0]).toEqual({ runtime: { kind: 'hermes', connectionId: 'h', profile: 'research' } })
})
test.each(['hermes', 'opencode'] as const)('%s locks Provider and Model but allows switching Runtime', async kind => {
  const chat = new Chat(); chat.runtime = { kind, connectionId: 'h', provider: 'p', model: 'm', sessionId: 'existing-session' }
  const wrapper = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  const selects = wrapper.findAll('select')
  expect(selects[0].element.disabled).toBe(false)
  expect(selects[1].element.disabled).toBe(true)
  expect(selects[2].element.disabled).toBe(true)
  expect(selects[1].element.value).toBe('p'); expect(selects[2].element.value).toBe('m')
  await selects[0].setValue('native')
  expect(wrapper.emitted('change')?.[0][0]).not.toHaveProperty('runtime')
  expect(chat.runtime.sessionId).toBe('existing-session')
})

test('Native lists configured providers and drops a selected provider when its configuration is removed', async () => {
  store.config.engines.openai.apiKey = 'test-key'
  store.config.engines.anthropic.apiKey = ''
  const chat = new Chat(); chat.setEngineModel('openai', 'saved-model')
  const wrapper = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  const provider = wrapper.findAll('select')[1]
  expect(provider.find('option[value="openai"]').exists()).toBe(true)
  expect(provider.find('option[value="anthropic"]').exists()).toBe(false)
  expect(provider.find('option[value="mock"]').exists()).toBe(true)
  expect(provider.element.value).toBe('openai')
  store.config.engines.openai.apiKey = ''
  await wrapper.vm.$nextTick()
  expect(provider.find('option[value="openai"]').exists()).toBe(false)
  expect(provider.element.value).toBe('')
  expect(wrapper.findAll('select')[2].element.disabled).toBe(true)
  expect(wrapper.findAll('select')[2].element.value).toBe('')
  expect(chat.engine).toBe('openai')
  expect(wrapper.emitted('change')).toBeUndefined()
})


test('Empty runtime list keeps unconfigured runtimes visible and offers configuration without changing chat', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([])
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = mount(ChatConfiguration, { props: { chat } })
  await flushPromises()
  const runtime = wrapper.find('select')
  expect(runtime.findAll('option:disabled')).toHaveLength(2)
  expect(runtime.find('option[value="configure-runtimes"]').exists()).toBe(true)
  await runtime.setValue('configure-runtimes')
  expect(window.api.settings.open).toHaveBeenCalledWith({ initialTab: 'runtimeconnections' })
  expect(runtime.element.value).toBe('native')
  expect(wrapper.emitted('change')).toBeUndefined()
})


test('does not render an empty provider option for an unnamed stale custom engine', async () => {
  store.config.engines['stale-custom'] = {} as any
  const chat = new Chat(); chat.setEngineModel('stale-custom', 'old-model')
  const wrapper = mount(ChatConfiguration, { props: { chat } }); await flushPromises()
  const provider = wrapper.findAll('select')[1]
  expect(provider.find('option[value="stale-custom"]').exists()).toBe(false)
  expect(provider.element.value).toBe('')
  expect(provider.findAll('option').every(option => !!option.text())).toBe(true)
  expect(chat.engine).toBe('stale-custom')
})
