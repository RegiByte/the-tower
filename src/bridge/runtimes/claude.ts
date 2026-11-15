/**
 * Claude Code's sessions as the folds read them: its classic hooks (posted by curl) and its mod's events, each read
 * here into what it means. Every other reader of a log works on what this gives, so Claude's field names stay here.
 */
import type { ClaudeHookInput, LogEvent, ModEvent, SessionHeader } from '../../shared/model.ts'
import { towerFactOf, type Happening, type Normalizer, type RuntimeReader } from '../events.ts'
import type { RateLimit, Tokens } from '../facts.ts'

type Hook = ClaudeHookInput | ModEvent

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

const clipped = (line: string) => (line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1)}…` : line)

/** One question of a worker's `AskUserQuestion`, as Claude logs it. */
type DialogQuestion = { question: string; header?: string }

/**
 * A question dialog in one line: each question, led by its header, and the label chosen, with the user's note
 * when they gave one. Claude logs the answers only in `PostToolUse`'s input, so a dialog not answered says so. It is
 * never clipped: a dialog is at most four questions, and `tower agent` has nothing to open a clipped decision with.
 */
const dialogLine = (input: Record<string, unknown>): string => {
  const questions = input.questions as DialogQuestion[]
  const answers = input.answers as Record<string, string> | undefined
  const annotations = (input.annotations ?? {}) as Record<string, { notes?: string }>
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
  return questions
    .map(({ question, header }) => {
      const answer = answers?.[question]
      const note = annotations[question]?.notes
      return `${header ? `${header}: ` : ''}${oneLine(question)} → ${answer === undefined ? 'unanswered' : `${oneLine(answer)}${note ? ` (${oneLine(note)})` : ''}`}`
    })
    .join(' · ')
}

/** A tool's input in one line: its telling field's first line, a path under the session's folder relative to it. */
const lineOf = (tool: string, input: Record<string, unknown>, cwd: string): string => {
  if (tool === 'AskUserQuestion' && Array.isArray(input.questions)) return dialogLine(input)
  const field = (LINE_FIELDS[tool] ?? []).find((f) => typeof input[f] === 'string' && input[f]) ?? Object.keys(input).find((f) => typeof input[f] === 'string' && input[f])
  const value = field ? String(input[field]).split('\n')[0] : ''
  const line = value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value
  return clipped(line)
}

/** A card says a little more of the current call than a brief's line does. */
const LABEL_CHARS = 280

const TOOL_ARG_KEYS = ['command', 'file_path', 'pattern', 'url', 'description', 'prompt']

/** The tool and its first telling argument (`command` for Bash), a heredoc's whole script included. */
const labelOf = (tool: string, input: Record<string, unknown>): string => {
  const arg = TOOL_ARG_KEYS.map((key) => input[key]).find((value) => typeof value === 'string') as string | undefined
  if (!arg) return tool
  const label = `${tool} ${arg}`
  return label.length > LABEL_CHARS ? `${label.slice(0, LABEL_CHARS - 1)}…` : label
}

type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

const tokensOf = (u: Usage): Tokens => ({
  input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
})

/**
 * Claude's `Stop` lists the background tasks (subagents, shells, monitors) still running and the session's crons
 * (`/loop`, `ScheduleWakeup`, `CronCreate`): each can wake the main loop into a new turn, which ends in its own `Stop`.
 */
const wakes = (hook: Hook): boolean => {
  const tasks = hook.background_tasks as { status: string }[]
  const crons = hook.session_crons as unknown[]
  return tasks.some((task) => task.status === 'running') || crons.length > 0
}

type SpawnResult = { model?: string; agentId?: string; deny?: string }

/**
 * Classic hooks carry the subagent whose loop raised them as `agent_id` (a compaction's since Claude 2.1.323), the
 * mod's events as `agentId`; no event carries both.
 */
const agentOf = (hook: Hook) => (hook.agent_id ?? hook.agentId) as string | undefined

const withAgent = (hook: Hook) => {
  const agent = agentOf(hook)
  return agent === undefined ? {} : { agent }
}

/**
 * What one hook line means. A compaction starts with the classic `PreCompact`, and outside a Team or Enterprise
 * organization also with the mod's `session.compact`: both carry the trigger, a trigger other than `manual` read as an
 * automatic one. It ends with `SessionStart` and `source: compact`, under the conversation it compacted.
 */
const happeningOf = (hook: Hook, cwd: string): Happening => {
  const agent = withAgent(hook)
  switch (hook.hook_event_name) {
    case 'SessionStart':
      return hook.source === 'compact'
        ? { t: 'compaction.ended', ...agent, conversation: String(hook.session_id) }
        : { t: 'conversation.entered', ...agent, id: String(hook.session_id), resumed: hook.source === 'resume' }
    case 'PreCompact':
    case 'session.compact':
      return { t: 'compaction.started', ...agent, trigger: hook.trigger === 'manual' ? 'manual' : 'auto' }
    case 'UserPromptSubmit':
      return { t: 'prompt.accepted', ...agent }
    case 'prompt.submit':
      return { t: 'prompt', origin: (hook.origin as { kind: string }).kind, text: String(hook.text) }
    case 'command.run': {
      const origin = (hook.origin as { kind?: string } | undefined)?.kind
      return { t: 'command', ...(origin !== undefined && { origin }) }
    }
    case 'turn.start':
      return { t: 'turn.started', ...agent }
    case 'turn.step': {
      const { answer, usage } = hook.result as { answer?: string; usage?: Usage }
      return {
        t: 'turn.step', ...agent, model: String(hook.model),
        ...(hook.effort !== undefined && { effort: hook.effort as string }),
        ...(answer !== undefined && { answer }),
        ...(usage && { tokens: tokensOf(usage) }),
      }
    }
    case 'turn.complete':
      return { t: 'turn.ended', ...agent, reason: String(hook.reason), ...(hook.answer ? { answer: String(hook.answer) } : {}) }
    case 'Stop':
      return { t: 'turn.stopped', ...agent, wakes: wakes(hook) }
    case 'tool.call': {
      const tool = String(hook.tool)
      const input = inputOf(hook)
      return { t: 'tool.call', ...agent, id: String(hook.tool_use_id), tool, input, line: lineOf(tool, input, cwd), label: labelOf(tool, input) }
    }
    case 'PreToolUse':
      return { t: 'tool.started', ...agent }
    case 'tool.check':
      return { t: 'tool.checked', id: String(hook.tool_use_id), result: hook.result as Record<string, unknown> }
    case 'tower.tool.result':
      return { t: 'tool.result', ...agent, id: String(hook.tool_use_id), deny: hook.deny, isError: hook.isError }
    case 'PostToolUse': {
      const input = hook.tool_input as Record<string, unknown>
      return {
        t: 'tool.done', ...agent, id: String(hook.tool_use_id), input, ms: hook.duration_ms as number | undefined,
        ...(hook.tool_name === 'AskUserQuestion' && { line: lineOf('AskUserQuestion', input, cwd) }),
      }
    }
    case 'PostToolUseFailure':
      return { t: 'tool.failed', ...agent, id: String(hook.tool_use_id), ms: hook.duration_ms as number | undefined, error: String(hook.error) }
    case 'tower.tool.abandoned':
      return { t: 'tool.abandoned', ...agent, id: String(hook.tool_use_id) }
    case 'PermissionRequest':
      return { t: 'permission.requested', ...agent }
    case 'Notification':
      return { t: 'notified', ...agent, kind: hook.notification_type === 'permission_prompt' ? 'permission' : String(hook.notification_type) }
    case 'session.measure': {
      const context = (hook.context as { percent?: number } | undefined)?.percent
      const cost = hook.cost as { usd: number } | undefined
      return { t: 'measured', ...(context !== undefined && { context }), ...(cost && { cost }), rateLimits: hook.rateLimits as RateLimit[] }
    }
    case 'agent.spawn': {
      const result = hook.result as SpawnResult | undefined
      const resumes = (hook.resume as { agentId: string } | undefined)?.agentId
      return {
        t: 'agent.spawned', call: String(hook.tool_use_id), type: String(hook.subagentType), description: String(hook.description),
        background: hook.background === true,
        ...(hook.parentAgentId !== undefined && { parent: hook.parentAgentId as string }),
        ...(result?.agentId !== undefined && { id: result.agentId }),
        ...(result?.model !== undefined && { model: result.model }),
        ...(result?.deny !== undefined && { deny: result.deny }),
        ...(resumes !== undefined && { resumes }),
      }
    }
    case 'tower.claude':
      return { t: 'runtime.release', version: String(hook.version) }
    case 'session.send':
      return { t: 'claude.sent', ...agent, to: String(hook.to), text: String(hook.text) }
    case 'session.receive':
      return { t: 'claude.received', text: String(hook.text) }
    default:
      return towerFactOf(hook) ?? { t: 'heard' }
  }
}

export const normalizeClaude = ({ cwd }: SessionHeader): Normalizer => (event: LogEvent) =>
  event[1] === 'h' ? [[event[0], 'e', happeningOf(event[2], cwd)]] : [event]

export const claude: RuntimeReader = { normalizer: normalizeClaude }
