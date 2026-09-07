import { RuntimeBinding, RuntimeConnection } from '../../types/runtime'

// Take a snapshot for a new chat. Later default edits must not change active chats.
export function connectionBinding(connection: RuntimeConnection): RuntimeBinding {
  return {
    kind: connection.kind,
    connectionId: connection.id,
    ...(connection.kind === 'hermes' ? { profile: connection.defaultProfile || 'default' } : {}),
    ...(connection.defaultProvider && connection.defaultModel ? { provider: connection.defaultProvider, model: connection.defaultModel } : {}),
  }
}
