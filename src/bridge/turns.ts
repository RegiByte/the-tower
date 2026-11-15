import type { SessionLog } from '../shared/model.ts'
import type { Happening, ToolFormat } from './events.ts'
import { readableEvents, toolFormatOf } from './normalize.ts'
import { chainsOf, continuations, lineage, namer, resumes, threads, type Chains, type SessionRef, type Thread } from './chains.ts'
import { USER_ORIGINS, type Conversation } from './conversation.ts'
import { digestOf, type Session } from './facts.ts'
import { deliveries, delivered, receipts } from './messages.ts'

/** The worker that sent a prompt: its callsign, and its session when the tower ran it. */
export type PeerFrom = { callsign: string; session?: string }

/** How a tool call ended: still running, done, failed, denied by the user or a rule, or abandoned by an Esc or a denial. */
export type ToolOutcome = 'running' | 'ok' | 'error' | 'denied' | 'abandoned'

/**
 * What Claude did between a turn's prompt and its answer, in reading order, each at when it was logged (epoch ms):
 * its words between tool calls (`text`), a tool call folded to one line (`line`, `ms` how long it ran, `agentSteps` the
 * steps of the subagent it started), and a message it sent another worker (`sent`). The turn's answer is not one of
 * them. @since 1.133
 */
export type Step =
  | { t: 'text'; at: number; text: string }
  | { t: 'tool'; at: number; id: string; tool: string; line: string; outcome: ToolOutcome; ms?: number; agentSteps?: number }
  | { t: 'sent'; at: number; to: PeerFrom; text: string }

/**
 * What the user asked, or another worker sent (`from`), and Claude's latest answer in the turn that followed, with when
 * each was given (epoch ms); no answer while Claude still works on it. `session` is the session whose log holds it and
 * `steps` what Claude did on the way to its answer (both @since 1.133).
 */
export type Turn = { startedAt: number; prompt: string; from?: PeerFrom; answer?: string; answeredAt?: number; session: string; steps: Step[] }

/** A session of a worker's lineage: its id, its worker's callsign, and when it started (epoch ms). */
export type BriefSession = SessionRef & { startedAt: number }

/**
 * A saved conversation with its last turns, oldest first, and the session that holds it; `earlier`, whether it holds
 * turns before them (@since 1.133), read whole at `conversations/<id>/<conversation>`.
 */
export type Brief = Thread & { turns: Turn[]; earlier: boolean; session: BriefSession }

/** A turn as the fold opens it: what its prompt opened, and the main loop's work since, each event at when it was logged (epoch ms). */
type Opened = Omit<Turn, 'steps'> & { work: [number, Happening][] }

/** `spawned`: the subagent each `Agent` call started, by the call's id; `agentSteps`: the steps each subagent took. */
type Tally = { current?: string; byConversation: Record<string, Opened[]>; spawned: Map<string, string>; agentSteps: Map<string, number>; queued: Map<string, Queued> }

/** A prompt the runtime holds in its queue until it delivers it into a turn. */
type Queued = { origin: string; text: string }

const withLatest = (tally: Tally, change: (turn: Opened) => Opened): Tally => {
  const turns = tally.current ? tally.byConversation[tally.current] : undefined
  return turns?.length ? { ...tally, byConversation: { ...tally.byConversation, [tally.current!]: [...turns.slice(0, -1), change(turns.at(-1)!)] } } : tally
}

/** The tally with `turn` opened in the current conversation, when a prompt opened one there. */
const withOpened = (tally: Tally, turn: Opened | undefined): Tally =>
  turn && tally.current ? { ...tally, byConversation: { ...tally.byConversation, [tally.current]: [...(tally.byConversation[tally.current] ?? []), turn] } } : tally

/** A turn a prompt opens: one the user gave, or a message from another Claude session, named by its sender's peer name. */
const opened = (kind: string, text: string, at: number, session: string): Opened | undefined => {
  if (USER_ORIGINS.has(kind)) return { startedAt: at, prompt: text, session, work: [] }
  const message = kind === 'peer' ? delivered(text) : undefined
  return message && { startedAt: at, prompt: message.text, from: { callsign: message.name }, session, work: [] }
}

