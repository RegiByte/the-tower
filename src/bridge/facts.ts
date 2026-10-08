import type { LogEvent, SessionHeader, SessionLog } from '../shared/model.ts'
import { conversationsAfter, USER_ORIGINS, type Conversation } from './conversation.ts'
import { isTyped } from './input.ts'
import { BOOTING, nextState, type SessionState } from './status.ts'

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * Something a worker put in front of the user (`tower show`, `tower open`): a `file` it wrote (an absolute path)
 * or a `url` to show in place, or a `link` to open in a browser tab. `at`: seconds since the session's start.
 */
export type Shown = { kind: 'file' | 'url' | 'link'; target: string; title?: string; at: number }

/**
 * An item the worker put in one of its floor's collections (`tower keep`), and the conversation it was in.
 * `at`: seconds since the session's start.
 */
export type Kept = { project: string; collection: string; id: string; conversation?: string; at: number }

/** Tokens of one model step: fresh input, output, and the prompt cache read and written. */
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

/** A rate limit's reading where it changed: epoch ms, the percent used, and when its window resets. */
export type LimitReading = [at: number, percentUsed: number, resetsAt: string]

/** What is known about one session, folded from its log one event at a time. */
export type Facts = {
  state: SessionState
  cols: number
  rows: number
  /** Percent of the context window in use, from the last `session.measure`. */
  context?: number
  costUsd?: number
  rateLimits?: { at: number; limits: RateLimit[] }
  /** The main loop's latest tool call within the current turn. */
  tool?: string
  /** What Claude told the user between tool calls in the current turn: its latest text steps, oldest first. */
  says: string[]
  subagents: number
  /** The main loop's turns that ran to their Stop: an interrupted or failed turn raises none. */
  turns: number
  /** The model and effort of the main loop's latest step: what Claude used, whatever was asked for. Haiku has no effort. */
  model?: string
  effort?: string
  /** The release of Claude Code the session runs (`claude --version`), as the mod reports it on start. */
  claude?: string
  /** Claude's conversations this session held, in order: `/clear` moves it to a new one. */
  conversations: Conversation[]
  /** What the worker showed, oldest first: showing a target again moves it last. */
  shown: Shown[]
  /** What the worker kept, oldest first. */
  kept: Kept[]
  /** The sessions the worker hired (`tower hire`, `tower review`), oldest first. */
  hired: string[]
  /** When someone last typed into the session. */
  typedAt?: number
  /** When Claude last raised a hook or a mod event, its subagents' included. */
  heardAt?: number
  hostStopped?: boolean
  /**
   * What Claude spent, each reading's increase on its conversation's running total (`costUsd`), at the reading's time
   * (epoch ms). A conversation new to the session starts from zero; a resumed one from its first reading here.
   */
  spend: [at: number, usd: number][]
  /** The conversation the latest cost reading measured. */
  measured?: string
  /** Each model step's tokens, the main loop's and subagents', at the step's time (epoch ms). */
  tokens: [at: number, model: string, tokens: Tokens][]
  /** The main loop's turns that completed: when each started (epoch ms) and how long it ran, in seconds. */
  turnSpans: [at: number, seconds: number][]
  /** When the main loop's current turn started, in seconds since the session's start. */
  turnStartedAt?: number
  /**
   * How long the worker waited on the user: from a turn's Stop to the user's next prompt, in seconds, at the prompt
   * (epoch ms). A turn started on anything else (a peer, a task's notification, a schedule) ends the wait unanswered.
   */
  waits: [at: number, seconds: number][]
  /** When the main loop last stopped, in seconds since the session's start, until its next turn starts. */
  stoppedAt?: number
  /** Each prompt submitted, at its time (epoch ms), by who it came from (`composer` is the user, `peer` another worker). */
  prompts: [at: number, origin: string][]
  /** When Claude showed the user a permission dialog (epoch ms): a check settled without one is not an ask. */
  asks: number[]
  /** When a tool call failed (epoch ms). */
  failures: number[]
  /** When each subagent was spawned (epoch ms). */
  spawns: number[]
  /** Each rate limit's readings where it changed, by kind, oldest first. */
  limitReadings: Record<string, LimitReading[]>
  /** The html files the worker wrote (`Write`, its subagents' too), each at its first write (epoch ms), oldest first. */
  pages: [at: number, path: string][]
  /** The messages it sent other Claude sessions (`SendMessage`): when (epoch ms), the address, and the text's digest. */
  sent: [at: number, to: string, digest: number][]
  /** The messages it received from other Claude sessions: when (epoch ms), and the digest of the text as sent. */
  received: [at: number, digest: number][]
}

