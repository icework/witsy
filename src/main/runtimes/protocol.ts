import { RuntimeBinding, RuntimeConnection } from '../../types/runtime'

export function runtimeURL(connection: RuntimeConnection, binding: RuntimeBinding, route: string): string {
  const url = new URL(connection.endpoint)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP(S) server URL without credentials, query or fragment.')
  }
  let prefix = url.pathname.replace(/\/$/, '')
  if (connection.kind === 'hermes' && binding.profile) {
    if (!/^[\w-]+$/.test(binding.profile)) throw new Error('Invalid Hermes profile name.')
    prefix += `/p/${encodeURIComponent(binding.profile)}`
  }
  const [routePath, query] = route.split('?')
  url.pathname = prefix + routePath
  url.search = query || ''
  if (connection.kind === 'opencode' && binding.directory) url.searchParams.set('directory', binding.directory)
  return url.toString()
}

// SSE can split a UTF-8 character, JSON object, or CRLF across network chunks.
export async function consumeSSE(response: Response, receive: (event: any) => void): Promise<void> {
  if (!response.body) throw new Error('The runtime did not return an event stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let data: string[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      let newline: number
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '')
        pending = pending.slice(newline + 1)
        if (!line) {
          if (data.length) {
            const body = data.join('\n')
            data = []
            if (body !== '[DONE]') receive(JSON.parse(body))
          }
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
        }
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export const terminalRun = (status: string): boolean => ['completed', 'failed', 'cancelled'].includes(status)
