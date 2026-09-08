import { LlmChunkContent, LlmChunkTool, LlmChunkUsage, LlmEngine } from 'multi-llm-ts'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { useWindowMock } from '@tests/mocks/window'
import defaults from '@root/defaults/settings.json'
import LlmUtils from '@services/llm_utils'
import Message from '@models/message'
import LlmFactory, { ILlmManager } from '@services/llms/llm'

let config = defaults as any

beforeAll(() => {
  useWindowMock()
})

beforeEach(() => {
  vi.clearAllMocks()
  config = JSON.parse(JSON.stringify(defaults))

  // Mock docrepo API
  window.api.docrepo = {
    list: vi.fn(() => [
      { uuid: 'repo1', name: 'Knowledge Base 1', workspaceId: 'workspace1' },
      { uuid: 'repo2', name: 'Knowledge Base 2', workspaceId: 'workspace1' },
    ]),
    query: vi.fn((uuid: string) => {
      if (uuid === 'repo1') {
        return Promise.resolve([
          { content: 'Content from repo1', score: 0.8, metadata: { uuid: '1', title: 'Doc A', type: 'text', url: 'url1' } },
          { content: 'More from repo1', score: 0.6, metadata: { uuid: '2', title: 'Doc B', type: 'text', url: 'url2' } },
        ])
      } else if (uuid === 'repo2') {
        return Promise.resolve([
          { content: 'Content from repo2', score: 0.9, metadata: { uuid: '3', title: 'Doc C', type: 'text', url: 'url3' } },
          { content: 'More from repo2', score: 0.5, metadata: { uuid: '4', title: 'Doc D', type: 'text', url: 'url4' } },
        ])
      }
      return Promise.resolve([])
    }),
  } as any
})

afterEach(() => {
  vi.restoreAllMocks()
})

// helper to create a mock LlmEngine with a generate method yielding chunks
const mockLlmEngine = (chunks: (LlmChunkContent | LlmChunkUsage | LlmChunkTool)[]): LlmEngine => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async *generate(_model: any, _messages: any, _opts?: any) {
      for (const chunk of chunks) {
        yield chunk
      }
    }
  } as unknown as LlmEngine
}

const mockTitleModel = (title = 'A short summary') => {
  config.llm.engine = 'openai'
  config.engines.openai.model.chat = 'legacy-chat'
  delete config.nativeRuntime
  const models = {
    openai: ['legacy-chat', 'gpt-5-mini'],
    anthropic: ['default-chat', 'claude-haiku-4-5'],
  }
  const llm = mockLlmEngine([{ type: 'content', text: title, done: true }])
  const generate = vi.spyOn(llm, 'generate')
  const manager = {
    getChatEngines: vi.fn(() => Object.keys(models)),
    getEngineName: vi.fn((provider: string) => provider),
    isEngineConfigured: vi.fn(() => true),
    getChatModels: vi.fn((provider: keyof typeof models) => models[provider].map(id => ({ id, name: id }))),
    getChatModel: vi.fn((provider: keyof typeof models, id: string) => models[provider].includes(id) ? { id } : null),
    igniteEngine: vi.fn(() => llm),
    getChatEngineModel: vi.fn(),
  }
  vi.spyOn(LlmFactory, 'manager').mockReturnValue(manager as unknown as ILlmManager)
  return { manager, generate }
}

test('getTitle uses the explicit default chat model without changing settings or selecting a simple-task model', async () => {
  const { manager, generate } = mockTitleModel()
  config.nativeRuntime = { defaultProvider: 'anthropic', defaultModel: 'default-chat' }
  const before = JSON.stringify(config)
  const result = await new LlmUtils(config).getTitle([new Message('user', 'Plan a short trip'), new Message('assistant', 'Visit the coast')])

  expect(result).toBe('A short summary')
  expect(manager.igniteEngine).toHaveBeenCalledWith('anthropic')
  expect(generate.mock.calls[0][0]).toEqual({ id: 'default-chat' })
  expect(manager.getChatEngineModel).not.toHaveBeenCalled()
  expect(JSON.stringify(config)).toBe(before)
})

test('getTitle uses the legacy default chat model when no Native default is saved', async () => {
  const { manager, generate } = mockTitleModel()

  await new LlmUtils(config).getTitle([new Message('user', 'Plan a short trip')])

  expect(manager.igniteEngine).toHaveBeenCalledWith('openai')
  expect(generate.mock.calls[0][0]).toEqual({ id: 'legacy-chat' })
  expect(manager.getChatEngineModel).not.toHaveBeenCalled()
})

