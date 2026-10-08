import type { LogEvent, SessionLog } from '../shared/model.ts'

/**
 * One of Claude's conversations held by a session. A session starts in one and moves to another on `/clear`
 * (or an in-session `/resume`); the id is the `session_id` of Claude's classic hooks, which mod events don't carry.
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

/** `SessionStart` comes again on `/compact` under the same id: only a new id is a new conversation. */
const enter = (conversations: Conversation[], id: string, at: number, resumed: boolean): Conversation[] =>
  conversations.at(-1)?.id === id ? conversations : [...conversations, { id, at, resumed, saved: resumed }]

export const conversationsAfter = (conversations: Conversation[], [t, code, data]: LogEvent): Conversation[] => {
  if (code !== 'h') return conversations
  switch (data.hook_event_name) {
    case 'SessionStart':
      return enter(conversations, String(data.session_id), t, data.source === 'resume')
    case 'UserPromptSubmit':
      return withLatest(conversations, { saved: true })
    case 'prompt.submit': {
      const origin = data.origin as { kind: string }
      return USER_ORIGINS.has(origin.kind) ? withLatest(conversations, { prompt: String(data.text) }) : conversations
    }
    case 'turn.complete':
      return data.agentId === undefined && data.answer ? withLatest(conversations, { answer: String(data.answer) }) : conversations
    default:
      return conversations
  }
}

export const conversationsOf = ({ events }: SessionLog): Conversation[] => events.reduce(conversationsAfter, [])

/** The conversation a resume would continue: the latest one Claude saved. */
export const latestSaved = (conversations: Conversation[]): Conversation | undefined => conversations.findLast((c) => c.saved)
