import type { LogEvent, ModEvent, SessionHeader } from '../shared/model.ts'
import type { RateLimit, Tokens } from './facts.ts'

/**
 * A `tower.*` fact as the host logs it, in the envelope it takes for every runtime: its name under
 * `hook_event_name`, its fields beside it.
 */
export const towerFact = (name: string, fields: Record<string, unknown> = {}): ModEvent => ({ hook_event_name: name, ...fields })

/** The fact a resume's conversation is logged as, before the session starts: read by a runtime's normalizer that needs it. */
export const RESUMES = 'tower.resumes'

/** The bytes that open a `tower.*` fact named `name` in a log line, for a reader that skims lines unparsed. */
export const towerFactBytes = (name: string): string => `"hook_event_name":"${name}"`

/** Whether `event` is the tower's fact `name`, read in the envelope alone: whatever the runtime, it can't fail. */
export const isTowerFact = (event: LogEvent, name: string): boolean => event[1] === 'h' && event[2].hook_event_name === name

/** The fact an `h` line holds when it is one of the tower's own, `undefined` when the runtime raised it. */
export const towerFactOf = ({ hook_event_name: name, ...fields }: ModEvent): TowerFact | undefined =>
  name.startsWith('tower.') ? { ...fields, t: name as TowerFact['t'] } : undefined

/** What every runtime raises that the folds read. `agent`: the subagent whose loop raised it, absent for the main loop. */
export type Neutral =
  /** The runtime is at its prompt, ready for one: it booted, or a conversation started. */
  | { t: 'ready'; agent?: string }
  | { t: 'conversation.entered'; agent?: string; id: string; resumed: boolean }
  | { t: 'compaction.started'; agent?: string; trigger: 'manual' | 'auto' }
  /** `conversation`: the one it continues under, when compacting moves it to a new id. */
  | { t: 'compaction.ended'; agent?: string; conversation?: string }
  | { t: 'compaction.failed'; agent?: string }
  /**
   * The runtime took a prompt into its conversation, which it then keeps. `id`: the queued prompt it delivers, when
   * the runtime queues a prompt sent mid-turn and delivers it inside the running turn.
   */
  | { t: 'prompt.accepted'; agent?: string; id?: string }
  /** `id`: the prompt waits in a queue until a `prompt.accepted` with the same id delivers it. */
  | { t: 'prompt'; origin: string; text: string; id?: string }
  | { t: 'command'; origin?: string }
  | { t: 'turn.started'; agent?: string }
  | { t: 'turn.step'; agent?: string; model: string; effort?: string; answer?: string; tokens?: Tokens }
  /** The text a step said, for a runtime that logs it apart from the step: the last one before a turn ends is its answer. */
  | { t: 'said'; agent?: string; text: string }
  | { t: 'turn.ended'; agent?: string; reason: string; answer?: string }
  /** The model's request failed and is tried again at `at` (epoch ms): an outage or a provider's limit. */
  | { t: 'turn.retrying'; agent?: string; at: number }
  /** The main loop stopped; `wakes`, something it started can start its next turn without the user. */
  | { t: 'turn.stopped'; agent?: string; wakes: boolean }
  /** How the call reads in words is the runtime's `ToolFormat`, derived where it is drawn. */
  | { t: 'tool.call'; agent?: string; id: string; tool: string; input: Record<string, unknown> }
  | { t: 'tool.started'; agent?: string }
  | { t: 'tool.checked'; id: string; result: Record<string, unknown> }
  | { t: 'tool.result'; agent?: string; id: string; deny?: unknown; isError?: unknown }
  /** `input`: the call's input as the tool ran it, which can say more than its call did (a question dialog's answers). */
  | { t: 'tool.done'; agent?: string; id: string; input?: Record<string, unknown>; ms?: number }
  | { t: 'tool.failed'; agent?: string; id: string; ms?: number; error: string }
  | { t: 'tool.abandoned'; agent?: string; id: string }
  | { t: 'permission.requested'; agent?: string }
  /** The user answered an ask: `once`, `always`, `reject`, or a question's answer (`answered`). */
  | { t: 'permission.answered'; agent?: string; reply: string }
  | { t: 'notified'; agent?: string; kind: string }
  | { t: 'measured'; context?: number; cost?: { usd: number }; rateLimits: RateLimit[] }
  /** What one model request cost, for a runtime that says it besides its running total: the next `measured` cost holds it. */
  | { t: 'charged'; usd: number }
  /** `call`, the tool call that spawned it; `id`, the subagent's loop; `resumes`, the loop a resume opens again. */
  | { t: 'agent.spawned'; call: string; type: string; description: string; background: boolean; parent?: string; id?: string; model?: string; deny?: string; resumes?: string }
  | { t: 'runtime.release'; version: string }
  /** The models the runtime can run, each with its efforts and its context window in tokens, as it reported them. */
  | { t: 'runtime.models'; models: RuntimeModel[] }
  /** The runtime's events stopped reaching the tower: what posts them failed, with its error. */
  | { t: 'events.lost'; error: string }
  /** The runtime named the conversation. */
  | { t: 'conversation.titled'; agent?: string; title: string }
  /** Something the runtime raised that no fold reads: it still says the session was heard from. */
  | { t: 'heard' }

/** A model a runtime can run: `id` as a launch names it, the efforts it takes ([] for none), its context window in tokens. */
export type RuntimeModel = { id: string; efforts: string[]; context: number }

/** One of the tower's own facts, logged in every runtime's log alike: its fields as the tower wrote them. */
export type TowerFact = { t: `tower.${string}`; [field: string]: unknown }

/** What only Claude raises: the messages between Claude sessions. */
export type ClaudeExtra =
  | { t: 'claude.sent'; agent?: string; to: string; text: string }
  | { t: 'claude.received'; text: string }

/**
 * What an `e` event holds. The set is internal to the bridge: it never reaches the board, the API or a log, so it can
 * change freely. Its neutral part was drawn from Claude's events alone; the second runtime's recorded fixtures reshape it.
 */
export type Happening = Neutral | TowerFact | ClaudeExtra

/** A log event as the folds read it: the host's own events as logged, a runtime's hook line as what it means. */
export type NormalEvent = Exclude<LogEvent, [number, 'h', unknown]> | [t: number, code: 'e', event: Happening]

/** A runtime's reading of its sessions' logs: one line in, what it means out, in log order. */
export type Normalizer = (event: LogEvent) => NormalEvent[]

/**
 * How a runtime says one of its tool calls in words: `line`, the call in one line for a brief; `label`, the tool and
 * its telling argument for a card. Presentation, not what happened: the normalizer leaves it out, so a call it can't
 * word costs only what draws it.
 */
export type ToolFormat = {
  line: (tool: string, input: Record<string, unknown>) => string
  label: (tool: string, input: Record<string, unknown>) => string
}

/** How the bridge reads one runtime's logs, and words its tool calls. */
export type RuntimeReader = { normalizer: (header: SessionHeader) => Normalizer; tools: (header: SessionHeader) => ToolFormat }