test('getTitle falls back to an available visible model when saved defaults are hidden', async () => {
  const { generate } = mockTitleModel()
  config.nativeRuntime = {
    defaultProvider: 'openai', defaultModel: 'legacy-chat',
    modelVisibility: { providers: ['anthropic'], models: { anthropic: ['default-chat'] } },
  }

  await new LlmUtils(config).getTitle([new Message('user', 'Plan a short trip')])

  expect(generate.mock.calls[0][0]).toEqual({ id: 'default-chat' })
})

test('getTitle skips generation if no configured visible model is available', async () => {
  const { manager, generate } = mockTitleModel()
  manager.isEngineConfigured.mockReturnValue(false)

  expect(await new LlmUtils(config).getTitle([new Message('user', 'Plan a short trip')])).toBeNull()
  expect(manager.igniteEngine).not.toHaveBeenCalled()
  expect(generate).not.toHaveBeenCalled()
})

test('getTitle sends only bounded plain-text copies of the opening exchange', async () => {
  const { generate } = mockTitleModel()
  const user = Message.fromJson({
    role: 'user', content: '旅'.repeat(4100),
    attachments: [{ url: '/private/screenshot.png', content: 'private image bytes' }],
    expert: { name: 'Private expert', prompt: 'Private expert instructions' },
    skill: { id: 'private-skill', name: 'Private skill', instructions: 'Private skill instructions' },
  })
  const assistant = Message.fromJson({
    role: 'assistant', content: '<tool id="lookup"></tool>' + '海'.repeat(4100),
    reasoning: 'Private reasoning',
    toolCalls: [{ id: 'lookup', function: 'search', result: 'Private tool output' }],
  })
  const uiOnly = new Message('user', 'Internal UI text')
  uiOnly.uiOnly = true
  const thread = [
    new Message('assistant', 'An earlier assistant message'),
    new Message('system', 'Private system instructions'),
    uiOnly, user,
    new Message('assistant', '<tool id="lookup"></tool>'),
    assistant, new Message('user', 'Do not include this later turn'),
  ]
  const original = JSON.stringify(thread)

  await new LlmUtils(config).getTitle(thread)

  const messages = generate.mock.calls[0][1] as Message[]
  expect(messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
  expect(messages[1].content).toBe('旅'.repeat(4000))
  expect(messages[2].content).toBe('海'.repeat(4000))
  expect(messages[1]).not.toBe(user)
  expect(messages[2]).not.toBe(assistant)
  for (const message of messages) {
    expect(message.attachments).toEqual([])
    expect(message.toolCalls).toEqual([])
    expect(message.expert).toBeUndefined()
    expect(message.skill).toBeUndefined()
    expect(message.reasoning).toBeFalsy()
  }
  expect(generate.mock.calls[0][2]).toMatchObject({ tools: false, toolCallsInThread: false, reasoning: false, thinkingBudget: 0 })
  expect(JSON.stringify(thread)).toBe(original)
})

test('getTitle can summarize an image-only opening using the assistant text without sending the image', async () => {
  const { generate } = mockTitleModel('海边落日')
  const user = new Message('user', '')
  user.setImage('data:image/png;base64,private-image')

  const title = await new LlmUtils(config).getTitle([user, new Message('assistant', '图片显示海边的落日。')])

  expect(title).toBe('海边落日')
  const messages = generate.mock.calls[0][1] as Message[]
  expect(messages[1].content).toBe('')
  expect(messages[1].type).toBe('text')
  expect(messages[2].content).toBe('图片显示海边的落日。')
  expect(JSON.stringify(messages)).not.toContain('private-image')
})

test.each([
  { thread: [] },
  { thread: [new Message('system', 'Only system text')] },
  { thread: [new Message('user', ''), new Message('assistant', '')] },
])('getTitle skips exchanges without usable conversation text: $thread', async ({ thread }) => {
  const { generate } = mockTitleModel()

  expect(await new LlmUtils(config).getTitle(thread)).toBeNull()
  expect(generate).not.toHaveBeenCalled()
})

test('getTitle removes reasoning, markup, prefixes, quotes, and line breaks', async () => {
  mockTitleModel('<think>Private reasoning</think>\n# <b>Title:</b> “北京\n周末游”')

  expect(await new LlmUtils(config).getTitle([new Message('user', '北京周末去哪？')])).toBe('北京 周末游')
})

test('getTitle limits long results to 60 Unicode code points without splitting emoji', async () => {
  mockTitleModel('🌊'.repeat(70))

  expect(await new LlmUtils(config).getTitle([new Message('user', 'A coastal trip')])).toBe('🌊'.repeat(60))
})

test.each(['', '   ', '<think>Only reasoning</think>', '<think>Unfinished reasoning', '**Title:** ""'])('getTitle returns null for unusable output: %s', async (output) => {
  mockTitleModel(output)

  expect(await new LlmUtils(config).getTitle([new Message('user', 'A very long prompt that should not become the title')])).toBeNull()
})

test('getTitle returns null when the default model request fails', async () => {
  const { generate } = mockTitleModel()
  generate.mockImplementation(() => { throw new Error('Provider unavailable') })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(await new LlmUtils(config).getTitle([new Message('user', 'A coastal trip')])).toBeNull()
})

test('complete collects content chunks into a string', async () => {
  const llm = mockLlmEngine([
    { type: 'content', text: 'Hello', done: false },
    { type: 'content', text: ' World', done: true },
  ])
  const result = await LlmUtils.complete(llm, { id: 'test' } as any, [])
  expect(result).toBe('Hello World')
})

test('complete ignores non-content chunks', async () => {
  const llm = mockLlmEngine([
    { type: 'content', text: 'Hello', done: false },
    { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 5 } },
    { type: 'tool', id: '1', name: 'test', state: 'completed', done: true },
    { type: 'content', text: ' World', done: true },
  ])
  const result = await LlmUtils.complete(llm, { id: 'test' } as any, [])
  expect(result).toBe('Hello World')
})

