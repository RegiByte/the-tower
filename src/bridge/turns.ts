import type { ClaudeHookInput, ModEvent, SessionLog } from '../shared/model.ts'
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

type Hook = ClaudeHookInput | ModEvent

/** A turn as the fold opens it: what its prompt opened, and the main loop's work since, each event at when it was logged (epoch ms). */
type Opened = Omit<Turn, 'steps'> & { work: [number, Hook][] }

/** `spawned`: the subagent each `Agent` call started, by the call's id; `agentSteps`: the steps each subagent took. */
type Tally = { current?: string; byConversation: Record<string, Opened[]>; spawned: Map<string, string>; agentSteps: Map<string, number> }

const withLatest = (tally: Tally, change: (turn: Opened) => Opened): Tally => {
  const turns = tally.current ? tally.byConversation[tally.current] : undefined
  return turns?.length ? { ...tally, byConversation: { ...tally.byConversation, [tally.current!]: [...turns.slice(0, -1), change(turns.at(-1)!)] } } : tally
}

/** A turn a prompt opens: one the user gave, or a message from another Claude session, named by its sender's peer name. */
const opened = (kind: string, text: string, at: number, session: string): Opened | undefined => {
  if (USER_ORIGINS.has(kind)) return { startedAt: at, prompt: text, session, work: [] }
  const message = kind === 'peer' ? delivered(text) : undefined
  return message && { startedAt: at, prompt: message.text, from: { callsign: message.name }, session, work: [] }
}

/** The events a turn's steps are read from; a subagent's are left out, its steps counted on the call that started it. */
const WORK = new Set(['tool.call', 'tower.tool.result', 'tower.tool.abandoned', 'PostToolUse', 'PostToolUseFailure', 'turn.step', 'turn.complete', 'session.send'])
const ofMainLoop = (hook: Hook) => hook.agentId === undefined && hook.agent_id === undefined

