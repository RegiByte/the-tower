/**
 * opencode's sessions as the folds read them: its bus events as the tower plugin (`src/mod/opencode`) posts them, each
 * an envelope `{id, created, type, location, data}` under its own type, and the plugin's own lines. opencode's field
 * names stay here.
 *
 * One execution is not one prompt: a prompt sent while one runs waits in the session's inbox and is delivered inside
 * it, so status follows executions and the Brief opens a turn where its prompt is delivered. A subagent runs in a child
 * session, whose lines carry the `parentID` the plugin adds; its session id is the subagent.
 */
import type { LogEvent, ModEvent, SessionHeader } from '../../shared/model.ts'
import { RESUMES, towerFactOf, type Happening, type Normalizer, type RuntimeModel, type RuntimeReader, type ToolFormat } from '../events.ts'
import type { Tokens } from '../facts.ts'

type Line = ModEvent & { data?: Record<string, unknown>; parentID?: string; model?: ModelRef; spawned?: Spawned; total?: number }

/** A subagent's session as the plugin reports it on the first progress of the call that runs it. */
type Spawned = { agent: string; title: string; model: ModelRef }

type ModelRef = { id: string; providerID: string; variant?: string }

type StepTokens = { input: number; output: number; reasoning: number; cache: { read: number; write: number } }

const tokensOf = ({ input, output, cache }: StepTokens): Tokens => ({ input, output, cacheRead: cache.read, cacheWrite: cache.write })

/** A model as a launch names it, and its variant as the effort: opencode's `default` variant is none. */
const modelOf = (ref: ModelRef) => ({ model: `${ref.providerID}/${ref.id}`, ...(ref.variant && ref.variant !== 'default' && { effort: ref.variant }) })

/** The tool's output is left out by the plugin; what it reports of a shell command's exit stays. */
const failedExit = (data: Record<string, unknown>) => {
  const exit = (data.metadata as { exit?: number } | undefined)?.exit
  return exit !== undefined && exit !== 0
}

/** The subagent a call started: the call's session is its parent, when that is a subagent's too. */
const spawnOf = (line: Line, { agent, title, model }: Spawned): Happening => {
  const data = line.data as { sessionID: string; id: string; metadata: { sessionID: string } }
  return {
    t: 'agent.spawned', call: data.id, id: data.metadata.sessionID, type: agent, description: title, background: false,
    model: modelOf(model).model, ...(line.parentID !== undefined && { parent: data.sessionID }),
  }
}

/** What a step or a compaction cost: a step the provider refused states none. */
const chargedBy = (data: Record<string, unknown>): Happening[] => (typeof data.cost === 'number' ? [{ t: 'charged', usd: data.cost }] : [])

const heardIfNone = (happenings: Happening[]): Happening[] => (happenings.length ? happenings : [{ t: 'heard' }])

