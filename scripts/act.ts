/**
 * Act: drives one of a sandbox's sessions through a working Claude session's hook events, on cue, so a check can watch a
 * page react to tool calls, turns and messages as they arrive. Every event is shaped as Claude sends it, taken from the
 * recorded sessions in `test/fixtures/` (`tool-turn`, `step-answers`, `peer-receiver`, `clear`).
 *
 * It reaches only a sandbox: it reads `TOWER_SANDBOX` and `TOWER_URL`, which `npm run -s sandbox -- run` sets, and
 * refuses without them, or when they name the real system or disagree. Run it as
 *
 *   npm run -s sandbox -- run npm run -s tool:act -- <id> <verb> [options]
 *
 * with `<id>` a session the sandbox runs (`/spawn` one: `scripts/sandbox.ts`). The verbs:
 *
 *   turn [--prompt <text>] [--answer-lines <n>]   a whole turn: a prompt, a Read, and an answer of n lines (default 3)
 *   start-turn [--prompt <text>]                   the user's prompt opens a turn
 *   message --from <callsign> [--text <text>]      another worker's message arrives and opens a turn
 *   tool [--name <tool>] [--running]               a tool call (Read by default; Bash, Grep and Edit get inputs of their
 *                                                  own), finished at once, or left running with --running; one that
 *                                                  opens a message of Claude's raises its tool_use step after the call,
 *                                                  as Claude does: one beside a running call shares that one's message
 *   finish                                         the oldest running tool call finishes
 *   step <text>                                    Claude says something: the text of a message whose tool calls follow
 *   answer [--text <text>] [--answer-lines <n>]    the turn ends on its answer: its last step, Stop and turn.complete
 *   conversation                                   a new conversation, as `/clear` starts one; the next prompt saves it
 *   post <json>                                    one event exactly as given, for a shape the verbs don't make
 *
 * What it acts on is read from the session's log, never kept: the conversation, the open turn, its steps, the tool calls
 * still running and the model. A verb that doesn't fit where the session stands (a tool with no turn open, an answer
 * while a tool runs) is refused before anything is posted. Each event is folded with the log before it is posted, and
 * refused, named, when the fold can't take it; once posted, the board is read back until the session's card shows it,
 * and a card that says the fold is broken fails the run, naming the event. Each event is posted once the clock has
 * moved past the last one's, so no two share a millisecond, and no two turns a `startedAt`.
 *
 *   npm run -s sandbox -- run sh <<'SH'
 *   id=<a session the sandbox runs>; act() { npm run -s tool:act -- "$id" "$@"; }
 *   act start-turn --prompt 'Look around.'; act tool --name Bash --running; act tool; sleep 2; act finish
 *   act step 'Both read.'; act answer --answer-lines 2; act message --from BEOWULF-38; act answer
 *   SH
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { Card } from '../src/bridge/board.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { parseLog } from '../src/bridge/log.ts'
import { DEFAULT_CONFIG, sessionLogPath, systemPaths } from '../src/shared/paths.ts'
import type { SessionLog } from '../src/shared/model.ts'
import { towerUrl } from '../src/shared/model.ts'
import type { BoardMsg } from '../src/shared/shelf-page.ts'
import { readConfig } from '../src/system.ts'

type Hook = { hook_event_name: string; [field: string]: unknown }

/** Where the session stands, read from its log. */
type Scene = {
  cwd: string
  /** The conversation Claude is in: the last `SessionStart`'s. */
  conversation?: string
  /** The prompt the open conversation last accepted, which every classic hook of its turn names. */
  promptId?: string
  /** `last`: the turn's latest step or tool call, which says whether the next call opens a message of Claude's. */
  turn?: { id: string; startedAt: number; steps: number; last?: 'step' | 'call' }
  /** Tool calls started and not finished, oldest first. */
  running: { id: string; tool: string; input: Record<string, unknown> }[]
  model: string
  effort?: string
}

const SANDBOX_MODEL = 'claude-opus-9-9'

const hooksOf = (log: SessionLog): [number, Hook][] =>
  log.events.flatMap((event) => (event[1] === 'h' ? [[event[0], event[2] as Hook] as [number, Hook]] : []))

