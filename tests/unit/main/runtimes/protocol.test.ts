import { expect, test } from 'vitest'
import { consumeSSE, runtimeURL } from '@main/runtimes/protocol'

test('routes a Hermes profile explicitly and never sends a working directory', () => {
  expect(runtimeURL({ id: 'h', name: 'Hermes', kind: 'hermes', endpoint: 'http://localhost:8642' }, { connectionId: 'h', kind: 'hermes', profile: 'research', directory: '/private' }, '/v1/runs')).toBe('http://localhost:8642/p/research/v1/runs')
})
test('encodes an OpenCode directory independently from the route', () => {
  const url = new URL(runtimeURL({ id: 'o', name: 'OpenCode', kind: 'opencode', endpoint: 'http://localhost:4096' }, { connectionId: 'o', kind: 'opencode', directory: '/tmp/a & b' }, '/session'))
  expect(url.searchParams.get('directory')).toBe('/tmp/a & b')
  expect(url.pathname).toBe('/session')
})
test('rejects credentials in URLs and profile path traversal', () => {
  const c = { id: 'h', name: 'h', kind: 'hermes' as const, endpoint: 'http://localhost:8642' }
  expect(() => runtimeURL(c, { connectionId: 'h', kind: 'hermes', profile: '../default' }, '/v1/runs')).toThrow()
  expect(() => runtimeURL({ ...c, endpoint: 'http://secret@localhost' }, { connectionId: 'h', kind: 'hermes' }, '/')).toThrow()
})
test('decodes SSE across arbitrary byte boundaries without losing Unicode', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\ndata: {"event":"message.delta","delta":"你好"}\r\n\r\ndata: [DONE]\n\n')
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
  const events: any[] = []
  await consumeSSE(new Response(stream), event => events.push(event))
  expect(events).toEqual([{ event: 'message.delta', delta: '你好' }])
})
