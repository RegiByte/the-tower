import type { SessionLog } from '../shared/model.ts'
import { continuations, lineage, namer, resumes, threads, type SessionRef, type Thread } from './chains.ts'
import { USER_ORIGINS, type Conversation } from './conversation.ts'
import type { Session } from './facts.ts'

/** What the user asked and Claude's latest answer in the turn that followed; no answer while Claude still works on it. */
export type Turn = { startedAt: number; prompt: string; answer?: string }

/** A session of a worker's lineage: its id, its worker's callsign, and when it started (epoch ms). */
export type BriefSession = SessionRef & { startedAt: number }

/** A saved conversation with its last turns, oldest first, and the session that holds it. */
export type Brief = Thread & { turns: Turn[]; session: BriefSession }

type Tally = { current?: string; byConversation: Record<string, Turn[]> }

const tallied = (tally: Tally, id: string, change: (turns: Turn[]) => Turn[]): Tally => ({
  ...tally,
  byConversation: { ...tally.byConversation, [id]: change(tally.byConversation[id] ?? []) },
})

/** Every conversation of one session's log with its turns: a turn opens on a prompt the user gave and takes the latest main-loop answer until the next. */
export const turnsByConversation = ({ header, events }: SessionLog): Record<string, Turn[]> =>
  events.reduce<Tally>((tally, [t, code, data]) => {
    if (code !== 'h') return tally
    const startedAt = header.startedAt + t * 1000
    switch (data.hook_event_name) {
      case 'SessionStart':
        return { ...tally, current: String(data.session_id) }
      case 'prompt.submit':
        return tally.current && USER_ORIGINS.has((data.origin as { kind: string }).kind)
          ? tallied(tally, tally.current, (turns) => [...turns, { startedAt, prompt: String(data.text) }])
          : tally
      case 'turn.complete':
        return tally.current && data.agentId === undefined && data.answer
          ? tallied(tally, tally.current, (turns) => (turns.length ? [...turns.slice(0, -1), { ...turns.at(-1)!, answer: String(data.answer) }] : turns))
          : tally
      default:
        return tally
    }
  }, { byConversation: {} }).byConversation

/**
 * The last `count` turns of a conversation, oldest first. A resumed conversation goes on from the session it resumed:
 * that session's log is read only when this one's own turns fall short.
 */
export const lastTurns = (session: Session, conversation: Conversation, sessions: Session[], logOf: (id: string) => SessionLog, count: number): Turn[] => {
  const own = (turnsByConversation(logOf(session.header.id))[conversation.id] ?? []).slice(-count)
  const source = own.length < count ? resumes(session, conversation, sessions) : undefined
  const earlier = source ? lastTurns(source, source.facts.conversations.findLast((c) => c.id === conversation.id)!, sessions, logOf, count - own.length) : []
  return [...earlier, ...own]
}

/**
 * Every saved conversation of the worker `session` ran as, up to it: its own first, then each earlier session's, the
 * latest session first; a session's conversations in order. `callsign`: a session id's (`callsignsOf`).
 */
export const briefOf = (session: Session, sessions: Session[], logOf: (id: string) => SessionLog, count: number, callsign: (id: string) => string): Brief[] => {
  const continued = continuations(sessions)
  const nameOf = namer(continued, callsign)
  return lineage(session, (s) => continued.get(s)).toReversed().flatMap((s) => {
    const ref: BriefSession = { id: s.header.id, callsign: nameOf(s), startedAt: s.header.startedAt }
    return threads(s, sessions, nameOf).map((thread) => ({ ...thread, session: ref, turns: lastTurns(s, thread, sessions, logOf, count) }))
  })
}