/** The scene once `hook`, logged at `at` (epoch ms), has happened. */
const sceneStep = (scene: Scene, hook: Hook, at: number): Scene => {
  switch (hook.hook_event_name) {
    case 'SessionStart':
      return hook.source === 'compact' ? scene : { ...scene, conversation: String(hook.session_id) }
    case 'UserPromptSubmit':
      return { ...scene, promptId: hook.prompt_id as string | undefined }
    case 'turn.start':
      return { ...scene, turn: { id: String(hook.turnId), startedAt: at, steps: 0 } }
    case 'turn.step':
      return {
        ...scene, model: String(hook.model), effort: hook.effort as string | undefined,
        turn: scene.turn && { ...scene.turn, steps: scene.turn.steps + 1, last: 'step' },
      }
    case 'turn.complete':
      return { ...scene, turn: undefined, running: [] }
    case 'tool.call': {
      const { tool, tool_use_id, hook_event_name, ...input } = hook
      return { ...scene, turn: scene.turn && { ...scene.turn, last: 'call' }, running: [...scene.running, { id: String(tool_use_id), tool: String(tool), input }] }
    }
    case 'tower.tool.result':
    case 'tower.tool.abandoned':
      return { ...scene, running: scene.running.filter((call) => call.id !== hook.tool_use_id) }
    default:
      return scene
  }
}

const sceneOf = (log: SessionLog): Scene =>
  hooksOf(log).reduce<Scene>((scene, [t, hook]) => sceneStep(scene, hook, log.header.startedAt + t * 1000), { cwd: log.header.cwd, running: [], model: SANDBOX_MODEL })

/** The scene once `hooks` are posted now. */
const sceneAfter = (scene: Scene, hooks: Hook[]): Scene => hooks.reduce((next, hook) => sceneStep(next, hook, Date.now()), scene)

/** The fields Claude's classic hooks carry in every conversation, and those of a turn once a prompt is accepted. */
const classic = (scene: Scene, conversation = scene.conversation): Hook => ({
  session_id: conversation,
  transcript_path: path.join(process.env.TOWER_SANDBOX!, 'transcripts', `${conversation}.jsonl`),
  cwd: scene.cwd,
  hook_event_name: '',
})
const ofTurn = (scene: Scene, name: string, fields: Record<string, unknown>): Hook => ({
  ...classic(scene), prompt_id: scene.promptId, permission_mode: 'default', ...fields, hook_event_name: name,
})

const usage = (scene: Scene, output: number) => ({ input_tokens: 10, output_tokens: output, cache_read_input_tokens: 25000, cache_creation_input_tokens: 1200, model: scene.model })

const stepOf = (scene: Scene, stopReason: string, answer: string): Hook => ({
  turnId: scene.turn!.id, index: scene.turn!.steps, model: scene.model, ...(scene.effort && { effort: scene.effort }),
  messageCount: 14 + scene.turn!.steps * 8, result: { stopReason, usage: usage(scene, 120), answer }, hook_event_name: 'turn.step',
})

/** A prompt as Claude takes one at its prompt: what the tower's mod hears, the classic hook, and the turn it opens. */
const prompting = (scene: Scene, origin: string, text: string): Hook[] => {
  const promptId = randomUUID()
  return [
    { text, wait: false, origin: { kind: origin }, hook_event_name: 'prompt.submit' },
    ofTurn({ ...scene, promptId }, 'UserPromptSubmit', { prompt: text }),
    { text, turnId: randomUUID(), hook_event_name: 'turn.start' },
  ]
}

/** What each tool is called with, inside the session's directory. */
const inputFor = (tool: string, cwd: string): Record<string, unknown> => {
  switch (tool) {
    case 'Read':
      return { file_path: path.join(cwd, 'README.md') }
    case 'Bash':
      return { command: 'sleep 5 && ls', description: 'Wait, then list the files' }
    case 'Grep':
      return { pattern: 'TODO', path: cwd, output_mode: 'files_with_matches' }
    case 'Edit':
      return { file_path: path.join(cwd, 'README.md'), old_string: 'lab', new_string: 'lab, acted', replace_all: false }
    default:
      return {}
  }
}