/** The events a turn's steps are read from; a subagent's are left out, its steps counted on the call that started it. */
const WORK = new Set(['tool.call', 'tool.result', 'tool.abandoned', 'tool.done', 'tool.failed', 'turn.step', 'said', 'turn.ended', 'claude.sent'])
const ofMainLoop = (happening: Happening) => !('agent' in happening) || happening.agent === undefined

/** How a tool call stands after one of its events: an event that says nothing of how it ended leaves it as it was. */
const outcomeAfter = (outcome: ToolOutcome, happening: Happening): ToolOutcome => {
  switch (happening.t) {
    case 'tool.result':
      return happening.deny ? 'denied' : happening.isError ? 'error' : 'ok'
    case 'tool.abandoned':
      return 'abandoned'
    default:
      return outcome
  }
}

type ToolStep = Extract<Step, { t: 'tool' }>

/** What the main loop said last since its last turn ended: the answer of a runtime that logs a turn's text apart from its end. */
const lastSaid = (work: Opened['work']): string | undefined => {
  for (const [, happening] of work.toReversed()) {
    if (happening.t === 'turn.ended') return undefined
    if (happening.t === 'said') return happening.text
  }
  return undefined
}

/** What a turn's steps read of the rest of its log: the steps each `Agent` call's subagent took, and whether an address is a subagent's. */
type Agents = { stepsOf: (call: string) => number | undefined; isAgent: (to: string) => boolean }

/** A tool call in one line, as its session's runtime words it. */
type LineOf = ToolFormat['line']

/**
 * A turn's steps from its work: a step's words come before the calls it made, which Claude logs first since they run
 * while it streams; the turn's answer, its last words, is left out. A message to another worker is a `sent` step and
 * its `SendMessage` call is not drawn again; one to a subagent is the call, its address no worker's.
 */
const stepsOf = ({ work, answer }: Opened, agents: Agents, lineOf: LineOf): Step[] => {
  const calls = new Map<string, ToolStep>()
  const read = work.reduce<{ done: Step[]; pending: Step[] }>(({ done, pending }, [at, happening]) => {
    switch (happening.t) {
      case 'tool.call': {
        if (happening.tool === 'SendMessage' && !agents.isAgent(String(happening.input.to))) return { done, pending }
        const { id, tool, input } = happening
        calls.set(id, { t: 'tool', at, id, tool, line: lineOf(tool, input), outcome: 'running' })
        return { done, pending: [...pending, calls.get(id)!] }
      }
      case 'claude.sent':
        return agents.isAgent(happening.to) ? { done, pending } : { done, pending: [...pending, { t: 'sent', at, to: { callsign: happening.to }, text: happening.text }] }
      case 'turn.step': {
        const text = happening.answer
        return { done: [...done, ...(text ? [{ t: 'text' as const, at, text }] : []), ...pending], pending: [] }
      }
      case 'said':
        return { done: [...done, ...pending, ...(happening.text ? [{ t: 'text' as const, at, text: happening.text }] : [])], pending: [] }
      case 'turn.ended':
        return { done: [...done, ...pending], pending: [] }
      case 'tool.result':
      case 'tool.abandoned':
      case 'tool.done':
      case 'tool.failed': {
        const call = calls.get(happening.id)
        if (!call) return { done, pending }
        const ms = 'ms' in happening ? happening.ms : undefined
        const answered = happening.t === 'tool.done' && happening.input && call.tool === 'AskUserQuestion' ? { line: lineOf(call.tool, happening.input) } : {}
        calls.set(call.id, { ...call, ...answered, outcome: outcomeAfter(call.outcome, happening), ...(typeof ms === 'number' && { ms }) })
        return { done, pending }
      }
      default:
        return { done, pending }
    }
  }, { done: [], pending: [] })
  const steps = [...read.done, ...read.pending]
  const last = steps.at(-1)
  const said = answer !== undefined && last?.t === 'text' && last.text === answer ? steps.slice(0, -1) : steps
  return said.map((s) => {
    if (s.t !== 'tool') return s
    const agentSteps = agents.stepsOf(s.id)
    return { ...calls.get(s.id)!, ...(agentSteps !== undefined && { agentSteps }) }
  })
}

