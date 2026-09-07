import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listChatAgents, removeChatAgent, saveChatAgent } from '@main/chat_agents'
const state = vi.hoisted(() => ({ home: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.home } }))
beforeEach(() => { state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-agent-')) })
afterEach(() => fs.rmSync(state.home, { recursive: true, force: true }))
test('saves Native and external agents together without runtime sessions, credentials or Hermes cwd', () => {
  saveChatAgent({ id: 'n', name: 'Native helper', kind: 'native', native: { engine: 'test', model: 'vision', instructions: 'Be brief', tools: [] } })
  saveChatAgent({ id: 'h', name: 'Research', kind: 'hermes', binding: { kind: 'hermes', connectionId: 'local', profile: 'research', sessionId: 'old-session', actualModel: 'old-model', directory: '/ignored', secret: 'never-save' } as any })
  saveChatAgent({ id: 'o', name: 'Code', kind: 'opencode', binding: { kind: 'opencode', connectionId: 'code', agent: 'plan', directory: '/project' } })
  const agents = listChatAgents()
  expect(agents).toHaveLength(3)
  expect(agents[0].native).toMatchObject({ instructions: 'Be brief', tools: [] })
  expect(agents[1].binding).toEqual({ kind: 'hermes', connectionId: 'local', profile: 'research' })
  expect(JSON.stringify(agents)).not.toContain('never-save')
  expect(agents[2].binding.directory).toBe('/project')
  removeChatAgent('n')
  expect(listChatAgents()).toHaveLength(2)
})
test('editing a saved template does not change an existing conversation snapshot', () => {
  const original = saveChatAgent({ id: 'h', name: 'Research', kind: 'hermes', binding: { kind: 'hermes', connectionId: 'local', profile: 'research' } })
  saveChatAgent({ ...original, binding: { ...original.binding, profile: 'other' } })
  expect(original.binding.profile).toBe('research')
  expect(listChatAgents()[0].binding.profile).toBe('other')
})
