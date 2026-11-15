import type { SessionLog } from '../shared/model.ts'
import type { NormalEvent } from './events.ts'
import { normalizerOf } from './normalize.ts'

/**
 * One of Claude's conversations held by a session. A session starts in one and moves to another on `/clear`
 * (or an in-session `/resume`), under the runtime's id for it.
 */
export type Conversation = {
  id: string
  /** Seconds since the session's start. */
  at: number
  /** It continues a conversation saved before this session. */
  resumed: boolean
  /** Claude saves a conversation with its first prompt; a resumed one was saved before. Only a saved one can be resumed. */
  saved: boolean
  /** The user's latest prompt in this session, and Claude's latest answer to the main loop. */
  prompt?: string
  answer?: string
}

/** Prompts the user gave: typed at the terminal, or sent through Remote Control. Notifications, peers and schedules are not. */
export const USER_ORIGINS = new Set(['composer', 'bridge'])

const withLatest = (conversations: Conversation[], change: Partial<Conversation>): Conversation[] =>
  conversations.length ? [...conversations.slice(0, -1), { ...conversations.at(-1)!, ...change }] : conversations

/** A compaction ends under the conversation it compacted: only a new id is a new conversation. */
const enter = (conversations: Conversation[], id: string, at: number, resumed: boolean): Conversation[] =>
  conversations.at(-1)?.id === id ? conversations : [...conversations, { id, at, resumed, saved: resumed }]

export const conversationsAfter = (conversations: Conversation[], [t, code, data]: NormalEvent): Conversation[] => {
  if (code !== 'e') return conversations
  switch (data.t) {
    case 'conversation.entered':
      return enter(conversations, data.id, t, data.resumed)
    case 'compaction.ended':
      return enter(conversations, data.conversation, t, false)
    case 'prompt.accepted':
      return withLatest(conversations, { saved: true })
    case 'prompt':
      return USER_ORIGINS.has(data.origin) ? withLatest(conversations, { prompt: data.text }) : conversations
    case 'turn.ended':
      return data.agent === undefined && data.answer ? withLatest(conversations, { answer: data.answer }) : conversations
    default:
      return conversations
  }
}

export const conversationsOf = ({ header, events }: SessionLog): Conversation[] => events.flatMap(normalizerOf(header)).reduce(conversationsAfter, [])

/** The conversation a resume would continue: the latest one Claude saved. */
export const latestSaved = (conversations: Conversation[]): Conversation | undefined => conversations.findLast((c) => c.saved)