test('complete returns empty string for no content', async () => {
  const llm = mockLlmEngine([
    { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 0 } },
  ])
  const result = await LlmUtils.complete(llm, { id: 'test' } as any, [])
  expect(result).toBe('')
})

test('complete trims whitespace', async () => {
  const llm = mockLlmEngine([
    { type: 'content', text: '  Hello World  ', done: true },
  ])
  const result = await LlmUtils.complete(llm, { id: 'test' } as any, [])
  expect(result).toBe('Hello World')
})

test('complete skips chunks with empty text', async () => {
  const llm = mockLlmEngine([
    { type: 'content', text: 'Hello', done: false },
    { type: 'content', text: '', done: false },
    { type: 'content', text: ' World', done: true },
  ])
  const result = await LlmUtils.complete(llm, { id: 'test' } as any, [])
  expect(result).toBe('Hello World')
})

test('queryDocRepos returns empty for no docrepos', async () => {
  const result = await LlmUtils.queryDocRepos(config, [], 'test query')
  expect(result.sources).toEqual([])
  expect(result.context).toBe('instructions.chat.docrepoNoResults')
})

test('queryDocRepos returns no results message when query returns empty', async () => {
  window.api.docrepo.query = vi.fn(() => Promise.resolve([]))
  const result = await LlmUtils.queryDocRepos(config, ['repo1'], 'test query')
  expect(result.sources).toEqual([])
  expect(result.context).toBe('instructions.chat.docrepoNoResults')
})

test('queryDocRepos queries single docrepo', async () => {
  const result = await LlmUtils.queryDocRepos(config, ['repo1'], 'test query')

  expect(window.api.docrepo.query).toHaveBeenCalledTimes(1)
  expect(window.api.docrepo.query).toHaveBeenCalledWith('repo1', 'test query')
  expect(result.sources).toHaveLength(2)
})

test('queryDocRepos queries multiple docrepos in parallel', async () => {
  const result = await LlmUtils.queryDocRepos(config, ['repo1', 'repo2'], 'test query')

  expect(window.api.docrepo.query).toHaveBeenCalledTimes(2)
  expect(window.api.docrepo.query).toHaveBeenCalledWith('repo1', 'test query')
  expect(window.api.docrepo.query).toHaveBeenCalledWith('repo2', 'test query')
  expect(result.sources).toHaveLength(4)
})