export type Session = { header: SessionHeader; facts: Facts }

export const initialFacts = (header: SessionHeader): Facts => ({
  state: BOOTING, cols: header.cols, rows: header.rows, subagents: 0, turns: 0, says: [], conversations: [], shown: [], kept: [], hired: [],
  spend: [], tokens: [], turnSpans: [], waits: [], prompts: [], asks: [], failures: [], spawns: [], limitReadings: {},
  pages: [], sent: [], received: [],
})

/** The board is pushed on every change: a few short lines per worker. */
const SAYS_KEPT = 3
const LINE_CHARS = 280

const clip = (text: string) => (text.length > LINE_CHARS ? `${text.slice(0, LINE_CHARS - 1)}…` : text)

const TOOL_ARG_KEYS = ['command', 'file_path', 'pattern', 'url', 'description', 'prompt']

/** `tool.call` carries the tool's arguments beside `tool` (`command` for Bash), a heredoc's whole script included. */
const toolLabel = (call: Record<string, unknown>): string => {
  const arg = TOOL_ARG_KEYS.map((key) => call[key]).find((value) => typeof value === 'string') as string | undefined
  return arg ? clip(`${call.tool} ${arg}`) : String(call.tool)
}

/**
 * Claude's cost is its conversation's running total: what a reading adds is its increase on the conversation's
 * previous reading. A conversation's first reading here adds all of it, unless it was resumed: then it carries what
 * was spent before. A reading can come before Claude names the session's first conversation: it is where that
 * conversation's total starts. A total lower than the one before it started again from zero.
 */
const spent = (facts: Facts, usd: number): number => {
  const conversation = facts.conversations.at(-1)
  if (!conversation) return 0
  const fresh = facts.costUsd === undefined || (facts.measured !== undefined && facts.measured !== conversation.id)
  if (fresh) return conversation.resumed ? 0 : usd
  return usd >= facts.costUsd! ? usd - facts.costUsd! : usd
}

/** Each limit's readings, a reading kept only where its percent or its window moved. */
const limitsRead = (readings: Facts['limitReadings'], at: number, limits: RateLimit[]): Facts['limitReadings'] =>
  limits.reduce((next, { kind, percentUsed, resetsAt = '' }) => {
    const last = next[kind]?.at(-1)
    return last && last[1] === percentUsed && last[2] === resetsAt ? next : { ...next, [kind]: [...(next[kind] ?? []), [at, percentUsed, resetsAt]] }
  }, readings)