/**
 * Every conversation of one session's log with its turns: a turn opens on a prompt the user gave or another worker
 * sent, and takes the main loop's steps and latest answer until the next. A prompt the runtime queued opens its turn
 * where the runtime delivers it, which can be inside the turn that was running: the work before it is that turn's.
 */
export const turnsByConversation = (log: SessionLog): Record<string, Turn[]> => {
  const { header } = log
  const tally = readableEvents(log).reduce<Tally>((tally, [t, code, data]) => {
    if (code !== 'e') return tally
    const at = header.startedAt + t * 1000
    switch (data.t) {
      case 'conversation.entered':
        return { ...tally, current: data.id }
      case 'compaction.ended':
        return { ...tally, current: data.conversation ?? tally.current }
      case 'prompt': {
        if (data.id !== undefined) return { ...tally, queued: new Map(tally.queued).set(data.id, { origin: data.origin, text: data.text }) }
        return withOpened(tally, opened(data.origin, data.text, at, header.id))
      }
      case 'prompt.accepted': {
        const queued = data.id === undefined ? undefined : tally.queued.get(data.id)
        if (!queued) break
        const rest = new Map(tally.queued)
        rest.delete(data.id!)
        return withOpened({ ...tally, queued: rest }, opened(queued.origin, queued.text, at, header.id))
      }
      case 'agent.spawned':
        return data.id ? { ...tally, spawned: new Map(tally.spawned).set(data.call, data.id) } : tally
      case 'turn.step':
        if (data.agent !== undefined) return { ...tally, agentSteps: new Map(tally.agentSteps).set(data.agent, (tally.agentSteps.get(data.agent) ?? 0) + 1) }
        break
      case 'turn.ended': {
        if (data.agent !== undefined) break
        return withLatest(tally, (turn) => {
          const answer = data.answer ?? lastSaid(turn.work)
          return answer ? { ...turn, answer, answeredAt: at, work: [...turn.work, [at, data]] } : { ...turn, work: [...turn.work, [at, data]] }
        })
      }
    }
    return WORK.has(data.t) && ofMainLoop(data) ? withLatest(tally, (turn) => ({ ...turn, work: [...turn.work, [at, data]] })) : tally
  }, { byConversation: {}, spawned: new Map(), agentSteps: new Map(), queued: new Map() })
  const spawnedAgents = new Set(tally.spawned.values())
  const lineOf = toolFormatOf(header).line
  const agents: Agents = {
    stepsOf: (call) => {
      const agent = tally.spawned.get(call)
      return agent === undefined ? undefined : (tally.agentSteps.get(agent) ?? 0)
    },
    isAgent: (to) => spawnedAgents.has(to),
  }
  return Object.fromEntries(Object.entries(tally.byConversation).map(([id, turns]) =>
    [id, turns.map(({ work: _, ...turn }, i) => ({ ...turn, steps: stepsOf(turns[i], agents, lineOf) }))]))
}

/** One tool call as its session logged it: its input, the permission check it met, how it ended, and how long it ran. @since 1.133 */
export type ToolCall = { tool: string; input: Record<string, unknown>; check?: Record<string, unknown>; outcome: ToolOutcome; error?: string; ms?: number }

/** The tool call `id` of a session's log, `undefined` when it logged none. */
export const toolCallOf = (log: SessionLog, id: string): ToolCall | undefined =>
  readableEvents(log).reduce<ToolCall | undefined>((call, [, code, happening]) => {
    if (code !== 'e' || !happening.t.startsWith('tool.') || !('id' in happening) || happening.id !== id) return call
    if (happening.t === 'tool.call') return { tool: happening.tool, input: happening.input, outcome: 'running' }
    if (!call) return call
    switch (happening.t) {
      case 'tool.checked':
        return { ...call, check: happening.result }
      case 'tool.done':
        return { ...call, ...(happening.input && { input: happening.input }), ms: happening.ms }
      case 'tool.failed':
        return { ...call, ms: happening.ms, error: happening.error }
      default:
        return { ...call, outcome: outcomeAfter(call.outcome, happening) }
    }
  }, undefined)