const finished = (scene: Scene, call: Scene['running'][number]): Hook[] => [
  ofTurn(scene, 'PostToolUse', { tool_name: call.tool, tool_input: call.input, tool_response: { stdout: '', stderr: '' }, tool_use_id: call.id, duration_ms: 40 }),
  { tool: call.tool, tool_use_id: call.id, hook_event_name: 'tower.tool.result' },
]

/**
 * Whether a tool call opens a message of Claude's, which raises its own `tool_use` step: one called beside a call still
 * running shares that call's message, and one after a `step` is that step's.
 */
const opensMessage = (scene: Scene) => scene.turn!.last !== 'step' && !(scene.turn!.last === 'call' && scene.running.length)

/** A tool call as Claude makes one: the call, the step of the message it opens, the check, and its end unless it runs on. */
const calling = (scene: Scene, tool: string, running: boolean): Hook[] => {
  const call = { id: `toolu_${randomUUID().replaceAll('-', '').slice(0, 24)}`, tool, input: inputFor(tool, scene.cwd) }
  return [
    { ...call.input, tool, tool_use_id: call.id, hook_event_name: 'tool.call' },
    ...(opensMessage(scene) ? [stepOf(scene, 'tool_use', '')] : []),
    ofTurn(scene, 'PreToolUse', { tool_name: tool, tool_input: call.input, tool_use_id: call.id }),
    { tool, tool_use_id: call.id, result: { decision: 'allow' }, hook_event_name: 'tool.check' },
    ...(running ? [] : finished(scene, call)),
  ]
}

const answering = (scene: Scene, answer: string): Hook[] => [
  stepOf(scene, 'end_turn', answer),
  ofTurn(scene, 'Stop', { stop_hook_active: false, last_assistant_message: answer, background_tasks: [], session_crons: [] }),
  {
    answer, durationMs: Math.max(1, Date.now() - scene.turn!.startedAt), isAborted: false, turnId: scene.turn!.id, reason: 'answer',
    usage: usage(scene, 300), hook_event_name: 'turn.complete',
  },
]

/** A message from another worker as Claude delivers it: received by the mod, then taken as a prompt of a peer's. */
const messaged = (scene: Scene, from: string, text: string): Hook[] => {
  const wrapped = `<cross-session-message from="uds:/tmp/cc-socks/4242.sock" from-name="${from}" from-mode="prompting">\n${text}\n</cross-session-message>`
  return [{ origin: { kind: 'peer' }, text: wrapped, hook_event_name: 'session.receive' }, ...prompting(scene, 'peer', wrapped)]
}

/** `/clear`: the command, the conversation's end, and the next one's start, which is saved once a prompt comes. */
const clearing = (scene: Scene): Hook[] => {
  const next = randomUUID()
  return [
    { command: 'clear', args: '', origin: { kind: 'composer' }, hook_event_name: 'command.run' },
    { ...classic(scene), prompt_id: scene.promptId, hook_event_name: 'SessionEnd', reason: 'clear' },
    { reason: 'clear', sessionId: scene.conversation, resume: { id: scene.conversation }, hook_event_name: 'session.end' },
    { ...classic(scene, next), hook_event_name: 'SessionStart', source: 'clear' },
  ]
}

const lines = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 'Done: the sandbox acted this turn out.' : `- line ${i + 1} of the answer`)).join('\n')

class Refused extends Error {}

const needTurn = (scene: Scene, verb: string) => {
  if (!scene.turn) throw new Refused(`${verb} needs an open turn, and the session has none: start-turn or message first`)
}
const needIdle = (scene: Scene, verb: string) => {
  if (scene.turn) throw new Refused(`${verb} needs the session at its prompt, and turn ${scene.turn.id} is open: answer it first`)
}
const needNothingRunning = (scene: Scene, verb: string) => {
  if (scene.running.length) throw new Refused(`${verb} while ${scene.running.map((c) => `${c.tool} (${c.id})`).join(', ')} still runs: finish it first`)
}