/** The fields of a tool's input that say in a line what a call does, the first one present winning. */
const LINE_FIELDS: Record<string, string[]> = {
  Bash: ['description', 'command'],
  Read: ['file_path'],
  Write: ['file_path'],
  Edit: ['file_path'],
  NotebookEdit: ['notebook_path'],
  Grep: ['pattern'],
  Glob: ['pattern'],
  Skill: ['skill'],
  Agent: ['description'],
  Task: ['description'],
  ToolSearch: ['query'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  SendMessage: ['summary', 'to'],
}

/** What a `tool.call` carries besides the tool's input. */
const CALL_FIELDS = new Set(['tool', 'tool_use_id', 'hook_event_name', 'agentId'])

/** A tool call's input as Claude gave it. */
const inputOf = (call: Hook): Record<string, unknown> => Object.fromEntries(Object.entries(call).filter(([k]) => !CALL_FIELDS.has(k)))

const LINE_CHARS = 160

/** A tool call in one line: its telling field's first line, a path under the session's folder relative to it. */
export const toolLine = (call: Hook, cwd: string): string => {
  const input = inputOf(call)
  const field = (LINE_FIELDS[String(call.tool)] ?? []).find((f) => typeof input[f] === 'string' && input[f]) ?? Object.keys(input).find((f) => typeof input[f] === 'string' && input[f])
  const value = field ? String(input[field]).split('\n')[0] : ''
  const line = value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value
  return line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1)}…` : line
}

/** How a tool call stands after one of its events: an event that says nothing of how it ended leaves it as it was. */
const outcomeAfter = (outcome: ToolOutcome, hook: Hook): ToolOutcome => {
  switch (hook.hook_event_name) {
    case 'tower.tool.result':
      return hook.deny ? 'denied' : hook.isError ? 'error' : 'ok'
    case 'tower.tool.abandoned':
      return 'abandoned'
    default:
      return outcome
  }
}

type ToolStep = Extract<Step, { t: 'tool' }>

/** What a turn's steps read of the rest of its log: the steps each `Agent` call's subagent took, and whether an address is a subagent's. */
type Agents = { stepsOf: (call: string) => number | undefined; isAgent: (to: string) => boolean }

/**
 * A turn's steps from its work: a step's words come before the calls it made, which Claude logs first since they run
 * while it streams; the turn's answer, its last words, is left out. A message to another worker is a `sent` step and
 * its `SendMessage` call is not drawn again; one to a subagent is the call, its address no worker's.
 */
const stepsOf = ({ work, answer }: Opened, cwd: string, agents: Agents): Step[] => {
  const calls = new Map<string, ToolStep>()
  const read = work.reduce<{ done: Step[]; pending: Step[] }>(({ done, pending }, [at, hook]) => {
    switch (hook.hook_event_name) {
      case 'tool.call': {
        if (hook.tool === 'SendMessage' && !agents.isAgent(String(hook.to))) return { done, pending }
        const id = String(hook.tool_use_id)
        calls.set(id, { t: 'tool', at, id, tool: String(hook.tool), line: toolLine(hook, cwd), outcome: 'running' })
        return { done, pending: [...pending, calls.get(id)!] }
      }
      case 'session.send':
        return agents.isAgent(String(hook.to)) ? { done, pending } : { done, pending: [...pending, { t: 'sent', at, to: { callsign: String(hook.to) }, text: String(hook.text) }] }
      case 'turn.step': {
        const text = (hook.result as { answer?: string } | undefined)?.answer
        return { done: [...done, ...(text ? [{ t: 'text' as const, at, text }] : []), ...pending], pending: [] }
      }
      case 'turn.complete':
        return { done: [...done, ...pending], pending: [] }
      default: {
        const call = calls.get(String(hook.tool_use_id))
        if (!call) return { done, pending }
        const ms = hook.duration_ms
        calls.set(call.id, { ...call, outcome: outcomeAfter(call.outcome, hook), ...(typeof ms === 'number' && { ms }) })
        return { done, pending }
      }
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
 * sent, and takes the main loop's steps and latest answer until the next.
 */
export const turnsByConversation = ({ header, events }: SessionLog): Record<string, Turn[]> => {
  const tally = events.reduce<Tally>((tally, [t, code, data]) => {
    if (code !== 'h') return tally
    const at = header.startedAt + t * 1000
    switch (data.hook_event_name) {
      case 'SessionStart':
        return { ...tally, current: String(data.session_id) }
      case 'prompt.submit': {
        const turn = tally.current ? opened((data.origin as { kind: string }).kind, String(data.text), at, header.id) : undefined
        return turn ? { ...tally, byConversation: { ...tally.byConversation, [tally.current!]: [...(tally.byConversation[tally.current!] ?? []), turn] } } : tally
      }
      case 'agent.spawn': {
        const agent = (data.result as { agentId?: string } | undefined)?.agentId
        return agent ? { ...tally, spawned: new Map(tally.spawned).set(String(data.tool_use_id), agent) } : tally
      }
      case 'turn.step':
        if (data.agentId !== undefined) return { ...tally, agentSteps: new Map(tally.agentSteps).set(String(data.agentId), (tally.agentSteps.get(String(data.agentId)) ?? 0) + 1) }
        break
      case 'turn.complete':
        if (data.agentId === undefined && data.answer) return withLatest(tally, (turn) => ({ ...turn, answer: String(data.answer), answeredAt: at, work: [...turn.work, [at, data]] }))
        break
    }
    return WORK.has(data.hook_event_name) && ofMainLoop(data) ? withLatest(tally, (turn) => ({ ...turn, work: [...turn.work, [at, data]] })) : tally
  }, { byConversation: {}, spawned: new Map(), agentSteps: new Map() })
  const spawnedAgents = new Set(tally.spawned.values())
  const agents: Agents = {
    stepsOf: (call) => {
      const agent = tally.spawned.get(call)
      return agent === undefined ? undefined : (tally.agentSteps.get(agent) ?? 0)
    },
    isAgent: (to) => spawnedAgents.has(to),
  }
  return Object.fromEntries(Object.entries(tally.byConversation).map(([id, turns]) =>
    [id, turns.map(({ work: _, ...turn }, i) => ({ ...turn, steps: stepsOf(turns[i], header.cwd, agents) }))]))
}

/** One tool call as its session logged it: its input, the permission check it met, how it ended, and how long it ran. @since 1.133 */
export type ToolCall = { tool: string; input: Record<string, unknown>; check?: Record<string, unknown>; outcome: ToolOutcome; error?: string; ms?: number }

/** The tool call `id` of a session's log, `undefined` when it logged none. */
export const toolCallOf = ({ events }: SessionLog, id: string): ToolCall | undefined =>
  events.reduce<ToolCall | undefined>((call, [, code, hook]) => {
    if (code !== 'h' || hook.tool_use_id !== id) return call
    if (hook.hook_event_name === 'tool.call') return { tool: String(hook.tool), input: inputOf(hook), outcome: 'running' }
    if (!call) return call
    switch (hook.hook_event_name) {
      case 'tool.check':
        return { ...call, check: hook.result as Record<string, unknown> }
      case 'PostToolUse':
        return { ...call, ms: hook.duration_ms as number }
      case 'PostToolUseFailure':
        return { ...call, ms: hook.duration_ms as number, error: String(hook.error) }
      default:
        return { ...call, outcome: outcomeAfter(call.outcome, hook) }
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
