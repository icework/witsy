import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ChatAgent } from '../types/chat_agent'

const file = () => path.join(app.getPath('userData'), 'chat-agents.json')
export const listChatAgents = (): ChatAgent[] => fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(), 'utf8')) : []

export const saveChatAgent = (input: ChatAgent): ChatAgent => {
  if (!input.name?.trim() || !['native', 'hermes', 'opencode'].includes(input.kind)) throw new Error('Enter an agent name and runtime.')
  const agent: ChatAgent = { id: input.id || crypto.randomUUID(), name: input.name.trim(), description: input.description?.trim(), kind: input.kind }
  if (input.kind === 'native') {
    if (!input.native?.engine || !input.native.model) throw new Error('Choose a Native provider and model.')
    agent.native = { engine: input.native.engine, model: input.native.model, instructions: input.native.instructions, tools: input.native.tools ?? null, modelOpts: input.native.modelOpts }
  } else {
    const b = input.binding
    if (!b?.connectionId || b.kind !== input.kind) throw new Error('Choose a matching runtime connection.')
    // A saved Agent is a template, never a remote conversation or credential container.
    agent.binding = { connectionId: b.connectionId, kind: b.kind, profile: b.kind === 'hermes' ? b.profile || 'default' : undefined, agent: b.kind === 'opencode' ? b.agent : undefined, provider: b.provider, model: b.model, directory: b.kind === 'opencode' ? b.directory : undefined }
  }
  const agents = listChatAgents().filter(a => a.id !== agent.id)
  agents.push(agent)
  fs.writeFileSync(file(), JSON.stringify(agents, null, 2), { mode: 0o600 })
  return agent
}
export const removeChatAgent = (id: string) => fs.writeFileSync(file(), JSON.stringify(listChatAgents().filter(a => a.id !== id), null, 2), { mode: 0o600 })