const OPTIONS = {
  prompt: { type: 'string' },
  'answer-lines': { type: 'string' },
  text: { type: 'string' },
  from: { type: 'string' },
  name: { type: 'string' },
  running: { type: 'boolean' },
} as const

type Values = { prompt?: string; 'answer-lines'?: string; text?: string; from?: string; name?: string; running?: boolean }

const answerLines = (given: string | undefined): number => {
  const n = Number(given ?? 3)
  if (!Number.isInteger(n) || n < 1) throw new Refused(`--answer-lines takes a whole number from 1, not "${given}"`)
  return n
}

const answerOf = (values: Values) => values.text ?? lines(answerLines(values['answer-lines']))

/**
 * The events a verb posts, given where the session stands. A whole turn plans each piece on the scene the one before
 * it leaves.
 */
const plan = (scene: Scene, verb: string, positionals: string[], values: Values): Hook[] => {
  switch (verb) {
    case 'start-turn':
      needIdle(scene, verb)
      return prompting(scene, 'composer', values.prompt ?? 'Read the README, then say what the lab is for.')
    case 'message':
      needIdle(scene, verb)
      if (!values.from) throw new Refused('message needs --from <callsign>, the worker it comes from')
      return messaged(scene, values.from, values.text ?? `A note from ${values.from}: the lab's checks are green.`)
    case 'tool':
      needTurn(scene, verb)
      return calling(scene, values.name ?? 'Read', values.running ?? false)
    case 'finish': {
      needTurn(scene, verb)
      const call = scene.running[0]
      if (!call) throw new Refused('finish needs a running tool call, and none runs: tool --running starts one')
      return finished(scene, call)
    }
    case 'step':
      needTurn(scene, verb)
      if (!positionals[0]) throw new Refused('step needs the text Claude says')
      return [stepOf(scene, 'tool_use', positionals[0])]
    case 'answer':
      needTurn(scene, verb)
      needNothingRunning(scene, 'answer')
      return answering(scene, answerOf(values))
    case 'turn': {
      needIdle(scene, verb)
      const opening = prompting(scene, 'composer', values.prompt ?? 'Read the README, then say what the lab is for.')
      const open = sceneAfter(scene, opening)
      const reading = calling(open, 'Read', false)
      return [...opening, ...reading, ...answering(sceneAfter(open, reading), answerOf(values))]
    }
    case 'conversation':
      needIdle(scene, verb)
      return clearing(scene)
    case 'post': {
      if (!positionals[0]) throw new Refused('post needs the event, as JSON')
      const event = parsed(positionals[0])
      if (typeof event?.hook_event_name !== 'string') throw new Refused(`post needs an event with a hook_event_name: ${positionals[0]}`)
      return [event]
    }
    default:
      throw new Refused(`no verb "${verb}": turn, start-turn, message, tool, finish, step, answer, conversation, post`)
  }
}

const parsed = (json: string): Hook => {
  try {
    return JSON.parse(json)
  } catch (err) {
    throw new Refused(`post needs the event as JSON, and ${JSON.stringify(json)} isn't: ${(err as Error).message}`)
  }
}

const nameOf = (hook: Hook) => `${hook.hook_event_name}${hook.tool ? ` (${hook.tool})` : ''}`

/** The sandbox the environment names, checked to be one: never the real system, and the tower its config serves. */
function sandbox() {
  const root = process.env.TOWER_SANDBOX
  const url = process.env.TOWER_URL
  if (!root || !url) throw new Refused('act reaches only a sandbox, and TOWER_SANDBOX or TOWER_URL is unset: run it as `npm run -s sandbox -- run npm run -s tool:act -- …`')
  const config = path.join(root, 'config.json')
  if (path.resolve(config) === path.resolve(DEFAULT_CONFIG)) throw new Refused(`TOWER_SANDBOX names the real system (${root}): act reaches only a sandbox`)
  if (!existsSync(config)) throw new Refused(`no sandbox at ${root}: npm run sandbox -- up`)
  const served = towerUrl(readConfig(config))
  if (served !== url) throw new Refused(`TOWER_URL is ${url}, and the sandbox at ${root} serves ${served}: run act through \`npm run -s sandbox -- run\``)
  return { url, paths: systemPaths(config) }
}

