import { latestSaved, type Conversation } from './conversation.ts'
import type { Session } from './facts.ts'
import { nameIn } from '../shared/callsign.ts'

const byStart = (a: Session, b: Session) => a.header.startedAt - b.header.startedAt

const holds = (session: Session, id: string) => session.facts.conversations.some((c) => c.saved && c.id === id)

/**
 * A conversation can be resumed again and again, by a chain of sessions or twice from the same one: the link
 * is to the nearest session in time on either side.
 */
export const resumes = (session: Session, conversation: Conversation, sessions: Session[]): Session | undefined =>
  conversation.resumed
    ? sessions.filter((s) => s.header.startedAt < session.header.startedAt && holds(s, conversation.id)).sort(byStart).at(-1)
    : undefined

export const resumedBy = (session: Session, conversation: Conversation, sessions: Session[]): Session | undefined =>
  conversation.saved
    ? sessions
        .filter((s) => s.header.startedAt > session.header.startedAt && s.facts.conversations.some((c) => c.resumed && c.id === conversation.id))
        .sort(byStart)[0]
    : undefined

/**
 * The session this one continues as the same worker: the one whose latest saved conversation it resumed as its
 * first. Resuming any earlier conversation of a session forks a new worker.
 */
export const continues = (session: Session, sessions: Session[]): Session | undefined => {
  const first = session.facts.conversations[0]
  const source = first && resumes(session, first, sessions)
  return source && carriesOn(source, first.id) ? source : undefined
}

/** Resuming this conversation of `source` carries its worker on: it is the latest one Claude saved there. */
export const carriesOn = (source: Session, conversation: string) => latestSaved(source.facts.conversations)?.id === conversation

/** Each session that continues another, to the one it continues. */
export const continuations = (sessions: Session[]): Map<Session, Session> =>
  new Map(sessions.flatMap((s) => {
    const before = continues(s, sessions)
    return before ? [[s, before] as const] : []
  }))

const argOf = (argv: string[], flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)

/** The conversation a session is in: its latest, or, before Claude reports one, the one its argv resumes. */
const inConversation = (session: Session): string | undefined =>
  session.facts.conversations.at(-1)?.id ?? argOf(session.header.argv, '--resume')

/** The name the session's Claude runs under (`resumeName`), from its first moment. */
export const runsAs = (session: Session): string | undefined => argOf(session.header.argv, '--name')

/** The running session already in `conversation`: a second Claude resuming it would write the same transcript. */
export const heldBy = (conversation: string, sessions: Session[], running: Set<string>): Session | undefined =>
  sessions.find((s) => running.has(s.header.id) && inConversation(s) === conversation)

/** The sessions one worker ran as, oldest first, ending with this one. */
export const lineage = (session: Session, before: (s: Session) => Session | undefined): Session[] => {
  const earlier = before(session)
  return earlier ? [...lineage(earlier, before), session] : [session]
}

/**
 * A worker keeps the callsign of its first session: the name that session's Claude ran under, read from its log, so a
 * change to the names callsigns are drawn from renames no one. A log from before sessions were named takes its id's
 * callsign. `before`: the session a session continues. `callsign`: a session id's (`callsignsOf`).
 */
const workerName = (session: Session, before: (s: Session) => Session | undefined, callsign: (id: string) => string) => {
  const [first] = lineage(session, before)
  return runsAs(first) ?? callsign(first.header.id)
}

/**
 * The names, numbers left out, of the workers of sessions `ids`: a new worker's is drawn apart from them (`freshId`).
 * A session whose log isn't read yet was just spawned, and holds its id's callsign.
 */
export const heldNames = (sessions: Session[], ids: ReadonlySet<string>, callsign: (id: string) => string): Set<string> => {
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  return new Set([...ids].map((id) => {
    const session = byId.get(id)
    return nameIn(session ? workerName(session, (s) => continues(s, sessions), callsign) : callsign(id))
  }))
}

/** The name a resume of `conversation` runs under as session `id`: its worker's, or its own on a fork. */
export const resumeName = (source: Session, conversation: string, id: string, sessions: Session[], callsign: (id: string) => string) =>
  carriesOn(source, conversation) ? workerName(source, (s) => continues(s, sessions), callsign) : callsign(id)

/** The conversation's latest prompt and answer: what a resumed session hasn't had yet comes from the session it resumed. */
const latest = (session: Session, conversation: Conversation, sessions: Session[]): Pick<Conversation, 'prompt' | 'answer'> => {
  const source = conversation.prompt && conversation.answer ? undefined : resumes(session, conversation, sessions)
  const earlier = source && latest(source, source.facts.conversations.findLast((c) => c.id === conversation.id)!, sessions)
  return { prompt: conversation.prompt ?? earlier?.prompt, answer: conversation.answer ?? earlier?.answer }
}

/** A session by id, with the callsign of the worker it ran as. */
export type SessionRef = { id: string; callsign: string }

/** A session a conversation came from or went on to, with when it started. */
export type SessionLink = SessionRef & { startedAt: number }

/** The callsign of the worker each session ran as, over the sessions' `continuations`. */
export const namer = (continued: Map<Session, Session>, callsign: (id: string) => string) => (session: Session) =>
  workerName(session, (s) => continued.get(s), callsign)

/** A saved conversation as a session holds it, linked to the sessions it came from and went on to. */
export type Thread = Conversation & { resumes?: SessionLink; resumedBy?: SessionLink }

/** `nameOf`: a session's worker's callsign (`namer`). */
export const threads = (session: Session, sessions: Session[], nameOf: (s: Session) => string): Thread[] =>
  session.facts.conversations
    .filter((c) => c.saved)
    .map((c) => {
      const source = resumes(session, c, sessions)
      const resumer = resumedBy(session, c, sessions)
      const refOf = (s: Session): SessionLink => ({ id: s.header.id, callsign: nameOf(s), startedAt: s.header.startedAt })
      return { ...c, ...latest(session, c, sessions), resumes: source && refOf(source), resumedBy: resumer && refOf(resumer) }
    })