/** The workers a turn's prompt came from and its messages went to, as known across every session. */
type Peers = {
  /** The session that sent a message `session` received. */
  sender: (session: Session, turn: Turn) => PeerFrom | undefined
  /** The session a message `session` sent reached: a reply is addressed to a socket, not a name. */
  recipient: (session: Session, step: Extract<Step, { t: 'sent' }>) => PeerFrom | undefined
}

const withPeers = (session: Session, turn: Turn, peers: Peers): Turn => ({
  ...turn,
  ...(turn.from && { from: peers.sender(session, turn) ?? turn.from }),
  steps: turn.steps.map((s) => (s.t === 'sent' ? { ...s, to: peers.recipient(session, s) ?? s.to } : s)),
})

/**
 * The last `count` turns of a conversation, oldest first, and whether it holds any before them. A resumed conversation
 * goes on from the session it resumed: that session's log is read only when this one's own turns fall short.
 */
const turnsOf = (session: Session, conversation: Conversation, chains: Chains, logOf: (id: string) => SessionLog, count: number, peers: Peers): { turns: Turn[]; earlier: boolean } => {
  const all = turnsByConversation(logOf(session.header.id))[conversation.id] ?? []
  const own = all.slice(-count).map((turn) => withPeers(session, turn, peers))
  const source = resumes(session, conversation, chains)
  if (own.length >= count) return { turns: own, earlier: all.length > count || source !== undefined }
  const before = source ? turnsOf(source, source.facts.conversations.findLast((c) => c.id === conversation.id)!, chains, logOf, count - own.length, peers) : { turns: [], earlier: false }
  return { turns: [...before.turns, ...own], earlier: before.earlier }
}

/** Who sent each message a session received, and who received each it sent: matched by text and time (`messages.ts`). */
const peersOf = (sessions: Session[], nameOf: (s: Session) => string): Peers => {
  const received = receipts(sessions)
  const sent = deliveries(sessions)
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  const peer = (id: string | undefined) => {
    const s = id === undefined ? undefined : byId.get(id)
    return s && { callsign: nameOf(s), session: s.header.id }
  }
  return {
    sender: (session, turn) => {
      const digest = digestOf(turn.prompt)
      return peer(received.get(session.header.id)?.findLast((r) => r.digest === digest && r.at <= turn.startedAt)?.from)
    },
    recipient: (session, step) => peer(sent.get(session.header.id)?.find((d) => d.at === step.at && d.to === step.to.callsign)?.session),
  }
}

/** Every saved conversation of the worker `session` ran as, up to it, with its peers named: see `briefOf`. */
const threadsOf = (session: Session, sessions: Session[], chains: Chains, callsign: (id: string) => string) => {
  const continued = continuations(sessions, chains)
  const nameOf = namer(continued, callsign)
  const peers = peersOf(sessions, nameOf)
  return lineage(session, (s) => continued.get(s)).toReversed().flatMap((s) => {
    const ref: BriefSession = { id: s.header.id, callsign: nameOf(s), startedAt: s.header.startedAt }
    return threads(s, chains, nameOf).map((thread) => ({ thread, session: s, ref, peers }))
  })
}

/**
 * Every saved conversation of the worker `session` ran as, up to it: its own first, then each earlier session's, the
 * latest session first; a session's conversations in order. `callsign`: a session id's (`callsignsOf`).
 */
export const briefOf = (session: Session, sessions: Session[], logOf: (id: string) => SessionLog, count: number, callsign: (id: string) => string): Brief[] => {
  const chains = chainsOf(sessions)
  return threadsOf(session, sessions, chains, callsign).map(({ thread, session: s, ref, peers }) => ({ ...thread, session: ref, ...turnsOf(s, thread, chains, logOf, count, peers) }))
}

/**
 * A saved conversation of `session`, as `briefOf` draws it there, with every one of its turns: those of the sessions it
 * resumed first. `undefined` when the session holds no such conversation. @since 1.133
 */
export const wholeConversation = (session: Session, sessions: Session[], logOf: (id: string) => SessionLog, conversation: string, callsign: (id: string) => string): Brief | undefined => {
  const chains = chainsOf(sessions)
  const held = threadsOf(session, sessions, chains, callsign).find((t) => t.session === session && t.thread.id === conversation)
  return held && { ...held.thread, session: held.ref, ...turnsOf(session, held.thread, chains, logOf, Infinity, held.peers) }
}