const readLog = (file: string): SessionLog => {
  if (!existsSync(file)) throw new Refused(`the sandbox has no session log ${file}: /spawn a session, and name its id`)
  return parseLog(readFileSync(file, 'utf8'))
}

/** The fold's error once `hook` is logged after the session's log, if the fold can't take it. */
const foldError = (log: SessionLog, hook: Hook): string | undefined => {
  const last = log.events.at(-1)?.[0] ?? 0
  return factsOf({ header: log.header, events: [...log.events, [last + 0.001, 'h', hook as never]] }).broken?.message
}

let lastPostedAt = 0

/** Posts `hook` to the session as its Claude would, once the clock has moved past the last post's millisecond. */
async function post(socket: string, id: string, hook: Hook): Promise<number> {
  while (Date.now() <= lastPostedAt) await new Promise((resolve) => setTimeout(resolve, 1))
  const sentAt = Date.now()
  await new Promise<void>((resolve, reject) => {
    const req = http.request({ socketPath: socket, path: `/hooks/${id}`, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        if (res.statusCode === 204) return resolve()
        if (res.statusCode === 404) return reject(new Refused(`the sandbox's host runs no session ${id}: is it live? (${nameOf(hook)} not posted)`))
        reject(new Error(`the host answered ${res.statusCode} to ${nameOf(hook)}: ${body}`))
      })
    })
    req.on('error', reject)
    req.end(JSON.stringify(hook))
  })
  lastPostedAt = Date.now()
  return sentAt
}

async function card(url: string, id: string): Promise<Card> {
  const res = await fetch(`${url}/board`)
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`the tower at ${url} closed the board stream before sending a board`)
    text += value
  }
  await reader.cancel()
  const msg: BoardMsg = JSON.parse(text.split('\n').find((line) => line.startsWith('data:'))!.slice('data:'.length))
  if ('error' in msg) throw new Error(`the tower at ${url} can't build the board: ${msg.error.message}`)
  const found = msg.board.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  if (!found) throw new Refused(`the board at ${url} has no card for session ${id}`)
  return found
}

const BOARD_WAIT_MS = 5000

/** Reads the board until the session's card has heard `hook`, failing when the card says its fold broke. */
async function confirm(url: string, id: string, hook: Hook, sentAt: number) {
  const until = Date.now() + BOARD_WAIT_MS
  for (;;) {
    const seen = await card(url, id)
    if (seen.broken) throw new Error(`${nameOf(hook)} broke session ${id}'s fold: ${seen.broken.message}. Its card stays broken until the user lets it go. The event: ${JSON.stringify(hook)}`)
    if ((seen.heardAt ?? 0) >= sentAt) return
    if (Date.now() > until) throw new Error(`the board never showed ${nameOf(hook)} on session ${id} within ${BOARD_WAIT_MS} ms`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function act(id: string, verb: string, positionals: string[], values: Values) {
  const { url, paths } = sandbox()
  const file = sessionLogPath(paths, id)
  const log = readLog(file)
  const broken = factsOf(log).broken
  if (broken) throw new Refused(`session ${id}'s fold broke at ${broken.at}s on a "${broken.code}" line (${broken.message}), before this run: spawn another session`)
  const hooks = plan(sceneOf(log), verb, positionals, values)
  for (const hook of hooks) {
    const error = foldError(readLog(file), hook)
    if (error) throw new Refused(`${nameOf(hook)} refused, not posted: the session's fold can't take it (${error}). The event: ${JSON.stringify(hook)}`)
    const sentAt = await post(paths.hooks, id, hook)
    await confirm(url, id, hook, sentAt)
    console.log(`${id} ${nameOf(hook)}`)
  }
}

const { positionals, values } = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true })
const [id, verb, ...rest] = positionals
try {
  if (!id || !verb) throw new Refused('usage: npm run -s tool:act -- <session id> <verb> [options]: the verbs are in scripts/act.ts')
  await act(id, verb, rest, values)
} catch (err) {
  if (!(err instanceof Refused)) throw err
  console.error(`act: ${err.message}`)
  process.exitCode = 1
}
