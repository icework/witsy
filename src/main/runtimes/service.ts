import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { RuntimeBinding, RuntimeCatalog, RuntimeCatalogOptions, RuntimeConnection, RuntimeModelVisibility, RuntimeRun } from '../../types/runtime'
import { consumeSSE, runtimeURL, terminalRun } from './protocol'
import { hermesCatalog, normalizeVisibility, opencodeCatalog, visibleCatalog } from './catalog'

type SavedConnection = RuntimeConnection & { encryptedSecret?: string }
type Execution = { run: RuntimeRun; connection: SavedConnection; owner: number; controller: AbortController; publish: (run: RuntimeRun) => void }

export class RuntimeService {
  private executions = new Map<string, Execution>()
  private catalogs = new Map<string, { expires: number; promise: Promise<RuntimeCatalog> }>()
  private file = () => path.join(app.getPath('userData'), 'runtime-connections.json')
  private connections(): SavedConnection[] {
    if (!fs.existsSync(this.file())) return []
    return JSON.parse(fs.readFileSync(this.file(), 'utf8'))
  }
  list(): RuntimeConnection[] {
    return this.connections().map(({ encryptedSecret, ...c }) => ({ ...c, hasSecret: !!encryptedSecret }))
  }
  save(input: RuntimeConnection, secret?: string, localProfile?: string): RuntimeConnection {
    if (!['hermes', 'opencode'].includes(input.kind)) throw new Error('Unknown runtime.')
    runtimeURL(input, { connectionId: input.id, kind: input.kind }, '/')
    const connections = this.connections()
    const previous = connections.find(c => c.id === input.id)
    // Import only after an explicit user action, and only for a loopback Hermes connection.
    if (localProfile !== undefined) {
      const hostname = new URL(input.endpoint).hostname
      if (input.kind !== 'hermes' || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw new Error('Local credentials require a local Hermes server.')
      if (!/^[\w-]+$/.test(localProfile)) throw new Error('Invalid profile name.')
      const home = path.join(os.homedir(), '.hermes', ...(localProfile === 'default' ? [] : ['profiles', localProfile]))
      const env = fs.readFileSync(path.join(home, '.env'), 'utf8')
      secret = env.match(/^\s*(?:export\s+)?API_SERVER_KEY\s*=\s*(.+?)\s*$/m)?.[1]?.replace(/^(['"])(.*)\1$/, '$2')
      if (!secret) throw new Error('This profile has no API_SERVER_KEY in its .env file.')
    }
    const next: SavedConnection = { id: input.id || crypto.randomUUID(), name: input.name.trim() || input.kind, kind: input.kind, endpoint: input.endpoint.replace(/\/$/, ''), defaultProfile: input.kind === 'hermes' ? input.defaultProfile || 'default' : undefined }
    // Connection edits and stale renderer drafts must not overwrite visibility preferences.
    if (previous?.modelVisibility) next.modelVisibility = previous.modelVisibility
    // Never carry credentials to an edited endpoint automatically.
    if (previous?.endpoint === next.endpoint && previous.kind === next.kind) next.encryptedSecret = previous.encryptedSecret
    if (secret) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS secure credential storage is unavailable.')
      next.encryptedSecret = safeStorage.encryptString(secret).toString('base64')
    }
    const index = connections.findIndex(c => c.id === next.id)
    if (index === -1) connections.push(next)
    else connections[index] = next
    fs.writeFileSync(this.file(), JSON.stringify(connections, null, 2), { mode: 0o600 })
    this.catalogs.clear()
    return this.list().find(c => c.id === next.id)!
  }
  setModelVisibility(connectionId: string, visibility: RuntimeModelVisibility): RuntimeConnection {
    const connections = this.connections()
    const connection = connections.find(c => c.id === connectionId)
    if (!connection) throw new Error('Runtime connection is missing.')
    connection.modelVisibility = normalizeVisibility(visibility)
    fs.writeFileSync(this.file(), JSON.stringify(connections, null, 2), { mode: 0o600 })
    return this.list().find(c => c.id === connectionId)!
  }
  private connection(binding: RuntimeBinding): SavedConnection {
    const c = this.connections().find(c => c.id === binding.connectionId)
    if (!c || c.kind !== binding.kind) throw new Error('Runtime connection is missing. Configure it again.')
    return c
  }
  private async request(c: SavedConnection, b: RuntimeBinding, route: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (c.encryptedSecret) {
      const secret = safeStorage.decryptString(Buffer.from(c.encryptedSecret, 'base64'))
      headers.Authorization = c.kind === 'hermes' ? `Bearer ${secret}` : `Basic ${Buffer.from(`opencode:${secret}`).toString('base64')}`
    }
    const response = await fetch(runtimeURL(c, b, route), { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(15000), redirect: 'error' })
    if (!response.ok) throw new Error(`${c.name}: HTTP ${response.status} on ${route}. ${response.status === 401 || response.status === 403 ? 'Check the connection credentials and profile.' : 'Check the runtime service and selected profile/agent.'}`)
    return response
  }
  private async json(c: SavedConnection, b: RuntimeBinding, route: string, body?: unknown): Promise<any> {
    const response = await this.request(c, b, route, body)
    return response.status === 204 ? null : response.json()
  }
  async catalog(binding: RuntimeBinding, options: RuntimeCatalogOptions = {}): Promise<RuntimeCatalog> {
    const c = this.connection(binding)
    const target = { ...binding, ...(c.kind === 'hermes' ? { profile: binding.profile || c.defaultProfile || 'default' } : {}) }
    const key = JSON.stringify([c.id, c.endpoint, target.profile, target.directory])
    let cached = this.catalogs.get(key)
    if (!cached || cached.expires < Date.now() || options.refresh) {
      const promise = this.loadCatalog(c, target, options.refresh)
      cached = { expires: Date.now() + 30000, promise }
      this.catalogs.set(key, cached)
      void promise.catch(() => { if (this.catalogs.get(key)?.promise === promise) this.catalogs.delete(key) })
    }
    const catalog = await cached.promise
    return options.includeHidden ? catalog : visibleCatalog(catalog, this.connection(binding).modelVisibility)
  }
  private async loadCatalog(c: SavedConnection, binding: RuntimeBinding, refresh = false): Promise<RuntimeCatalog> {
    if (c.kind === 'hermes') {
      let profiles = ['default']
      if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(c.endpoint).hostname)) {
        const folder = path.join(os.homedir(), '.hermes', 'profiles')
        if (fs.existsSync(folder)) profiles = profiles.concat(fs.readdirSync(folder, { withFileTypes: true }).filter(x => x.isDirectory() && !x.name.startsWith('.')).map(x => x.name))
      }
      const payload = await this.json(c, binding, `/api/model/options${refresh ? '?refresh=true' : ''}`)
      return hermesCatalog(payload, profiles)
    }
    const [agents, providers] = await Promise.all([this.json(c, binding, '/agent'), this.json(c, binding, '/provider')])
    return opencodeCatalog(providers, agents)
  }
  get(owner: number, chatId: string): RuntimeRun | null {
    return this.executions.get(`${owner}:${chatId}`)?.run || null
  }
  start(owner: number, chatId: string, binding: RuntimeBinding, text: string, publish: Execution['publish'], images: string[] = []): RuntimeRun {
    if (!Array.isArray(images) || images.length > 4 || images.some(image => !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 8 * 1024 * 1024)) throw new Error('Use up to four PNG or JPEG images, each under 6 MB.')
    if (!text.trim()) throw new Error('Enter a message.')
    const key = `${owner}:${chatId}`
    const existing = this.executions.get(key)
    if (existing && !terminalRun(existing.run.status)) throw new Error('This conversation already has a running task.')
    const c = this.connection(binding)
    const run: RuntimeRun = { chatId, id: crypto.randomUUID(), binding: { ...binding }, status: 'running', text: '', detail: 'Connecting' }
    if (c.kind === 'hermes') delete run.binding.directory
    const execution: Execution = { run, connection: c, owner, controller: new AbortController(), publish }
    this.executions.set(key, execution)
    void this.execute(execution, text, images).catch(error => {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : 'Runtime request failed.'
      run.approval = undefined
      this.changed(execution)
    }).finally(() => execution.controller.abort())
    return structuredClone(run)
  }
  private changed(e: Execution) { e.publish(structuredClone(e.run)) }
  private async execute(e: Execution, text: string, images: string[]): Promise<void> {
    if (e.connection.kind === 'hermes') await this.hermes(e, text, images)
    else await this.opencode(e, text, images)
  }
  private async recoverState(e: Execution, route: string): Promise<any> {
    while (true) {
      try { return await this.json(e.connection, e.run.binding, route) }
      catch {
        e.run.detail = 'Connection interrupted. Reconnecting to the existing task; no new task will be submitted.'
        this.changed(e)
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }
  }
  private async hermes(e: Execution, text: string, images: string[]): Promise<void> {
    const { run: r, connection: c } = e
    const b = r.binding
    const input = images.length ? [{ role: 'user', content: [{ type: 'text', text }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] }] : text
    const created = await this.json(c, b, '/v1/runs', { input, session_id: b.sessionId, provider: b.provider || undefined, model: b.model || undefined })
    r.id = created.run_id
    b.sessionId ||= created.run_id
    this.changed(e)
    // One subscriber in main; status polling also recovers approvals and final results after a dropped stream.
    void this.request(c, b, `/v1/runs/${r.id}/events`, undefined, e.controller.signal).then(response => consumeSSE(response, event => {
      if (terminalRun(r.status)) return
      if (event.event === 'message.delta') r.text += event.delta || ''
      if (event.event === 'tool.started') r.detail = `${event.tool}: ${event.preview || ''}`
      if (event.event === 'tool.completed') r.detail = `${event.tool}: ${event.error ? 'failed' : 'completed'}`
      if (event.event === 'approval.request') this.hermesApproval(e, event)
      this.changed(e)
    })).catch(() => { /* Recover authoritative state below; never resubmit. */ })
    while (!terminalRun(r.status)) {
      const state = await this.recoverState(e, `/v1/runs/${r.id}`)
      if (state.session_id) b.sessionId = state.session_id

      if (state.approval) this.hermesApproval(e, state.approval)
      if (terminalRun(state.status)) {
        try {
          const details = await this.json(c, b, `/api/sessions/${b.sessionId}`)
          b.actualModel = details.session?.model || b.actualModel
        } catch { /* Older servers may not expose session details; retain the requested model. */ }
        r.status = state.status
        r.text = typeof state.output === 'string' ? state.output : r.text
        r.error = state.status === 'failed' ? 'Hermes reported a failed run. Check its service logs.' : undefined
        r.approval = undefined
        r.detail = ''
      }
      this.changed(e)
      if (!terminalRun(r.status)) await new Promise(resolve => setTimeout(resolve, 750))
    }
  }
  private hermesApproval(e: Execution, event: any) {
    e.run.status = 'waiting'
    e.run.approval = { id: event.request_id, description: event.command || event.description || 'Hermes approval', choices: event.choices || ['once', 'deny'] }
  }
  private async opencode(e: Execution, text: string, images: string[]): Promise<void> {
    const { run: r, connection: c } = e
    const b = r.binding
    if (!b.sessionId) {
      const session = await this.json(c, b, '/session', { title: 'Summon conversation' })
      b.sessionId = session.id
      b.directory = session.directory || b.directory
    }
    this.changed(e)
    // Subscribe BEFORE submitting so permission.asked cannot race the client.
    const response = await this.request(c, b, '/event', undefined, e.controller.signal)
    void consumeSSE(response, event => {
      const p = event.properties || {}
      if (terminalRun(r.status) || p.sessionID !== b.sessionId) return
      if (event.type === 'permission.asked') {
        r.status = 'waiting'
        r.approval = { id: p.id, description: `${p.permission}: ${(p.patterns || []).join(', ')}`, choices: ['once', 'always', 'reject'] }
        this.changed(e)
      }
    }).catch(() => { /* Permission-list recovery below may report a server compatibility issue. */ })
    const before = await this.json(c, b, `/session/${b.sessionId}/message`)
    const previous = new Set(before.map((m: any) => m.info.id))
    await this.json(c, b, `/session/${b.sessionId}/prompt_async`, { agent: b.agent || undefined, model: b.model && b.provider ? { providerID: b.provider, modelID: b.model } : undefined, parts: [{ type: 'text', text }, ...images.map(url => ({ type: 'file', mime: url.slice(5, url.indexOf(';')), url }))] })
    while (!terminalRun(r.status)) {
      const messages = await this.recoverState(e, `/session/${b.sessionId}/message`)
      const replies = messages.filter((m: any) => m.info.role === 'assistant' && !previous.has(m.info.id))
      r.text = replies.flatMap((m: any) => m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text)).join('\n\n')
      const last = replies.at(-1)
      if (last) {
        b.actualModel = last.info.modelID || b.actualModel
        b.actualProvider = last.info.providerID || b.actualProvider
        b.agent = last.info.agent || b.agent
        const tool = last.parts.filter((p: any) => p.type === 'tool').at(-1)
        if (tool) r.detail = `${tool.tool}: ${tool.state?.status || ''}`
        if (last.info.error) {
          r.status = last.info.error.name === 'MessageAbortedError' ? 'cancelled' : 'failed'
          r.error = r.status === 'failed' ? 'OpenCode reported a failed message. Check its service logs.' : undefined
        } else if (last.info.time?.completed && last.info.finish && last.info.finish !== 'tool-calls' && last.info.finish !== 'unknown') r.status = 'completed'
      }
      if (!terminalRun(r.status) && !r.approval) {
        try {
          const pending = await this.json(c, b, '/permission')
          const p = pending.find((p: any) => p.sessionID === b.sessionId)
          if (p) { r.status = 'waiting'; r.approval = { id: p.id, description: `${p.permission}: ${(p.patterns || []).join(', ')}`, choices: ['once', 'always', 'reject'] } }
        } catch { r.detail = 'OpenCode approval list unavailable. If progress stops, cancel this run before retrying.' }
      }
      if (terminalRun(r.status)) { r.approval = undefined; r.detail = '' }
      this.changed(e)
      if (!terminalRun(r.status)) await new Promise(resolve => setTimeout(resolve, 750))
    }
  }
  async cancel(owner: number, chatId: string) {
    const e = this.executions.get(`${owner}:${chatId}`)
    if (!e || terminalRun(e.run.status)) return
    const { run: r, connection: c } = e
    if (!r.binding.sessionId) throw new Error('The runtime is still accepting this task. Try Stop again shortly.')
    await this.json(c, r.binding, c.kind === 'hermes' ? `/v1/runs/${r.id}/stop` : `/session/${r.binding.sessionId}/abort`, {})
    r.status = 'stopping'
    r.approval = undefined
    this.changed(e)
  }
  async approve(owner: number, chatId: string, requestId: string, choice: string) {
    const e = this.executions.get(`${owner}:${chatId}`)
    if (!e || e.run.approval?.id !== requestId || !e.run.approval.choices.includes(choice)) throw new Error('This approval is no longer active.')
    const { run: r, connection: c } = e
    await this.json(c, r.binding, c.kind === 'hermes' ? `/v1/runs/${r.id}/approval` : `/permission/${requestId}/reply`, c.kind === 'hermes' ? { request_id: requestId, choice } : { reply: choice })
    r.approval = undefined
    r.status = 'running'
    this.changed(e)
  }
}
