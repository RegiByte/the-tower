import type { SessionLog } from '../shared/model.ts'
import { continuations, lineage, namer, resumes, threads, type SessionRef, type Thread } from './chains.ts'
import { USER_ORIGINS, type Conversation } from './conversation.ts'
import { digestOf, type Session } from './facts.ts'
import { delivered, receipts } from './messages.ts'

/** The worker that sent a prompt: its callsign, and its session when the tower ran it. */
export type PeerFrom = { callsign: string; session?: string }

/**
 * What the user asked, or another worker sent (`from`), and Claude's latest answer in the turn that followed, with when
 * each was given (epoch ms); no answer while Claude still works on it.
 */
export type Turn = { startedAt: number; prompt: string; from?: PeerFrom; answer?: string; answeredAt?: number }

/** A session of a worker's lineage: its id, its worker's callsign, and when it started (epoch ms). */
export type BriefSession = SessionRef & { startedAt: number }

/** A saved conversation with its last turns, oldest first, and the session that holds it. */
export type Brief = Thread & { turns: Turn[]; session: BriefSession }

type Tally = { current?: string; byConversation: Record<string, Turn[]> }

const tallied = (tally: Tally, id: string, change: (turns: Turn[]) => Turn[]): Tally => ({
  ...tally,
  byConversation: { ...tally.byConversation, [id]: change(tally.byConversation[id] ?? []) },
})

/** A turn a prompt opens: one the user gave, or a message from another Claude session, named by its sender's peer name. */
const opened = (kind: string, text: string, at: number): Turn | undefined => {
  if (USER_ORIGINS.has(kind)) return { startedAt: at, prompt: text }
  const message = kind === 'peer' ? delivered(text) : undefined
  return message && { startedAt: at, prompt: message.text, from: { callsign: message.name } }
}

/**
 * Every conversation of one session's log with its turns: a turn opens on a prompt the user gave or another worker
 * sent, and takes the latest main-loop answer until the next.
 */
export const turnsByConversation = ({ header, events }: SessionLog): Record<string, Turn[]> =>
  events.reduce<Tally>((tally, [t, code, data]) => {
    if (code !== 'h') return tally
    const at = header.startedAt + t * 1000
    switch (data.hook_event_name) {
      case 'SessionStart':
        return { ...tally, current: String(data.session_id) }
      case 'prompt.submit': {
        const turn = tally.current ? opened((data.origin as { kind: string }).kind, String(data.text), at) : undefined
        return turn ? tallied(tally, tally.current!, (turns) => [...turns, turn]) : tally
      }
      case 'turn.complete':
        return tally.current && data.agentId === undefined && data.answer
          ? tallied(tally, tally.current, (turns) => (turns.length ? [...turns.slice(0, -1), { ...turns.at(-1)!, answer: String(data.answer), answeredAt: at }] : turns))
          : tally
      default:
        return tally
    }
  }, { byConversation: {} }).byConversation

/** A turn of `session` as its sender is known: `sender` names the session that sent a message `session` received. */
type Senders = (session: Session, turn: Turn) => PeerFrom | undefined

/**
 * The last `count` turns of a conversation, oldest first. A resumed conversation goes on from the session it resumed:
 * that session's log is read only when this one's own turns fall short.
 */
export const lastTurns = (session: Session, conversation: Conversation, sessions: Session[], logOf: (id: string) => SessionLog, count: number, sender: Senders): Turn[] => {
  const own = (turnsByConversation(logOf(session.header.id))[conversation.id] ?? []).slice(-count).map((turn) => (turn.from ? { ...turn, from: sender(session, turn) ?? turn.from } : turn))
  const source = own.length < count ? resumes(session, conversation, sessions) : undefined
  const earlier = source ? lastTurns(source, source.facts.conversations.findLast((c) => c.id === conversation.id)!, sessions, logOf, count - own.length, sender) : []
  return [...earlier, ...own]
}

/** The session that sent a message a session received: the latest receipt of its text before Claude took it. */
const sendersOf = (sessions: Session[], nameOf: (s: Session) => string): Senders => {
  const received = receipts(sessions)
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  return (session, turn) => {
    const digest = digestOf(turn.prompt)
    const receipt = received.get(session.header.id)?.findLast((r) => r.digest === digest && r.at <= turn.startedAt)
    const from = receipt && byId.get(receipt.from)
    return from && { callsign: nameOf(from), session: from.header.id }
  }
}

/**
 * Every saved conversation of the worker `session` ran as, up to it: its own first, then each earlier session's, the
 * latest session first; a session's conversations in order. `callsign`: a session id's (`callsignsOf`).
 */
export const briefOf = (session: Session, sessions: Session[], logOf: (id: string) => SessionLog, count: number, callsign: (id: string) => string): Brief[] => {
  const continued = continuations(sessions)
  const nameOf = namer(continued, callsign)
  const sender = sendersOf(sessions, nameOf)
  return lineage(session, (s) => continued.get(s)).toReversed().flatMap((s) => {
    const ref: BriefSession = { id: s.header.id, callsign: nameOf(s), startedAt: s.header.startedAt }
    return threads(s, sessions, nameOf).map((thread) => ({ ...thread, session: ref, turns: lastTurns(s, thread, sessions, logOf, count, sender) }))
  })
}