/** FNV-1a over the text's UTF-16 units: a message is matched to its delivery by it, and its text is never kept. */
export const digestOf = (text: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** A received message is delivered as a prompt wrapping the text as sent. */
const DELIVERY = /^<cross-session-message [^>]*>\n([\s\S]*)\n<\/cross-session-message>$/

const PAGE = /\.html$/

type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

const tokensOf = (u: Usage): Tokens => ({
  input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
})

const hookFacts = (facts: Facts, t: number, startedAt: number, hook: Record<string, unknown>): Facts => {
  const mainLoop = hook.agentId === undefined
  const at = startedAt + t * 1000
  switch (hook.hook_event_name) {
    case 'session.measure': {
      const context = hook.context as { percent?: number } | undefined
      const cost = hook.cost as { usd: number } | undefined
      const limits = hook.rateLimits as RateLimit[]
      const usd = cost && spent(facts, cost.usd)
      return {
        ...facts,
        context: context?.percent ?? facts.context,
        ...(cost && { costUsd: cost.usd, measured: facts.conversations.at(-1)?.id, spend: usd ? [...facts.spend, [at, usd]] : facts.spend }),
        rateLimits: limits.length ? { at, limits } : facts.rateLimits,
        limitReadings: limitsRead(facts.limitReadings, at, limits),
      }
    }
    case 'prompt.submit': {
      const { kind } = hook.origin as { kind: string }
      const prompted = { ...facts, prompts: [...facts.prompts, [at, kind] as [number, string]] }
      return facts.stoppedAt === undefined || !USER_ORIGINS.has(kind)
        ? prompted
        : { ...prompted, waits: [...facts.waits, [at, t - facts.stoppedAt]], stoppedAt: undefined }
    }
    case 'turn.start':
      return mainLoop ? { ...facts, tool: undefined, says: [], turnStartedAt: t, stoppedAt: undefined } : facts
    case 'tool.call': {
      const path = hook.tool === 'Write' && typeof hook.file_path === 'string' && PAGE.test(hook.file_path) ? hook.file_path : undefined
      const paged = path && !facts.pages.some(([, p]) => p === path) ? { ...facts, pages: [...facts.pages, [at, path] as [number, string]] } : facts
      return mainLoop ? { ...paged, tool: toolLabel(hook) } : paged
    }
    case 'session.send':
      return { ...facts, sent: [...facts.sent, [at, String(hook.to), digestOf(String(hook.text))]] }
    case 'session.receive': {
      const text = DELIVERY.exec(String(hook.text))?.[1]
      return text === undefined ? facts : { ...facts, received: [...facts.received, [at, digestOf(text)]] }
    }
    case 'PermissionRequest':
      return { ...facts, asks: [...facts.asks, at] }
    case 'PostToolUseFailure':
      return { ...facts, failures: [...facts.failures, at] }
    case 'agent.spawn':
      return { ...facts, subagents: facts.subagents + 1, spawns: [...facts.spawns, at] }
    case 'turn.step': {
      const { answer, usage } = hook.result as { answer?: string; usage?: Usage }
      const counted = usage ? { ...facts, tokens: [...facts.tokens, [at, String(hook.model), tokensOf(usage)] as Facts['tokens'][number]] } : facts
      if (!mainLoop) return counted
      const stepped = { ...counted, model: String(hook.model), effort: hook.effort as string | undefined }
      return answer?.trim() ? { ...stepped, says: [...facts.says, clip(answer.trim())].slice(-SAYS_KEPT) } : stepped
    }
    case 'turn.complete':
      if (!mainLoop) return facts
      return facts.turnStartedAt === undefined
        ? { ...facts, says: [] }
        : { ...facts, says: [], turnSpans: [...facts.turnSpans, [startedAt + facts.turnStartedAt * 1000, t - facts.turnStartedAt]], turnStartedAt: undefined }
    case 'Stop':
      return { ...facts, turns: facts.turns + 1, stoppedAt: t }
    case 'tower.show': {
      const { kind, target, title } = hook as Omit<Shown, 'at'>
      return { ...facts, shown: [...facts.shown.filter((s) => s.target !== target), { kind, target, title, at: t }] }
    }
    case 'tower.keep': {
      const { project, collection, id } = hook as Omit<Kept, 'at' | 'conversation'>
      return { ...facts, kept: [...facts.kept, { project, collection, id, conversation: facts.conversations.at(-1)?.id, at: t }] }
    }
    case 'tower.claude':
      return { ...facts, claude: String(hook.version) }
    case 'tower.hire':
      return { ...facts, hired: [...facts.hired, String(hook.id)] }
    default:
      return facts
  }
}

/**
 * Output draws the screen, and changes no fact but a blocking screen's state: otherwise the same facts come back, so a
 * caller can tell nothing changed.
 */
export const factsAfter = (startedAt: number) => (facts: Facts, event: LogEvent): Facts => {
  if (event[1] === 'o') {
    const state = nextState(facts.state, event)
    return state === facts.state ? facts : { ...facts, state }
  }
  const next = {
    ...facts,
    state: nextState(facts.state, event),
    conversations: conversationsAfter(facts.conversations, event),
  }
  if (event[1] === 'i') return isTyped(event[2]) ? { ...next, typedAt: event[0] } : next
  if (event[1] === 'x') return { ...next, hostStopped: event[2].hostStopped }
  if (event[1] === 'r') {
    const [cols, rows] = event[2].split('x').map(Number)
    return { ...next, cols, rows }
  }
  if (event[1] === 'h') return hookFacts({ ...next, heardAt: event[0] }, event[0], startedAt, event[2])
  return next
}

export const factsOf = ({ header, events }: SessionLog): Facts => events.reduce(factsAfter(header.startedAt), initialFacts(header))

/** Rate limits belong to the account: the most recent reading of any session stands for all of them. */
export const latestRateLimits = (facts: Facts[]): Facts['rateLimits'] =>
  facts.reduce<Facts['rateLimits']>((latest, f) => (f.rateLimits && (!latest || f.rateLimits.at > latest.at) ? f.rateLimits : latest), undefined)