/** What one line means: none, one or several events. */
const happeningsOf = (line: Line): Happening[] => {
  const data = line.data ?? {}
  const session = data.sessionID ?? (data.form as { sessionID?: string } | undefined)?.sessionID ?? line.sessionID
  const agent = line.parentID === undefined ? {} : { agent: String(session) }
  const main = line.parentID === undefined
  switch (line.hook_event_name) {
    case 'plugin.started': {
      const known: Happening[] = [
        { t: 'runtime.release', version: String((line.app as { version: string }).version) },
        { t: 'runtime.models', models: line.models as RuntimeModel[] },
      ]
      return line.reloaded ? known : [...known, { t: 'ready' }]
    }
    case RESUMES:
      return [towerFactOf(line)!, { t: 'conversation.entered', id: String(line.conversation), resumed: true }]
    case 'session.created':
      return main ? [{ t: 'conversation.entered', id: String(data.sessionID), resumed: false }] : [{ t: 'heard' }]
    case 'session.inbox.enqueued': {
      if (!main) return [{ t: 'heard' }]
      const item = data.item as { type: string; payload: { text?: string } }
      if (item.type === 'user') return [{ t: 'prompt', origin: 'composer', text: String(item.payload.text), id: String(data.inboxID) }]
      return [{ t: 'command', origin: 'composer' }]
    }
    case 'session.inbox.delivered':
      return [{ t: 'prompt.accepted', ...agent, id: String(data.inboxID) }]
    case 'session.execution.started':
      return [{ t: 'turn.started', ...agent }]
    case 'session.execution.succeeded':
      return main ? [{ t: 'turn.ended', reason: 'ok' }, { t: 'turn.stopped', wakes: false }] : [{ t: 'turn.ended', ...agent, reason: 'ok' }]
    case 'session.execution.interrupted':
      return [{ t: 'turn.ended', ...agent, reason: 'aborted' }]
    case 'session.execution.failed':
      return [{ t: 'turn.ended', ...agent, reason: 'error' }]
    case 'session.step.ended':
      return heardIfNone([...(line.model ? [{ t: 'turn.step', ...agent, ...modelOf(line.model), tokens: tokensOf(data.tokens as StepTokens) } as const] : []), ...chargedBy(data)])
    case 'session.step.failed':
      return heardIfNone(chargedBy(data))
    case 'session.text.ended':
      return [{ t: 'said', ...agent, text: String(data.text) }]
    case 'session.retry.scheduled':
      return [{ t: 'turn.retrying', ...agent, at: Number(data.at) }]
    case 'tool.execute.before':
      return [{ t: 'tool.call', ...agent, id: String(line.id), tool: String(line.tool), input: line.input as Record<string, unknown> }]
    case 'session.tool.success':
      return [{ t: 'tool.result', ...agent, id: String(data.id), isError: failedExit(data) }]
    case 'session.tool.progress':
      return line.spawned ? [spawnOf(line, line.spawned)] : [{ t: 'heard' }]
    case 'session.tool.failed': {
      const error = data.error as { type: string; message: string }
      if (error.type === 'aborted') return [{ t: 'tool.abandoned', ...agent, id: String(data.id) }]
      return [{ t: 'tool.failed', ...agent, id: String(data.id), error: error.message }, { t: 'tool.result', ...agent, id: String(data.id), isError: true }]
    }
    case 'permission.asked':
      return [{ t: 'permission.requested', ...agent }]
    case 'permission.replied':
      return [{ t: 'permission.answered', ...agent, reply: String(data.reply) }]
    case 'form.created':
      return [{ t: 'notified', ...agent, kind: 'question' }]
    case 'form.replied':
      return [{ t: 'permission.answered', ...agent, reply: 'answered' }]
    case 'form.cancelled':
      return [{ t: 'permission.answered', ...agent, reply: 'cancelled' }]
    case 'session.compaction.started':
      return [{ t: 'compaction.started', ...agent, trigger: data.reason === 'manual' ? 'manual' : 'auto' }]
    case 'session.compaction.ended':
      return [{ t: 'compaction.ended', ...agent }, ...chargedBy(data)]
    case 'session.compaction.failed':
      return [{ t: 'compaction.failed', ...agent }]
    case 'session.usage.updated': {
      const usd = line.total ?? (main ? Number(data.cost) : undefined)
      return usd === undefined ? [{ t: 'heard' }] : [{ t: 'measured', cost: { usd }, rateLimits: [] }]
    }
    case 'plugin.failed':
      return [{ t: 'events.lost', error: String(line.message) }]
    case 'session.renamed':
      return [{ t: 'conversation.titled', ...agent, title: String(data.title) }]
    default:
      return [towerFactOf(line) ?? { t: 'heard' }]
  }
}

export const normalizeOpencode = (_header: SessionHeader): Normalizer => (event: LogEvent) =>
  event[1] === 'h' ? happeningsOf(event[2] as Line).map((happening) => [event[0], 'e', happening]) : [event]

/** The fields of a tool's input that say in a line what a call does, the first one present winning. */
const LINE_FIELDS: Record<string, string[]> = {
  shell: ['description', 'command'],
  read: ['path'],
  write: ['path'],
  edit: ['path'],
  grep: ['pattern'],
  glob: ['pattern'],
  skill: ['name'],
  subagent: ['description'],
  webfetch: ['url'],
  websearch: ['query'],
}

const LINE_CHARS = 160

const LABEL_CHARS = 280

const clipped = (text: string, chars: number) => (text.length > chars ? `${text.slice(0, chars - 1)}…` : text)

/** The telling argument of a call: its tool's line field, else its first string. */
const argOf = (tool: string, input: Record<string, unknown>): string | undefined => {
  const field = (LINE_FIELDS[tool] ?? []).find((f) => typeof input[f] === 'string' && input[f]) ?? Object.keys(input).find((f) => typeof input[f] === 'string' && input[f])
  return field === undefined ? undefined : String(input[field])
}

/**
 * opencode's tool calls in words. opencode runs in the real path of the session's folder, so a path under it is
 * relative to either spelling (`/tmp/…` is `/private/tmp/…` on macOS).
 */
export const opencodeTools = ({ cwd }: SessionHeader): ToolFormat => {
  const roots = [cwd, `/private${cwd}`].map((root) => `${root}/`)
  const relative = (value: string) => {
    if (roots.some((r) => value === r.slice(0, -1))) return '.'
    const root = roots.find((r) => value.startsWith(r))
    return root ? value.slice(root.length) : value
  }
  return {
    line: (tool, input) => clipped(relative((argOf(tool, input) ?? '').split('\n')[0]), LINE_CHARS),
    label: (tool, input) => {
      const arg = argOf(tool, input)
      return arg === undefined ? tool : clipped(`${tool} ${arg}`, LABEL_CHARS)
    },
  }
}

export const opencode: RuntimeReader = { normalizer: normalizeOpencode, tools: opencodeTools }
