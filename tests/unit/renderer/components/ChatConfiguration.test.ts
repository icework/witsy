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
const mountConfiguration = async (options: { props: { chat: Chat; disabled?: boolean } }) => {
  const wrapper = mount(ChatConfiguration, { ...options, global: { stubs: { Teleport: true } } })
  await flushPromises()
  await wrapper.find('.model-trigger').trigger('click')
  await flushPromises()
  return wrapper
}
test('native Provider and Model can change independently of saved Agent defaults', async () => {
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  const selects = wrapper.findAll('select')
  expect(selects.every(s => !s.element.disabled)).toBe(true)
  await selects[2].setValue('vision')
  expect(wrapper.emitted('change')?.[0][0]).toEqual({ engine: 'mock', model: 'vision' })
  expect(chat.model).toBe('chat')
  await selects[0].setValue('h')
  expect(wrapper.emitted('change')?.[1][0]).toEqual({ runtime: { kind: 'hermes', connectionId: 'h', profile: 'research' } })
})
test.each(['hermes', 'opencode'] as const)('selecting %s immediately uses that connection default without carrying prior session settings', async kind => {
  const connection = { id: 'h', kind, name: 'Configured runtime', endpoint: 'http://localhost:8642', defaultProfile: 'research', defaultProvider: 'p', defaultModel: 'm' }
  vi.mocked(window.api.runtime.list).mockResolvedValue([connection])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: [], models: [{ provider: 'p', id: 'm', name: 'Model' }] })
  const chat = new Chat(); chat.runtime = { kind: 'opencode', connectionId: 'old', provider: 'old', model: 'old', agent: 'old-agent', directory: '/old', sessionId: 'old-session' }
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  await wrapper.find('select').setValue('h')
  const next = (wrapper.emitted('change')![0][0] as { runtime: typeof chat.runtime }).runtime
  expect(next).toEqual({ kind, connectionId: 'h', provider: 'p', model: 'm', ...(kind === 'hermes' ? { profile: 'research' } : {}) })
  const nextChat = new Chat(); nextChat.runtime = next
  await wrapper.setProps({ chat: nextChat }); await flushPromises()
  expect(wrapper.findAll('select').map(s => s.element.value)).toEqual(['h', 'p', 'm'])
  expect(chat.runtime.sessionId).toBe('old-session')
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ ...connection, defaultModel: 'changed' }])
  for (const [signal, listener] of vi.mocked(window.api._on).mock.calls) if (signal === 'runtime-connections-changed') listener(null)
  await flushPromises()
  expect(nextChat.runtime.model).toBe('m')
  await wrapper.find('select').setValue('h')
  expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ runtime: { model: 'changed' } })
})
test.each(['hermes', 'opencode'] as const)('%s offers the visible catalog and clears session metadata when selecting another model', async kind => {
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: [], providers: [{ id: 'p', name: 'Provider' }], models: [{ provider: 'p', id: 'm', name: 'M' }, { provider: 'p', id: 'next', name: 'Next' }] })
  const chat = new Chat(); chat.runtime = { kind, connectionId: 'h', provider: 'p', model: 'm', actualModel: 'old', actualProvider: 'old-provider', sessionId: 'existing-session' }
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  const selects = wrapper.findAll('select')
  expect(selects[0].element.disabled).toBe(false)
  expect(selects[1].element.disabled).toBe(false)
  expect(selects[2].element.disabled).toBe(false)
  expect(selects[1].element.value).toBe('p'); expect(selects[2].element.value).toBe('m')
  await selects[2].setValue('next')
  expect(wrapper.emitted('change')?.[0][0]).toEqual({ runtime: { kind, connectionId: 'h', provider: 'p', model: 'next' } })
  await selects[0].setValue('native')
  expect(wrapper.emitted('change')?.[1][0]).not.toHaveProperty('runtime')
  expect(chat.runtime.sessionId).toBe('existing-session')
})

test('visibility notifications update the active picker without changing its hidden saved selection', async () => {
  const chat = new Chat(); chat.runtime = { kind: 'hermes', connectionId: 'h', provider: 'p', model: 'hidden' }
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: [], profiles: [], models: [{ provider: 'p', id: 'visible', name: 'Visible' }] })
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  expect(wrapper.find('option[value="hidden"]').exists()).toBe(false)
  expect(wrapper.findAll('select')[2].element.value).toBe('unavailable')
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ agents: [], profiles: [], models: [{ provider: 'p', id: 'hidden', name: 'Previously hidden' }] })
  for (const [signal, listener] of vi.mocked(window.api._on).mock.calls) if (signal === 'runtime-connections-changed') listener(null)
  await flushPromises()
  expect(wrapper.findAll('select')[2].element.value).toBe('hidden')
  expect(wrapper.emitted('change')).toBeUndefined()
})

