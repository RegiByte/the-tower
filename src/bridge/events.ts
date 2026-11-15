import type { LogEvent, ModEvent, SessionHeader } from '../shared/model.ts'
import type { RateLimit, Tokens } from './facts.ts'

/**
 * A `tower.*` fact as the host logs it, in the envelope it takes for every runtime: its name under
 * `hook_event_name`, its fields beside it.
 */
export const towerFact = (name: string, fields: Record<string, unknown> = {}): ModEvent => ({ hook_event_name: name, ...fields })

/** The bytes that open a `tower.*` fact named `name` in a log line, for a reader that skims lines unparsed. */
export const towerFactBytes = (name: string): string => `"hook_event_name":"${name}"`

/** Whether `event` is the tower's fact `name`, read in the envelope alone: whatever the runtime, it can't fail. */
export const isTowerFact = (event: LogEvent, name: string): boolean => event[1] === 'h' && event[2].hook_event_name === name

/** The fact an `h` line holds when it is one of the tower's own, `undefined` when the runtime raised it. */
export const towerFactOf = ({ hook_event_name: name, ...fields }: ModEvent): TowerFact | undefined =>
  name.startsWith('tower.') ? { ...fields, t: name as TowerFact['t'] } : undefined

/** What every runtime raises that the folds read. `agent`: the subagent whose loop raised it, absent for the main loop. */
export type Neutral =
  | { t: 'conversation.entered'; agent?: string; id: string; resumed: boolean }
  | { t: 'compaction.started'; agent?: string; trigger: 'manual' | 'auto' }
  | { t: 'compaction.ended'; agent?: string; conversation: string }
  /** The runtime took a prompt into its conversation, which it then keeps. */
  | { t: 'prompt.accepted'; agent?: string }
  | { t: 'prompt'; origin: string; text: string }
  | { t: 'command'; origin?: string }
  | { t: 'turn.started'; agent?: string }
  | { t: 'turn.step'; agent?: string; model: string; effort?: string; answer?: string; tokens?: Tokens }
  | { t: 'turn.ended'; agent?: string; reason: string; answer?: string }
  /** The main loop stopped; `wakes`, something it started can start its next turn without the user. */
  | { t: 'turn.stopped'; agent?: string; wakes: boolean }
  /** `line`, the call in one line for a brief; `label`, the tool and its telling argument for a card. */
  | { t: 'tool.call'; agent?: string; id: string; tool: string; input: Record<string, unknown>; line: string; label: string }
  | { t: 'tool.started'; agent?: string }
  | { t: 'tool.checked'; id: string; result: Record<string, unknown> }
  | { t: 'tool.result'; agent?: string; id: string; deny?: unknown; isError?: unknown }
  /** `line`: the call in one line again, when only its end can say it (a question dialog's answers). */
  | { t: 'tool.done'; agent?: string; id: string; input: Record<string, unknown>; ms?: number; line?: string }
  | { t: 'tool.failed'; agent?: string; id: string; ms?: number; error: string }
  | { t: 'tool.abandoned'; agent?: string; id: string }
  | { t: 'permission.requested'; agent?: string }
  | { t: 'notified'; agent?: string; kind: string }
  | { t: 'measured'; context?: number; cost?: { usd: number }; rateLimits: RateLimit[] }
  /** `call`, the tool call that spawned it; `id`, the subagent's loop; `resumes`, the loop a resume opens again. */
  | { t: 'agent.spawned'; call: string; type: string; description: string; background: boolean; parent?: string; id?: string; model?: string; deny?: string; resumes?: string }
  | { t: 'runtime.release'; version: string }
  /** Something the runtime raised that no fold reads: it still says the session was heard from. */
  | { t: 'heard' }

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

/** How the bridge reads one runtime's logs. */
export type RuntimeReader = { normalizer: (header: SessionHeader) => Normalizer }
