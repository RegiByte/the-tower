import { launchOf } from '../shared/launch.ts'
import { latestSaved, type Conversation } from './conversation.ts'
import type { Session } from './facts.ts'

const byStart = (a: Session, b: Session) => a.header.startedAt - b.header.startedAt

/**
 * The sessions of each conversation, by its id, oldest first: those that hold it saved and those that resumed it. Built
 * once over every session, so following a chain looks up a conversation's few sessions rather than reading them all.
 */
export type Chains = { saved: Map<string, Session[]>; resumed: Map<string, Session[]> }

export const chainsOf = (sessions: Session[]): Chains => {
  const by = (holds: (c: Conversation) => boolean | undefined) => {
    const of = new Map<string, Session[]>()
    for (const s of sessions)
      for (const id of new Set(s.facts.conversations.filter(holds).map((c) => c.id))) {
        const held = of.get(id)
        if (held) held.push(s)
        else of.set(id, [s])
      }
    for (const list of of.values()) list.sort(byStart)
    return of
  }
  return { saved: by((c) => c.saved), resumed: by((c) => c.resumed) }
}

/**
 * A conversation can be resumed again and again, by a chain of sessions or twice from the same one: the link
 * is to the nearest session in time on either side.
 */
export const resumes = (session: Session, conversation: Conversation, chains: Chains): Session | undefined =>
  conversation.resumed ? chains.saved.get(conversation.id)?.findLast((s) => s.header.startedAt < session.header.startedAt) : undefined

export const resumedBy = (session: Session, conversation: Conversation, chains: Chains): Session | undefined =>
  conversation.saved ? chains.resumed.get(conversation.id)?.find((s) => s.header.startedAt > session.header.startedAt) : undefined

/**
 * The session this one continues as the same worker: the one whose latest saved conversation it resumed as its
 * first. Resuming any earlier conversation of a session forks a new worker.
 */
export const continues = (session: Session, chains: Chains): Session | undefined => {
  const first = session.facts.conversations[0]
  const source = first && resumes(session, first, chains)
  return source && carriesOn(source, first.id) ? source : undefined
}

/** Resuming this conversation of `source` carries its worker on: it is the latest one Claude saved there. */
export const carriesOn = (source: Session, conversation: string) => latestSaved(source.facts.conversations)?.id === conversation

/** Each session that continues another, to the one it continues. `chains`: the sessions' (`chainsOf`). */
export const continuations = (sessions: Session[], chains: Chains): Map<Session, Session> =>
  new Map(sessions.flatMap((s) => {
    const before = continues(s, chains)
    return before ? [[s, before] as const] : []
  }))

/** The conversation a session is in: its latest, or, before Claude reports one, the one its argv resumes. */
const inConversation = (session: Session): string | undefined =>
  session.facts.conversations.at(-1)?.id ?? launchOf(session.header.argv).resume

/** The name the session's Claude runs under (`resumeName`), from its first moment. */
export const runsAs = (session: Session): string | undefined => launchOf(session.header.argv).name

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

/** The running session of the worker called `name` (a callsign, any case). */
export const runningNamed = (sessions: Session[], running: ReadonlySet<string>, name: string, callsign: (id: string) => string): Session | undefined => {
  const chains = chainsOf(sessions)
  return sessions.find((s) => running.has(s.header.id) && workerName(s, (x) => continues(x, chains), callsign).toUpperCase() === name.toUpperCase())
}

/**
 * The callsigns of the workers of sessions `ids`: a new worker's name is kept apart from theirs (`freshId`,
 * `chosenCallsign`). A session whose log isn't read yet was just spawned, and holds its id's callsign.
 */
export const heldCallsigns = (sessions: Session[], ids: ReadonlySet<string>, callsign: (id: string) => string): string[] => {
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  const chains = chainsOf(sessions)
  return [...ids].map((id) => {
    const session = byId.get(id)
    return session ? workerName(session, (s) => continues(s, chains), callsign) : callsign(id)
  })
}

/** The name a resume of `conversation` runs under as session `id`: its worker's, or its own on a fork. */
export const resumeName = (source: Session, conversation: string, id: string, sessions: Session[], callsign: (id: string) => string) => {
  const chains = chainsOf(sessions)
  return carriesOn(source, conversation) ? workerName(source, (s) => continues(s, chains), callsign) : callsign(id)
}

/** The conversation's latest prompt and answer: what a resumed session hasn't had yet comes from the session it resumed. */
const latest = (session: Session, conversation: Conversation, chains: Chains): Pick<Conversation, 'prompt' | 'answer'> => {
  const source = conversation.prompt && conversation.answer ? undefined : resumes(session, conversation, chains)
  const earlier = source && latest(source, source.facts.conversations.findLast((c) => c.id === conversation.id)!, chains)
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

/** `chains`: every session's (`chainsOf`). `nameOf`: a session's worker's callsign (`namer`). */
export const threads = (session: Session, chains: Chains, nameOf: (s: Session) => string): Thread[] =>
  session.facts.conversations
    .filter((c) => c.saved)
    .map((c) => {
      const source = resumes(session, c, chains)
      const resumer = resumedBy(session, c, chains)
      const refOf = (s: Session): SessionLink => ({ id: s.header.id, callsign: nameOf(s), startedAt: s.header.startedAt })
      return { ...c, ...latest(session, c, chains), resumes: source && refOf(source), resumedBy: resumer && refOf(resumer) }
    })
