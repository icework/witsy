import { Chat } from 'types/index'
import { Configuration } from 'types/config'
import LlmUtils from './llm_utils'

const pending = new Set<string>()

export const needsSummaryTitle = (chat: Chat): boolean => {
  if (chat.titleSource) return false
  if (!chat.hasTitle()) return true
  // Earlier runtime chats used the first prompt as their automatic title.
  const firstPrompt = chat.messages.find(message => message.role === 'user')?.content.trim()
  return !!chat.runtime && !!firstPrompt && chat.title === firstPrompt.slice(0, 70)
}

export const summarizeChatTitle = async (chat: Chat, config: Configuration): Promise<boolean> => {
  if (pending.has(chat.uuid) || !needsSummaryTitle(chat)) return false
  if (!chat.messages.some(message => message.role === 'assistant' && !message.transient && message.content.trim())) return false

  const previousTitle = chat.title
  const previousSource = chat.titleSource
  pending.add(chat.uuid)
  try {
    const title = await new LlmUtils(config).getTitle(chat.messages)
    // A rename while the model is running always wins.
    if (!title || chat.title !== previousTitle || chat.titleSource !== previousSource) return false
    chat.title = title
    chat.titleSource = 'generated'
    return true
  } catch (error) {
    console.error('Error while summarizing chat title', error)
    return false
  } finally {
    pending.delete(chat.uuid)
  }
}