test('queryDocRepos sorts results by RRF score', async () => {
  const result = await LlmUtils.queryDocRepos(config, ['repo1', 'repo2'], 'test query')

  // With RRF, rank within each source matters more than raw scores
  // repo1: [0.8 (rank 1), 0.6 (rank 2)]
  // repo2: [0.9 (rank 1), 0.5 (rank 2)]
  // RRF scores: rank 1 = 1/(60+1) ≈ 0.0164, rank 2 = 1/(60+2) ≈ 0.0161
  // Top-ranked items from each repo come first (tied RRF), then second-ranked items
  const rrfScores = result.sources.map(s => s.rrfScore)
  expect(rrfScores[0]).toBeCloseTo(1/61, 5) // rank 1 from first processed repo
  expect(rrfScores[1]).toBeCloseTo(1/61, 5) // rank 1 from second processed repo
  expect(rrfScores[2]).toBeCloseTo(1/62, 5) // rank 2
  expect(rrfScores[3]).toBeCloseTo(1/62, 5) // rank 2
})

test('queryDocRepos formats context with titles', async () => {
  const result = await LlmUtils.queryDocRepos(config, ['repo1', 'repo2'], 'test query')

  // Context should contain all sources with their titles
  expect(result.context).toContain('[Source: Doc A]')
  expect(result.context).toContain('Content from repo1')
  expect(result.context).toContain('[Source: Doc C]')
  expect(result.context).toContain('Content from repo2')
  expect(result.context).toContain('---')
})

test('queryDocRepos emits tool call status when callback provided', async () => {
  const statusCalls: LlmChunkTool[] = []
  const response = new Message('assistant', '')

  await LlmUtils.queryDocRepos(config, ['repo1', 'repo2'], 'test query', {
    response,
    onToolCallStatus: (toolCall) => statusCalls.push(toolCall)
  })

  // Should have 4 status calls: 2 running + 2 completed
  expect(statusCalls).toHaveLength(4)

  // First two should be running
  expect(statusCalls[0].state).toBe('running')
  expect(statusCalls[1].state).toBe('running')

  // Last two should be completed (order may vary due to parallel execution)
  const completedCalls = statusCalls.filter(c => c.state === 'completed')
  expect(completedCalls).toHaveLength(2)
  expect(completedCalls[0].call.result).toBeDefined()
  expect(completedCalls[1].call.result).toBeDefined()
})

test('queryDocRepos adds tool calls to response message', async () => {
  const response = new Message('assistant', '')

  await LlmUtils.queryDocRepos(config, ['repo1'], 'test query', {
    response,
    onToolCallStatus: () => {}
  })

  // Response should have tool calls added
  expect(response.toolCalls).toBeDefined()
  expect(response.toolCalls!.length).toBeGreaterThan(0)
})

test('queryDocRepos works without callback (simple mode)', async () => {
  const result = await LlmUtils.queryDocRepos(config, ['repo1', 'repo2'], 'test query')

  // Should still work and return results
  expect(result.sources).toHaveLength(4)
  expect(result.context).toBeTruthy()
})

test('queryDocRepos uses fallback name for unknown docrepo', async () => {
  window.api.docrepo.list = vi.fn(() => []) // Empty list
  window.api.docrepo.query = vi.fn(() => Promise.resolve([
    { content: 'Content', score: 0.5, metadata: { uuid: '1', title: 'Doc', type: 'text', url: 'url' } as any }
  ]))

  const statusCalls: LlmChunkTool[] = []
  await LlmUtils.queryDocRepos(config, ['unknown-repo'], 'test query', {
    onToolCallStatus: (toolCall) => statusCalls.push(toolCall)
  })

  // Should use fallback name in params
  expect(statusCalls[0].call.params.docRepoName).toBe('Knowledge Base')
})

test('getSystemInstructions injects skills catalog when skills plugin is enabled', () => {
  config.plugins.skills.enabled = true
  window.api.skills.list = vi.fn(() => [
    { id: 'skill_111111111111', name: 'Alpha', description: 'First skill', rootPath: '/tmp/alpha', skillMdPath: '/tmp/alpha/SKILL.md' },
    { id: 'skill_222222222222', name: 'Beta', description: 'Second skill', rootPath: '/tmp/beta', skillMdPath: '/tmp/beta/SKILL.md' },
  ])

  const llmUtils = new LlmUtils(config)
  const instructions = llmUtils.getSystemInstructions('Base instructions')

  expect(window.api.skills.list).toHaveBeenCalledWith(config.workspaceId)
  expect(instructions).toContain('instructions.capabilities.skills')
})
