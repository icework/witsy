import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RuntimeService } from '@main/runtimes/service'

const state = vi.hoisted(() => ({ home: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.home }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from('encrypted:' + s), decryptString: (b: Buffer) => b.toString().slice(10) } }))
let service: RuntimeService
beforeEach(() => { state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-runtime-')); service = new RuntimeService(); vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal }) })
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(state.home, { recursive: true, force: true }) })
const connection = { id: 'h', name: 'Hermes', endpoint: 'http://localhost:8642', kind: 'hermes' as const }

test('credentials are omitted from renderer results and are dropped on an endpoint change', () => {
  const saved = service.save(connection, 'test-secret')
  expect(saved).toEqual({ ...connection, defaultProfile: 'default', hasSecret: true })
  expect(JSON.stringify(service.list())).not.toContain('test-secret')
  service.save({ ...connection, endpoint: 'https://example.com' })
  expect(service.list()[0].hasSecret).toBe(false)
})

test('restores a waiting approval from status, rejects wrong IDs and continues the same session', async () => {
  service.save(connection, 'test-secret')
  let resolved = false
  const requests: { url: string; body: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined
    requests.push({ url, body })
    if (url.endsWith('/events')) return new Response('')
    if (url.endsWith('/approval')) { resolved = true; return Response.json({ resolved: 1 }) }
    if (url.endsWith('/v1/runs')) return Response.json({ run_id: 'remote-run' })
    return Response.json(resolved ? { status: 'completed', session_id: 'remote-session', output: 'done' } : { status: 'waiting_for_approval', session_id: 'remote-session', approval: { request_id: 'approval-1', command: 'controlled test', choices: ['once', 'deny'] } })
  }))
  service.start(1, 'chat', { connectionId: 'h', kind: 'hermes', profile: 'research', sessionId: 'existing', directory: '/ignored' }, 'hello', vi.fn())
  await vi.waitFor(() => { expect(service.get(1, 'chat')?.error).toBeUndefined(); expect(service.get(1, 'chat')?.status).toBe('waiting') })
  expect(service.get(2, 'chat')).toBeNull()
  expect(() => service.start(1, 'chat', { connectionId: 'h', kind: 'hermes' }, 'duplicate', vi.fn())).toThrow()
  await expect(service.approve(1, 'chat', 'wrong', 'once')).rejects.toThrow()
  await service.approve(1, 'chat', 'approval-1', 'deny')
  await vi.waitFor(() => expect(service.get(1, 'chat')?.status).toBe('completed'), { timeout: 2000 })
  expect(service.get(1, 'chat')?.text).toBe('done')
  expect(service.get(1, 'chat')?.binding.directory).toBeUndefined()
  const posts = requests.filter(r => r.url.endsWith('/v1/runs'))
  expect(posts).toHaveLength(1)
  expect(posts[0].body.session_id).toBe('existing')
  expect(posts[0].url).toContain('/p/research/')
})

test('OpenCode submits the chosen agent and model to a dedicated session and retains actual metadata', async () => {
  service.save({ id: 'o', kind: 'opencode', name: 'OpenCode', endpoint: 'http://localhost:4096' })
  let submitted = false
  const bodies: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (address: string, init: RequestInit) => {
    const url = new URL(address)
    expect(url.searchParams.get('directory')).toBe('/tmp/test')
    if (url.pathname === '/event') return new Response('')
    if (url.pathname === '/session') return Response.json({ id: 'session-1', directory: '/tmp/test' })
    if (url.pathname.endsWith('/prompt_async')) { submitted = true; bodies.push(JSON.parse(init.body as string)); return new Response(null, { status: 204 }) }
    if (url.pathname.endsWith('/message')) return Response.json(submitted ? [{ info: { id: 'reply', role: 'assistant', agent: 'plan', providerID: 'provider', modelID: 'actual-model', time: { completed: 1 }, finish: 'stop' }, parts: [{ type: 'text', text: 'hello' }] }] : [])
    throw new Error('Unexpected request')
  }))
  const image = 'data:image/png;base64,aGVsbG8='
  service.start(7, 'chat', { connectionId: 'o', kind: 'opencode', agent: 'plan', directory: '/tmp/test', provider: 'provider', model: 'requested-model' }, 'test', vi.fn(), [image])
  await vi.waitFor(() => expect(service.get(7, 'chat')?.status).toBe('completed'))
  expect(bodies).toEqual([{ agent: 'plan', model: { providerID: 'provider', modelID: 'requested-model' }, parts: [{ type: 'text', text: 'test' }, { type: 'file', mime: 'image/png', url: image }] }])
  expect(service.get(7, 'chat')?.binding).toMatchObject({ sessionId: 'session-1', agent: 'plan', model: 'requested-model', actualModel: 'actual-model' })
  expect(service.get(7, 'chat')?.text).toBe('hello')
})

test('Hermes receives image bytes as content parts while retaining the selected profile', async () => {
  service.save(connection)
  const image = 'data:image/png;base64,aGVsbG8='
  let submitted: any
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toContain('/p/research/')
    if (url.endsWith('/events')) return new Response('')
    if (url.endsWith('/v1/runs')) { submitted = JSON.parse(init.body as string); return Response.json({ run_id: 'image-run' }) }
    return Response.json({ status: 'completed', output: 'image answer' })
  }))
  service.start(1, 'image-chat', { kind: 'hermes', connectionId: 'h', profile: 'research' }, 'Explain', vi.fn(), [image])
  await vi.waitFor(() => expect(service.get(1, 'image-chat')?.status).toBe('completed'))
  expect(submitted.input).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Explain' }, { type: 'image_url', image_url: { url: image } }] }])
  expect(() => service.start(1, 'bad', { kind: 'hermes', connectionId: 'h' }, 'Explain', vi.fn(), ['file:///private/test.png'])).toThrow()
})