test('Native lists configured providers and drops a selected provider when its configuration is removed', async () => {
  store.config.engines.openai.apiKey = 'test-key'
  store.config.engines.anthropic.apiKey = ''
  const chat = new Chat(); chat.setEngineModel('openai', 'saved-model')
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  const provider = wrapper.findAll('select')[1]
  expect(provider.find('option[value="openai"]').exists()).toBe(true)
  expect(provider.find('option[value="anthropic"]').exists()).toBe(false)
  expect(provider.find('option[value="mock"]').exists()).toBe(true)
  expect(provider.element.value).toBe('openai')
  store.config.engines.openai.apiKey = ''
  await flushPromises()
  const updatedProvider = wrapper.findAll('select')[1]
  expect(updatedProvider.find('option[value="openai"]').exists()).toBe(false)
  expect(updatedProvider.element.value).toBe('')
  expect(wrapper.findAll('select')[2].element.disabled).toBe(true)
  expect(wrapper.findAll('select')[2].element.value).toBe('')
  expect(chat.engine).toBe('openai')
  expect(wrapper.emitted('change')).toBeUndefined()
})


test('Empty runtime list keeps unconfigured runtimes visible and offers configuration without changing chat', async () => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([])
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = await mountConfiguration({ props: { chat } })
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
  const wrapper = await mountConfiguration({ props: { chat } }); await flushPromises()
  const provider = wrapper.findAll('select')[1]
  expect(provider.find('option[value="stale-custom"]').exists()).toBe(false)
  expect(provider.element.value).toBe('')
  expect(provider.findAll('option').every(option => !!option.text())).toBe(true)
  expect(chat.engine).toBe('stale-custom')
})

test('keeps model controls behind one named trigger and returns focus when Escape closes the panel', async () => {
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = mount(ChatConfiguration, { props: { chat }, attachTo: document.body, global: { stubs: { Teleport: true } } })
  await flushPromises()
  const trigger = wrapper.find('.model-trigger')
  expect(trigger.text()).toContain('Native')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(trigger.attributes('aria-expanded')).toBe('false')
  await trigger.trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.find('select').element)
  await wrapper.find('select').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
  expect(wrapper.emitted('change')).toBeUndefined()
})

test.each(['hermes', 'opencode'] as const)('identifies %s beside the model before loading and after a catalog failure', async kind => {
  vi.mocked(window.api.runtime.list).mockResolvedValue([{ id: 'h', kind, name: 'Work computer', endpoint: 'http://localhost:8642' }])
  vi.mocked(window.api.runtime.catalog).mockResolvedValue({ profiles: [], agents: [], models: [{ provider: 'p', id: 'm', name: 'Reasoning model' }] })
  const chat = new Chat(); chat.runtime = { kind, connectionId: 'h', provider: 'p', model: 'm' }
  const wrapper = mount(ChatConfiguration, { props: { chat } })
  const runtimeName = kind === 'hermes' ? 'Hermes' : 'OpenCode'
  expect(wrapper.find('.model-trigger').text()).toContain(runtimeName)
  await flushPromises()
  expect(wrapper.find('.model-trigger').text()).toContain(`${runtimeName}·Reasoning model`)
  expect(wrapper.find('.model-trigger').attributes('title')).toContain('Work computer')
  vi.mocked(window.api.runtime.catalog).mockRejectedValue(new Error('Unavailable'))
  for (const [signal, listener] of vi.mocked(window.api._on).mock.calls) if (signal === 'runtime-connections-changed') listener(null)
  await flushPromises()
  expect(wrapper.find('.model-trigger').text()).toContain(runtimeName)
  expect(wrapper.find('.model-trigger').text()).toContain('runtimeModels.loadFailed')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

test('closes the panel on outside activation and when the composer becomes disabled', async () => {
  const chat = new Chat(); chat.setEngineModel('mock', 'chat')
  const wrapper = await mountConfiguration({ props: { chat } })
  document.body.click()
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  await wrapper.find('.model-trigger').trigger('click')
  await wrapper.setProps({ disabled: true })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(wrapper.find<HTMLButtonElement>('.model-trigger').element.disabled).toBe(true)
  expect(wrapper.emitted('change')).toBeUndefined()
})

test('keeps configuration open while retrying a failed catalog and closes when focus returns to the draft', async () => {
  vi.mocked(window.api.runtime.catalog).mockRejectedValue(new Error('Unavailable'))
  const chat = new Chat(); chat.runtime = { kind: 'hermes', connectionId: 'h', provider: 'p', model: 'm' }
  const wrapper = mount(ChatConfiguration, { props: { chat }, attachTo: document.body })
  const draft = document.createElement('textarea')
  document.body.append(draft)
  try {
    await flushPromises()
    await wrapper.find('.model-trigger').trigger('click')
    await flushPromises()
    const retry = document.querySelector<HTMLButtonElement>('.catalog-error button')
    expect(retry).not.toBeNull()
    retry.click()
    await flushPromises()
    expect(window.api.runtime.catalog).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    draft.focus()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.emitted('change')).toBeUndefined()
  } finally {
    draft.remove()
    wrapper.unmount()
  }
})
