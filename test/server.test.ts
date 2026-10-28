/**
 * The renderer API end to end: the tower server (`src/tower/server.ts`) booted as its own process on a throwaway system
 * root, read and driven over HTTP. No host or terms daemon runs: the one session is a log written into the root, which
 * is all the session reads need.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { z } from 'zod'
import { ApiError, ROUTES, type Replies, type Verb } from '../src/shared/api.ts'
import boardSchema from '../src/shared/board.schema.json' with { type: 'json' }
import { fonts } from '../src/shared/design.ts'
import { parseThread, unseenBy } from '../extensions/reviews/client/reviews.ts'
import type { FloorPart } from '../extensions/reviews/threads.ts'
import type { Adds } from '../src/shared/extensions.ts'
import type { BoardMsg, Reads } from '../src/shared/shelf-page.ts'
import type { Card } from '../src/bridge/board.ts'
import { MODULES } from '../src/tower/served.ts'
import { decide, standing } from '../extensions/policies/client/policies.ts'
import { slotWords } from '../src/shared/slots.ts'
import { callsignsOf } from '../src/shared/model.ts'
import { tagOf } from '../src/shared/tags.ts'

/**
 * A zone of whole hours where now is about noon. The board keeps a finished card only while it started that local day
 * (`onBoard`), and sessions are seeded minutes before now: in this zone, they always started today.
 */
const noonZone = (now: number) => {
  const behind = new Date(now).getUTCHours() - 12
  return behind === 0 ? 'Etc/GMT' : `Etc/GMT${behind > 0 ? '+' : '-'}${Math.abs(behind)}`
}
process.env.TZ = noonZone(Date.now())

const REPO = path.join(import.meta.dirname, '..')
const ROOT = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tower-api-')))
const HUB = path.join(ROOT, 'lab')
/** A floor that keeps no review threads. */
const BARE = path.join(ROOT, 'bare')
const RENDERER = path.join(ROOT, 'renderer')
const SESSION = '20261004-210927-2c96'
/** A worker with a saved conversation in the hub's main checkout, whose work a reviewer can be hired on. */
const LAB_AUTHOR = '20261004-211500-a7e1'
const SHOWN = path.join(HUB, 'report', 'index.html')
const FIXTURES = path.join(REPO, 'test', 'fixtures', 'extensions')
/** The extensions run from copies in the root, so a test edits their code. */
const EXTENSIONS = path.join(ROOT, 'extensions')
const PULSE = path.join(EXTENSIONS, 'pulse')
const CHIME = path.join(EXTENSIONS, 'chime')
const TALLY = path.join(EXTENSIONS, 'tally')
const ROLES = path.join(EXTENSIONS, 'roles')
const BUILDER = '# Builder\n\nBuilds what it is asked, and tests it.\n'

const BOOT_MS = 15_000

let tower: ChildProcess
let host: ChildProcess
let base: string

const gitIn = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args], { encoding: 'utf8' })
const git = (...args: string[]) => gitIn(HUB, ...args)

const POLICY = '# Nightly\n\n```json\n{"when": {"cron": ["0 3 1 1 *"]}}\n```\n\nNever started: a run waits on the user\'s approval.\n'

const MIN = 60_000
/** The minute the root is seeded in: the kept policies' slots are placed around it. */
const SEEDED = Math.floor(Date.now() / MIN) * MIN
/** A daily cron, read in UTC, whose slot falls at `at`'s time of day. */
const dailyAt = (at: number) => `${new Date(at).getUTCMinutes()} ${new Date(at).getUTCHours()} * * *`
const policyText = (title: string, header: object) => `# ${title}\n\n\`\`\`json\n${JSON.stringify(header)}\n\`\`\`\n\nDo the ${title.toLowerCase()}.\n`
/** A slot as the policies' facts name it: an ISO instant to the second. */
const slotIso = (at: number) => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z')
/** The approval hash: the sha256 of the file's bytes. */
const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
/**
 * Policies kept, approved, offered and run before the policies extension: an approved `auto` one whose slot is ahead, an
 * `ask` one with an open offer, an approved `auto` one whose slot is due and already ran (by the seeded session), and an
 * invalid one that was approved once.
 */
const KEPT = {
  sweep: { id: 'sweep.md', slot: SEEDED + 3 * 60 * MIN, text: policyText('Sweep', { when: { cron: [dailyAt(SEEDED + 3 * 60 * MIN)], tz: 'UTC' }, start: 'auto' }) },
  triage: { id: 'triage.md', slot: SEEDED - 60 * MIN, text: policyText('Triage', { when: { cron: [dailyAt(SEEDED - 60 * MIN)], tz: 'UTC' }, live: 2 }) },
  digest: { id: 'digest.md', slot: SEEDED - MIN, text: policyText('Digest', { when: { cron: [dailyAt(SEEDED - MIN)], tz: 'UTC' }, start: 'auto', check: 'true' }) },
  broken: { id: 'broken.md', slot: 0, text: policyText('Broken', { when: { cron: ['0 9 * * 1'] }, guards: {} }) },
}
const OFFERED_AT = KEPT.triage.slot + 4_000
const RAN_AT = KEPT.digest.slot + 2_000
const CHECKED = { exit: 0, ms: 12, out: 'two to do' }

/** A project stream's month files, as the tower writes them: a header, then `[seconds into the month, code, fact]`. */
function writeStream(project: string, stream: string, facts: [at: number, code: string, fact: object][]) {
  const dir = path.join(ROOT, 'streams', 'projects', project, stream)
  mkdirSync(dir, { recursive: true })
  for (const [at, code, fact] of facts) {
    const month = Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), 1)
    const file = path.join(dir, `${new Date(at).toISOString().slice(0, 7)}.jsonl`)
    if (!existsSync(file)) writeFileSync(file, JSON.stringify({ stream, startedAt: month, version: 1 }) + '\n')
    appendFileSync(file, JSON.stringify([Math.round(at - month) / 1000, code, fact]) + '\n')
  }
}

function seedPolicies() {
  for (const { id, text } of Object.values(KEPT)) writeFileSync(path.join(ROOT, 'collections', 'lab', 'policies', id), text)
  writeStream('lab', 'approvals', [
    [SEEDED - 3 * 60 * MIN, 'a', { policy: KEPT.broken.id, hash: sha('# Broken, as it was') }],
    [SEEDED - 2 * 60 * MIN, 'a', { policy: KEPT.sweep.id, hash: sha(KEPT.sweep.text) }],
    [SEEDED - 2 * 60 * MIN + 1_000, 'a', { policy: KEPT.digest.id, hash: sha(KEPT.digest.text), by: SESSION }],
  ])
  writeStream('lab', 'runs', [
    [OFFERED_AT, 's', { policy: KEPT.triage.id, hash: sha(KEPT.triage.text), slot: slotIso(KEPT.triage.slot), outcome: 'offered' }],
    [RAN_AT, 'r', { policy: KEPT.digest.id, hash: sha(KEPT.digest.text), id: SESSION, check: CHECKED, start: 'auto', slot: slotIso(KEPT.digest.slot) }],
  ])
}

/**
 * A second floor, `desk`, whose review threads were written before the reviews extension: a hub with three worktrees
 * cut from `main` (`odin-1` holding a commit, `lark-3` holding none, and `odin-1-review`, a fork of `odin-1`), a worker in
 * each, the fork's a reviewer of odin-1's, and threads on `main`, `odin-1`, `kite-2` (a checkout git no longer knows)
 * and `lark-3`'s filed by Tidy after its worker started.
 */
const DESK = path.join(ROOT, 'desk')
const DESK_STARTED = Math.floor(Date.now() / MIN) * MIN - 50 * MIN
const DESK_SESSIONS = { author: '20261004-200000-0d01', reviewer: '20261004-200100-0d02', lark: '20261004-200200-0d03', past: '20261001-090000-0d04' }
const deskCallsign = callsignsOf({ projects: {} } as Parameters<typeof callsignsOf>[0])
const AUTHOR = deskCallsign(DESK_SESSIONS.author)
const REVIEWER = deskCallsign(DESK_SESSIONS.reviewer)
const localStamp = (at: number) => {
  const d = new Date(at)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}
const FILED_AT = localStamp(DESK_STARTED + 30 * MIN)
const FILED_ID = `lark-3@${FILED_AT.replace(' ', '-').replace(':', '')}.md`
const DESK_THREADS: Record<string, string> = {
  'main.md': `# main\n\n## Ana · ${localStamp(DESK_STARTED)} · n1\nThe main checkouts look clean.\n`,
  'odin-1.md':
    `# odin-1\n\n## Ana · ${localStamp(DESK_STARTED + MIN)} · n1\n\`desk:src/a.ts:1-2\`\n\`\`\`ts\none\ntwo\n\`\`\`\nWhy two lines?\n\n` +
    `## ${AUTHOR} · ${localStamp(DESK_STARTED + 2 * MIN)} · n2 · re n1\nOne per case.\n\n` +
    `## ${REVIEWER} · ${localStamp(DESK_STARTED + 3 * MIN)} · n3\n**fix first**: the second case has no test.\n\n` +
    `## Ana · ${localStamp(DESK_STARTED + 4 * MIN)} · n4\nAnd name the file.\n`,
  'kite-2.md': `# kite-2\n\n## Ana · ${localStamp(DESK_STARTED - 10 * MIN)} · n1\nWhere did this go?\n`,
  [FILED_ID]: `# lark-3\n\n## ${deskCallsign(DESK_SESSIONS.lark)} · ${localStamp(DESK_STARTED + 5 * MIN)} · n1\n**ship**\n`,
}
const deskGit = (...args: string[]) => execFileSync('git', ['-C', DESK, '-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args], { stdio: 'ignore' })

function seedDesk() {
  mkdirSync(path.join(DESK, 'src'), { recursive: true })
  writeFileSync(path.join(DESK, 'src', 'a.ts'), 'one\n')
  execFileSync('git', ['init', '-q', '-b', 'main', DESK])
  writeFileSync(path.join(DESK, '.git', 'info', 'exclude'), '.worktrees/\n')
  deskGit('add', '.')
  deskGit('commit', '-q', '-m', 'first')
  const cut = (name: string, from: string, fields: Record<string, string>) => {
    deskGit('worktree', 'add', '-q', '-b', `tower/${name}`, path.join(DESK, '.worktrees', name), from)
    for (const [key, value] of Object.entries({ towerBase: 'main', towerName: name, ...fields })) deskGit('config', `branch.tower/${name}.${key}`, value)
  }
  cut('odin-1', 'main', {})
  writeFileSync(path.join(DESK, '.worktrees', 'odin-1', 'src', 'a.ts'), 'one\ntwo\n')
  execFileSync('git', ['-C', path.join(DESK, '.worktrees', 'odin-1'), '-c', 'user.name=test', '-c', 'user.email=test@localhost', 'commit', '-q', '-am', 'two'], { stdio: 'ignore' })
  cut('lark-3', 'main', {})
  cut('odin-1-review', 'tower/odin-1', { towerFrom: 'odin-1' })
  const ended = (id: string, cwd: string, startedAt: number, argv: string[]) => {
    const header = { id, project: 'desk', cwd, argv, startedAt, cols: 80, rows: 24 }
    writeFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), [header, [0.1, 'o', 'a worker\r\n'], [0.3, 'x', { exitCode: 0 }]].map((line) => JSON.stringify(line)).join('\n') + '\n')
  }
  ended(DESK_SESSIONS.author, path.join(DESK, '.worktrees', 'odin-1'), DESK_STARTED, ['bash'])
  ended(DESK_SESSIONS.reviewer, path.join(DESK, '.worktrees', 'odin-1-review'), DESK_STARTED + MIN, ['bash', '--', `/tower:review ${AUTHOR}`])
  ended(DESK_SESSIONS.lark, path.join(DESK, '.worktrees', 'lark-3'), DESK_STARTED + 2 * MIN, ['bash'])
  const past = { id: DESK_SESSIONS.past, project: 'desk', cwd: path.join(DESK, '.worktrees', 'odin-1'), argv: ['bash'], startedAt: DESK_STARTED - 3 * 24 * 60 * MIN, cols: 80, rows: 24 }
  writeStream('desk', 'runs', [[past.startedAt - 1_000, 'r', { policy: 'sweep.md', hash: sha('# Sweep, as it was'), id: past.id, start: 'hand', slot: null }]])
  writeFileSync(path.join(ROOT, 'sessions', `${past.id}.jsonl`), [past, [0.1, 'o', 'a worker\r\n'], [0.3, 'x', { exitCode: 0 }], [0.4, 'h', { hook_event_name: 'tower.letGo' }]].map((line) => JSON.stringify(line)).join('\n') + '\n')
  const threads = path.join(ROOT, 'collections', 'desk', 'reviews')
  mkdirSync(threads, { recursive: true })
  for (const [id, text] of Object.entries(DESK_THREADS)) writeFileSync(path.join(threads, id), text)
}

/**
 * A hub that is a repo with a branch cut from `main`, a page beside a hidden file, a renderer declared by the config with
 * a hidden file below its root, a policy, and a session that showed the page and ended.
 */
function seed(port: number) {
  for (const dir of [path.join(HUB, 'report'), RENDERER, path.join(ROOT, 'sessions'), path.join(ROOT, 'collections', 'lab', 'policies'), path.join(ROOT, 'collections', 'lab', 'roles')]) mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(ROOT, 'collections', 'lab', 'roles', 'builder.md'), BUILDER)
  writeFileSync(SHOWN, '<!doctype html><title>report</title>')
  writeFileSync(path.join(HUB, 'report', '.secret'), 'hidden')
  writeFileSync(path.join(RENDERER, 'index.html'), '<!doctype html><title>renderer</title>')
  writeFileSync(path.join(RENDERER, '.secret'), 'hidden')
  writeFileSync(path.join(ROOT, 'collections', 'lab', 'policies', 'nightly.md'), POLICY)
  mkdirSync(path.join(ROOT, 'streams', 'system', 'probe.quota'), { recursive: true })
  cpSync(path.join(REPO, 'test', 'fixtures', 'probe-quota.jsonl'), path.join(ROOT, 'streams', 'system', 'probe.quota', '2026-10.jsonl'))
  seedPolicies()
  seedDesk()
  cpSync(FIXTURES, EXTENSIONS, { recursive: true })
  writeFileSync(path.join(EXTENSIONS, 'package.json'), JSON.stringify({ type: 'module' }))
  execFileSync('git', ['init', '-q', '-b', 'main', HUB])
  git('add', '.')
  git('commit', '-q', '-m', 'first')
  git('branch', 'feature')
  git('config', 'branch.feature.towerBase', 'main')
  writeFileSync(path.join(HUB, '.git', 'info', 'exclude'), '.worktrees/\n')
  execFileSync('git', ['init', '-q', '-b', 'main', BARE])
  writeFileSync(path.join(BARE, 'README.md'), 'bare\n')
  writeFileSync(path.join(BARE, '.git', 'info', 'exclude'), '.worktrees/\n')
  gitIn(BARE, 'add', '.')
  gitIn(BARE, 'commit', '-q', '-m', 'first')
  const header = { id: SESSION, project: 'lab', cwd: HUB, argv: ['bash'], startedAt: Date.now() - 60_000, cols: 80, rows: 24 }
  const events = [
    [0.1, 'o', 'a session\r\n'],
    [0.2, 'h', { hook_event_name: 'tower.show', kind: 'file', target: SHOWN }],
    [0.25, 'h', { hook_event_name: 'tower.x.pulse.beat', value: 1 }],
    [0.3, 'x', { exitCode: 0 }],
  ]
  writeFileSync(path.join(ROOT, 'sessions', `${SESSION}.jsonl`), [header, ...events].map((line) => JSON.stringify(line)).join('\n') + '\n')
  const authored = [
    { ...header, id: LAB_AUTHOR, startedAt: Date.now() - 30_000 },
    [0.1, 'h', { hook_event_name: 'SessionStart', source: 'startup', session_id: 'c-author' }],
    [0.2, 'h', { hook_event_name: 'UserPromptSubmit', session_id: 'c-author', prompt: 'Build the report.' }],
    [0.3, 'h', { hook_event_name: 'turn.complete', answer: 'Built.' }],
    [0.4, 'x', { exitCode: 0 }],
  ]
  writeFileSync(path.join(ROOT, 'sessions', `${LAB_AUTHOR}.jsonl`), authored.map((line) => JSON.stringify(line)).join('\n') + '\n')
  writeConfig(port)
}

function writeConfig(port: number) {
  const config = {
    argv: ['bash', '-c', 'printf "a worker\\r\\n"', 'worker'],
    port,
    probes: { quota: { every: '1h' } },
    retention: { days: 1 },
    renderers: { plain: { root: RENDERER } },
    extensions: { pulse: { path: PULSE, settings: { every: 3_600_000 } }, chime: { path: CHIME }, tally: { path: TALLY }, roles: { path: ROLES } },
    projects: {
      lab: { name: 'lab', hub: HUB, repos: [], shelf: [{ label: 'Report', html: 'report/index.html' }], hiring: { live: 0 } },
      desk: { name: 'desk', hub: DESK, repos: [] },
      bare: { name: 'bare', hub: BARE, repos: [], capabilities: { reviews: { off: true }, pulse: { off: true }, chime: { off: true }, tally: { off: true }, roles: { off: true } } },
    },
    collections: {
      drafts: { label: 'Drafts', description: 'Prompts kept for later.' },
      reviews: { label: 'Reviews', description: 'One review thread per checkout.' },
      policies: { label: 'Policies', description: 'Standing work the tower starts on a schedule.' },
    },
  }
  writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(config))
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer().once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })

const ENV = { PATH: process.env.PATH, HOME: ROOT, TOWER_CONFIG: path.join(ROOT, 'config.json'), TZ: process.env.TZ }

/** The host, once its control socket answers: it owns the spawns' PTYs and writes their logs. */
const bootHost = (): Promise<ChildProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join('src', 'host', 'main.ts')], { cwd: REPO, env: ENV, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr!.on('data', (chunk) => (err += chunk))
    child.once('exit', () => reject(new Error(`the host exited before it was up:\n${err}`)))
    const deadline = Date.now() + BOOT_MS
    const knock = () =>
      net
        .connect(path.join(ROOT, 'control.sock'))
        .once('connect', function (this: net.Socket) {
          this.destroy()
          resolve(child)
        })
        .once('error', () => (Date.now() > deadline ? (child.kill(), reject(new Error(`the host said nothing within ${BOOT_MS} ms:\n${err}`))) : setTimeout(knock, 50)))
    knock()
  })

/**
 * The tower on `port`, once it says it is up; `undefined` when another process took the port first. One that says
 * nothing within `BOOT_MS` is killed and fails the boot: node:test would wait on the hook forever.
 */
const boot = (port: number): Promise<ChildProcess | undefined> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join('src', 'tower', 'server.ts')], {
      cwd: REPO,
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    const silent = setTimeout(() => child.kill(), BOOT_MS)
    child.stderr!.on('data', (chunk) => (err += chunk))
    child.stdout!.on('data', (chunk) => String(chunk).includes('tower up:') && (clearTimeout(silent), resolve(child)))
    child.once('exit', (code) => {
      clearTimeout(silent)
      if (err.includes('EADDRINUSE')) resolve(undefined)
      else reject(new Error(code === null ? `the tower said nothing within ${BOOT_MS} ms:\n${err}` : `the tower exited before it was up:\n${err}`))
    })
  })

before(async () => {
  for (let tries = 0; !tower; tries++) {
    if (tries === 3) throw new Error('no free port after 3 tries')
    const port = await freePort()
    if (tries === 0) seed(port)
    else writeConfig(port)
    const booted = await boot(port)
    if (booted) {
      tower = booted
      base = `http://127.0.0.1:${port}`
    }
  }
  host = await bootHost()
})

after(async () => {
  for (const child of [tower, host]) {
    if (!child || child.exitCode !== null) continue
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill()
    await exited
  }
  rmSync(ROOT, { recursive: true, force: true })
})

type Reply = { status: number; type: string; body: string; headers: http.IncomingHttpHeaders }

/**
 * Each request on a connection of its own: a test's CLI calls block this process past the tower's keep-alive, and a
 * pooled connection the tower closed meanwhile resets the next request.
 */
const request = (pathname: string, options: http.RequestOptions = {}, body?: Buffer | string): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = http.request(`${base}${pathname}`, { agent: false, ...options }, (res) => {
      let text = ''
      res.setEncoding('utf8').on('data', (chunk) => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, type: String(res.headers['content-type']), body: text, headers: res.headers }))
    })
    req.on('error', reject)
    req.end(body)
  })

const get = (pathname: string) => request(pathname)

const post = (verb: string, input: unknown, headers: http.OutgoingHttpHeaders = {}) =>
  request(`/${verb}`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...headers } }, JSON.stringify(input))

/** A verb's reply, checked against the verb's reply schema. */
async function command<V extends Verb>(verb: V, input: unknown): Promise<Replies[V]> {
  const reply = await post(verb, input)
  assert.equal(reply.status, 200, reply.body)
  return ROUTES[verb].reply.parse(JSON.parse(reply.body)) as Replies[V]
}

/** The first event of an SSE stream, its connection then closed. */
const firstEvent = (pathname: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const req = http.get(`${base}${pathname}`, { agent: false }, (res) => {
      if (res.headers['content-type'] !== 'text/event-stream') return reject(new Error(`${pathname}: ${res.statusCode} ${res.headers['content-type']}`))
      let text = ''
      res.setEncoding('utf8').on('data', (chunk) => {
        text += chunk
        const line = /^data: (.*)\n/m.exec(text)
        if (!line) return
        resolve(JSON.parse(line[1]))
        req.destroy()
      })
    })
    req.on('error', reject)
  })

const errorCode = (reply: Reply): string => ApiError.parse(JSON.parse(reply.body)).code

test('server: one board event is a BoardMsg by the committed schema', async () => {
  const msg = await firstEvent('/board')
  const parsed = z.fromJSONSchema(boardSchema as z.core.JSONSchema.JSONSchema).safeParse(msg)
  if (!parsed.success) assert.fail(z.prettifyError(parsed.error))
  assert.ok('board' in (msg as object), JSON.stringify(msg).slice(0, 400))
})

test('server: every read answers', async () => {
  const json = (body: string) => JSON.parse(body) as unknown
  const isArray = (body: string) => Array.isArray(json(body))
  const has = (...keys: string[]) => (body: string) => keys.every((key) => Object.hasOwn(json(body) as object, key))
  const reads: [path: string, type: string, shape?: (body: string) => boolean][] = [
    ['/schema', 'application/json', (body) => has('v', 'verbs', 'reads', 'streams', 'error', 'extension')(body) && (json(body) as { reads: Record<string, { path: string }> }).reads['changes/<id>']?.path === '/changes/{id}'],
    ['/extensions', 'application/json', has('extensions', 'topology')],
    ['/renderers', 'application/json', has('default', 'renderers')],
    ['/origins', 'application/json', has()],
    [`/conversations/${SESSION}`, 'application/json', isArray],
    ['/archive/lab', 'application/json', isArray],
    ['/reviews/lab', 'application/json', has('threads', 'authors')],
    ['/landing?project=lab&branch=feature', 'application/json', has('branch', 'repos')],
    [`/changes/${SESSION}`, 'application/json', isArray],
    [`/changes/${SESSION}?scope=uncommitted`, 'application/json', isArray],
    ['/runs/lab?policy=nightly.md', 'application/json', isArray],
    ['/probe/quota', 'application/json', has('status', 'reads')],
    ['/stats', 'application/json', has('from', 'to', 'bucket', 'all')],
    ['/shelf/lab/0', 'application/json', (body) => (json(body) as string[]).includes('report/index.html')],
    ['/shelf/lab/0/report/index.html', 'text/html'],
    ['/run/lab/0/report/index.html', 'text/html'],
    ['/r/plain/', 'text/html'],
    [`/shown/${SESSION}${SHOWN}`, 'text/html'],
    ['/tower.js', 'text/javascript'],
    ['/design.css', 'text/css'],
    [`/fonts/${fonts[0].file}`, 'font/woff2'],
    ['/xterm.js', 'text/javascript'],
    ...Object.keys(MODULES).map((module): [string, string] => [module, 'text/javascript']),
  ]
  for (const [pathname, type, shape] of reads) {
    const reply = await get(pathname)
    assert.equal(reply.status, 200, `${pathname}: ${reply.body.slice(0, 300)}`)
    assert.ok(reply.type.startsWith(type), `${pathname}: ${reply.type}`)
    if (shape) assert.ok(shape(reply.body), `${pathname}: ${reply.body.slice(0, 300)}`)
  }
  assert.equal((await get('/archive/lab?x=1')).status, 200)
  assert.equal((await get('/')).status, 302)
  assert.ok(await firstEvent(`/screen/${SESSION}`))
  assert.equal(((await firstEvent('/shell/none')) as { t: string }).t, 'error')
  assert.deepEqual(Object.keys((await firstEvent('/mux')) as object), ['t', 'id'])
})

/** The `tower` command as a worker runs it: its output, or its failure's. */
const cli = (session: string, ...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', path.join('src', 'cli.ts'), ...args], { cwd: REPO, env: { ...ENV, TOWER_SESSION_ID: session }, encoding: 'utf8' })

test('server: policies kept before the policies extension keep their approvals, offers, runs and words, and the runner decides nothing new', async () => {
  const board = await settled(
    async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    },
    (b) => b.hostUp,
  )
  const now = Date.now()
  const floor = board.floors.find((f) => f.id === 'lab')!
  const worker = floor.cards.find((c) => c.id === SESSION)!
  const DAY = 24 * 60 * MIN
  const runByHand = (id: string) => ['run', ['policy/run', { project: 'lab', policy: id, start: 'hand' }]] as const
  const approve = (id: string, text: string) => ['approve', ['policy/approve', { project: 'lab', policy: id, hash: sha(text) }]] as const
  const offering = (...pairs: (readonly [string, unknown])[]) => ({ calls: Object.fromEntries(pairs), actions: pairs.map(([verb, call]) => ({ verb, call })) })
  const rule = (at: number) => `daily at ${new Date(at).toISOString().slice(11, 16)} (UTC)`
  const { sweep, triage, digest, broken } = KEPT
  const triageOffer = { slot: triage.slot, since: OFFERED_AT, until: triage.slot + DAY }
  assert.deepEqual(
    floor.policies.filter((p) => p.id !== 'nightly.md'),
    [
      {
        id: broken.id,
        tag: 'fleet-jaguar',
        title: 'Broken',
        hash: sha(broken.text),
        problems: [{ path: 'guards', message: "unknown key (this tower doesn't know it: update the tower, or put a runner's own data under x)" }],
        needs: { kind: 'invalid' },
        live: [],
        ...offering(),
      },
      {
        id: digest.id,
        tag: 'warm-lily',
        title: 'Digest',
        hash: sha(digest.text),
        header: { when: { cron: [dailyAt(digest.slot)], tz: 'UTC' }, check: 'true', start: 'auto', live: 1, hire: {} },
        rule: rule(digest.slot),
        next: digest.slot + DAY,
        approved: { at: SEEDED - 2 * 60 * MIN + 1_000, by: SESSION },
        live: [],
        last: { n: 1, at: RAN_AT, slot: digest.slot, id: SESSION, callsign: worker.callsign },
        seen: digest.slot,
        ...offering(runByHand(digest.id)),
      },
      {
        id: sweep.id,
        tag: 'slow-basil',
        title: 'Sweep',
        hash: sha(sweep.text),
        header: { when: { cron: [dailyAt(sweep.slot)], tz: 'UTC' }, start: 'auto', live: 1, hire: {} },
        rule: rule(sweep.slot),
        next: sweep.slot,
        approved: { at: SEEDED - 2 * 60 * MIN },
        live: [],
        ...offering(runByHand(sweep.id)),
      },
      {
        id: triage.id,
        tag: 'muddy-thistle',
        title: 'Triage',
        hash: sha(triage.text),
        header: { when: { cron: [dailyAt(triage.slot)], tz: 'UTC' }, start: 'ask', live: 2, hire: {} },
        rule: rule(triage.slot),
        next: triage.slot + DAY,
        live: [],
        passed: { at: OFFERED_AT, slot: triage.slot, outcome: 'offered' },
        seen: triage.slot,
        offer: triageOffer,
        ...offering(runByHand(triage.id), approve(triage.id, triage.text)),
      },
    ],
  )
  const accept = ['policy/run', { project: 'lab', policy: triage.id, slot: triage.slot, start: 'offer' }]
  assert.deepEqual(board.offers, [
    { key: `${triage.id}@${triage.slot}`, project: 'lab', policy: triage.id, tag: 'muddy-thistle', title: 'Triage', ...triageOffer, calls: { accept }, actions: [{ verb: 'accept', call: accept }] },
  ])
  assert.deepEqual(worker.run, { policy: digest.id, tag: 'warm-lily', title: 'Digest', n: 1, check: CHECKED, start: 'auto', slot: digest.slot })
  const part = floor.x?.policies as { policies: { id: string; calls: object }[]; offers: { key: string; calls: object }[] }
  const renamed = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll('"policy/run"', '"policies/run"').replaceAll('"policy/approve"', '"policies/approve"'))
  assert.deepEqual(part, { policies: renamed(floor.policies), offers: renamed(board.offers) }, 'the extension holds the same views, its calls naming its own verbs')
  assert.deepEqual(worker.x?.policies, { run: worker.run })
  assert.deepEqual(
    (board.adds['floor:lab']?.slots ?? []).filter((s) => s.cap === 'policies').map((s) => s.key),
    ['digest.md', 'nightly.md', 'sweep.md', 'triage.md'],
    'every valid policy the tower runs has its slots fired by the core',
  )
  assert.deepEqual(
    board.asks.filter((a) => a.cap === 'policies'),
    [{ key: `policies:${triage.id}@${triage.slot}`, subject: `item.policies:lab/${triage.id}`, title: 'Triage', since: OFFERED_AT, until: triage.slot + DAY, sound: 'offer', cap: 'policies', actions: [{ verb: 'policies/run', call: accept[1], cap: 'policies' }] }],
    'the open offer is an ask that rings as an offer, until the next slot',
  )
  const standings = Object.fromEntries(floor.policies.map((p) => [p.id, standing(p, now)]))
  assert.deepEqual(standings, {
    [broken.id]: { t: 'invalid' },
    [digest.id]: { t: 'waits', next: digest.slot + DAY, step: 'check' },
    'nightly.md': standings['nightly.md'],
    [sweep.id]: { t: 'waits', next: sweep.slot, step: 'run' },
    [triage.id]: { t: 'offered', slot: triage.slot, until: triage.slot + DAY },
  })
  assert.deepEqual(decide(floor, new Map(), now), [], 'the slot that ran is not run again, and the offered one is not offered again')

  const runs = JSON.parse((await get(`/runs/lab?policy=${digest.id}`)).body)
  assert.deepEqual(runs, [
    {
      n: 1,
      slot: digest.slot,
      at: RAN_AT,
      hash: sha(digest.text),
      current: true,
      start: 'auto',
      check: CHECKED,
      worker: { id: SESSION, callsign: worker.callsign, status: worker.status, live: false, endedAt: worker.enteredAt, shown: [SHOWN] },
    },
  ])

  const day = (at: number) => slotWords(at, 'UTC', now)
  const listed = cli(SESSION, 'policies').split('\n')
  const nightly = listed.findIndex((l) => l.startsWith('ashen-otter'))
  assert.deepEqual([...listed.slice(0, nightly), ...listed.slice(nightly + 3)], [
    "fleet-jaguar   Broken   invalid · guards: unknown key (this tower doesn't know it: update the tower, or put a runner's own data under x) (it used to run on its own)",
    `warm-lily      Digest   ${rule(digest.slot)}`,
    `               auto · approved ${sha(digest.text).slice(7, 15)} by ${worker.callsign} · live 0/1 · last: run 1, ${day(digest.slot)}, ${worker.callsign} exited`,
    `               now: ${day(digest.slot + DAY)} will check for work, then start on its own`,
    `slow-basil     Sweep    ${rule(sweep.slot)}`,
    `               auto · approved ${sha(sweep.text).slice(7, 15)} by the user · live 0/1`,
    `               now: ${day(sweep.slot)} will start on its own`,
    `muddy-thistle  Triage   ${rule(triage.slot)}`,
    '               ask · live 0/2',
    `               now: ${day(triage.slot)} is offered, until ${day(triage.slot + DAY)}`,
    '',
  ])
  const ran = cli(SESSION, 'runs').split('\n')
  assert.deepEqual(ran.slice(0, 2), [`Digest (warm-lily) · ${rule(digest.slot)} · runs 1 to 1 of 1`, [`run 1`.padEnd(7), day(digest.slot).padEnd(13), 'auto'.padEnd(16), worker.callsign, 'exited'].join('  ')])
  assert.ok(ran.includes('        its check found: two to do'), ran.join('\n'))
  const whoami = cli(SESSION, 'whoami').split('\n')
  const at = whoami.findIndex((l) => l.startsWith('You are run'))
  assert.deepEqual(whoami.slice(at, at + 3), [
    `You are run 1 of policy "Digest" (warm-lily), for its slot ${day(digest.slot)}, started on its own.`,
    '`tower runs` lists its earlier runs and what each left; `tower read warm-lily` is the policy. When the policy says nobody watches, end with `tower home <your callsign>`.',
    'Its check found: two to do',
  ])
})

test('server: an extension the config adds is started as x:<cap>, after the core and what it requires, and shown on the board and at GET /extensions', async () => {
  const msg = (await firstEvent('/board')) as BoardMsg
  assert.ok('board' in msg)
  const pulse = msg.board.extensions.find((e) => e.id === 'pulse')
  assert.deepEqual(pulse, {
    id: 'pulse',
    provides: 'pulse',
    version: '1.0',
    title: 'Pulse',
    bundled: false,
    state: 'started',
    off: ['bare'],
    problems: [],
    verbs: [
      { name: 'pulse/ping', scope: 'project', words: { label: 'Ping', hint: 'rings chime for the floor' } },
      { name: 'pulse/pong', scope: 'system', deprecated: { since: '1.0', use: 'pulse/ping', why: 'a ping names its floor' } },
      { name: 'pulse/beat', scope: 'project', words: { label: 'Beat', hint: 'keeps a beat on the floor, and as a fact of the session when one is named' } },
    ],
    commands: [{ name: 'listen', module: 'pulse.js', export: 'listen', words: { label: 'Listen', hint: 'reads the beat aloud' }, on: ['item.pulse'] }],
    slots: [{ name: 'hour', scope: 'system', when: { every: '1h' } }],
    subjects: [],
  })
  const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
  const exempted = (id: string) => (id === 'reviews' ? [{ session: DESK_SESSIONS.reviewer, callsign: REVIEWER, from: 'hiring' }] : [])
  assert.deepEqual(read.extensions, msg.board.extensions.map((e) => ({ ...e, exempted: exempted(e.id) })), "the desk's reviewer, spawned on its prompt alone, is exempted by reviews")
  assert.deepEqual(read.topology.graph['x:pulse'], ['core:config', 'core:system', 'core:publisher', 'core:dispatch', 'core:http', 'core:extensions', 'x:chime'])
  assert.equal(read.topology.startupOrder.at(-1), 'x:tally')
  assert.match(read.topology.mermaid, /\["x:pulse"\]/)
})

test("server: an extension's owned collection joins its floor, and refuses the generic writes, naming its create door", async () => {
  const msg = (await firstEvent('/board')) as BoardMsg
  assert.ok('board' in msg)
  const pulse = msg.board.floors.find((f) => f.id === 'lab')!.collections.find((c) => c.id === 'pulse')!
  assert.deepEqual([pulse.label, pulse.owner, pulse.doors?.create], ['Beats', 'pulse', 'pulse/beat'])
  const refused = await post('collection/create', { project: 'lab', collection: 'pulse', name: 'by hand', ext: 'md', content: '1' })
  assert.deepEqual(JSON.parse(refused.body), { t: 'error', code: 'refused', message: 'pulse owns pulse: use pulse/beat' })
  assert.equal(errorCode(await get('/collection/lab/pulse/none.md')), 'not_found')
})

/** What `read` answers once `holds` is true of it, read again every 50 ms: the tower folds a write once it settles. */
async function settled<T>(read: () => Promise<T>, holds: (value: T) => boolean): Promise<T> {
  for (let tries = 0; ; tries++) {
    const value = await read()
    if (holds(value) || tries === 40) return value
    await new Promise((done) => setTimeout(done, 50))
  }
}

test("server: an extension writes its owned collection and its stream through its verb, and its read answers with what the tower folds of them and a session's facts", async () => {
  const beat = await post('pulse/beat', { project: 'lab' })
  assert.equal(beat.status, 200, beat.body)
  const { item } = JSON.parse(beat.body)
  assert.equal((await get(`/collection/lab/pulse/${item}`)).body, 'beat 1\n')
  type Kept = { beats: { count: number; items: string[] }; items: unknown[]; facts: { name: string; value: unknown; session: string }[] }
  const kept = await settled(async (): Promise<Kept> => JSON.parse((await get(`/pulse/kept/lab?session=${SESSION}`)).body), (k) => k.beats.count === 1 && k.items.length === 1)
  assert.deepEqual([kept.beats, kept.items], [{ count: 1, items: [item] }, [{ beat: 'beat 1' }]])
  assert.deepEqual(kept.facts.map(({ name, value, session }) => ({ name, value, session })), [{ name: 'beat', value: 1, session: SESSION }])
})

test("server: an extension's folds put its part on the board's subjects, its badges, lines and actions in adds and its ask in asks; its client files are served", async () => {
  const board = await settled(
    async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    },
    (b) => (b.floors.find((f) => f.id === 'lab')!.x?.pulse as { beats: number } | undefined)?.beats === 1,
  )
  const lab = board.floors.find((f) => f.id === 'lab')!
  const card = lab.cards.find((c) => c.id === SESSION)!
  /** What pulse added to a subject, each list without the other extensions' entries. */
  const byPulse = (adds: Adds | undefined) =>
    Object.fromEntries(Object.entries(adds ?? {}).flatMap(([kind, list]) => {
      const own = (list as { cap: string }[]).filter((a) => a.cap === 'pulse')
      return own.length ? [[kind, own]] : []
    }))
  assert.deepEqual([lab.x?.pulse, card.x?.pulse], [{ beats: 1 }, { beats: 1 }])
  assert.deepEqual(byPulse(board.adds[`card:${SESSION}`]), {
    badges: [{ label: '1 beat', tone: 'ready', cap: 'pulse' }],
    lines: [{ text: 'You took 1 beat: `tower x pulse beat` keeps another.', cap: 'pulse' }],
  })
  assert.deepEqual(byPulse(board.adds['floor:lab']), {
    actions: [{ verb: 'pulse/ping', call: { project: 'lab' }, cap: 'pulse' }],
    tidy: [{ key: 'echo', label: 'Echo the beats', hint: 'answered done, and nothing kept changes', cap: 'pulse' }],
    slots: [{ key: 'lab', when: { every: '1h' }, cap: 'pulse' }],
  })
  assert.deepEqual(lab.calls.tidy, ['tidy', { project: 'lab', plan: { ...lab.tidy, x: { pulse: ['echo'] } } }], "the floor's Tidy carries the extensions' entries")
  assert.deepEqual(
    board.asks.filter((a) => a.cap === 'pulse' && a.subject === 'floor:lab').map(({ key, subject, title, sound, cap, actions }) => ({ key, subject, title, sound, cap, actions })),
    [{ key: 'pulse:beat-lab', subject: 'floor:lab', title: 'Keep a beat on lab', sound: 'offer', cap: 'pulse', actions: [{ verb: 'pulse/beat', call: { project: 'lab' }, cap: 'pulse' }] }],
  )
  const client = await get('/x/pulse/pulse.js')
  assert.deepEqual([client.status, client.type, client.headers['access-control-allow-origin']], [200, 'text/javascript', '*'])
  assert.match(client.body, /export async function listen/)
  assert.equal(errorCode(await get('/x/pulse/missing.js')), 'not_found')
  assert.equal(errorCode(await get('/x/chime/pulse.js')), 'not_found')
})

test("server: an extension's verb is called for the caller the CLI's headers claim, its own calls one step deeper", async () => {
  const asWorker = await post('pulse/ping', { project: 'lab', times: 2 }, { 'tower-session': SESSION, 'tower-client': 'cli' })
  assert.equal(asWorker.status, 200, asWorker.body)
  assert.deepEqual(JSON.parse(asWorker.body), { project: 'lab', chimed: { rang: 4, caller: { t: 'worker', id: SESSION, via: 'cli', within: ['pulse/ping'] }, trail: ['pulse', 'chime'] } })
  const asUser = JSON.parse((await post('pulse/ping', { project: 'lab' })).body)
  assert.deepEqual(asUser.chimed, { rang: 2, caller: { t: 'user', via: 'http', within: ['pulse/ping'] }, trail: ['pulse', 'chime'] })
  assert.equal(errorCode(await post('pulse/ping', { times: 1 })), 'invalid')
  assert.equal(errorCode(await post('pulse/ping', { project: 'nowhere' })), 'not_found')
  assert.equal(errorCode(await post('pulse/nothing', {})), 'not_found')
})

test("server: an extension's read answers by its path, and its deprecated verb says so in RFC 9745's headers", async () => {
  const beats = await get('/pulse/beats/lab')
  assert.equal(beats.status, 200, beats.body)
  assert.deepEqual(JSON.parse(beats.body), { project: 'lab', every: 3_600_000, word: 'beat' })
  const pong = await post('pulse/pong', {})
  assert.deepEqual([pong.status, JSON.parse(pong.body), pong.headers.deprecation, pong.headers.link], [200, { pong: true }, '@0', '</pulse/ping>; rel="successor-version"'])
  const schema = JSON.parse((await get('/schema')).body)
  assert.equal(schema.verbs['pulse/ping'].scope, 'project')
  assert.equal(schema.reads['pulse/beats/<project>'].path, '/pulse/beats/{project}')
})

test("server: the quota probe, moved into its extension, answers its old names through LEGACY, its old folder folded as before", async () => {
  const { board } = (await firstEvent('/board')) as Extract<BoardMsg, { board: unknown }>
  const status = board.x?.quota as { every: number; lastAt: number }
  assert.equal(status.every, 3_600_000, 'probes.quota.every, the old spelling, is read as extensions.quota.settings.every')
  assert.deepEqual([board.probes.length, board.probes[0].name, board.probes[0].every, board.probes[0].calls], [1, 'quota', 3_600_000, { run: ['probe/run', { name: 'quota' }] }])
  assert.equal(board.rateLimits.find((l) => l.kind === 'seven_day')?.percentUsed, 89, "the old folder's readings are the account's limits")
  const view = await get('/probe/quota?last=3')
  assert.deepEqual([view.status, view.headers.deprecation, view.headers.link], [200, '@0', '</quota/reads>; rel="successor-version"'])
  const { status: was, reads } = JSON.parse(view.body)
  assert.deepEqual([was.name, reads.length, reads[0].reads], ['quota', 3, 'claude.usage'])
  assert.equal(errorCode(await get('/probe/mine')), 'not_found')
  const run = await post('probe/run', { name: 'quota' })
  assert.deepEqual([run.status, run.headers.deprecation, run.headers.link], [200, '@0', '</quota/read-now>; rel="successor-version"'])
  const probed = ROUTES['probe/run'].reply.parse(JSON.parse(run.body))
  assert.deepEqual([probed.t, probed.ok], ['probed', false], 'a config whose argv is no Claude answers no get_usage')
  assert.equal(errorCode(await post('probe/run', { name: 'quota' })), 'refused', 'a read starts at most once a minute')
  assert.equal(errorCode(await post('probe/run', { name: 'mine' })), 'not_found')
  const [newest] = JSON.parse((await get('/quota/reads?last=1')).body).reads
  assert.deepEqual([newest.ok, newest.error], [false, probed.error], 'the read is appended to the old folder, newest first')
})

test('server: an extension reaches only the core and what it declares', async () => {
  const undeclared = await post('chime/ask', { verb: 'pulse/pong' })
  assert.equal(errorCode(undeclared), 'refused')
  assert.match(JSON.parse(undeclared.body).message, /declare requires\.pulse/)
  assert.equal(errorCode(await post('chime/ask', { verb: 'tower/nothing' })), 'not_found')
})

test("server: a verb runs through the chain around it, the dependent's link outside its owner's, each link's input parsed again by the verb's schema", async () => {
  const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
  assert.deepEqual([read.chains['chime/ring'], read.chains['tower/collection/create']], [['pulse', 'chime'], ['pulse']])
  assert.deepEqual(read.composites['tower/kill'], ['tower/tidy'])
  const rung = await post('chime/ring', { times: 1 })
  assert.deepEqual(JSON.parse(rung.body), { rang: 2, caller: { t: 'user', via: 'http', within: [] }, trail: ['pulse', 'chime'] })
  const passedOn = await post('chime/ring', { times: 3 })
  assert.equal(errorCode(passedOn), 'invalid')
  assert.match(JSON.parse(passedOn.body).message, /^pulse's link around chime\/ring passed on an input chime\/ring doesn't take/)
})

test("server: a link may answer for the verb, and one that throws fails the call closed, a problem on its extension", async () => {
  const kept = await post('collection/create', { project: 'lab', collection: 'drafts', name: 'shh', ext: 'md', content: 'a secret' })
  assert.deepEqual(JSON.parse(kept.body), { t: 'error', code: 'refused', message: 'pulse keeps secrets out of collections' })
  const broken = await post('collection/create', { project: 'lab', collection: 'drafts', name: 'boom', ext: 'md', content: '' })
  assert.deepEqual(JSON.parse(broken.body), { t: 'error', code: 'internal', message: "pulse's link around tower/collection/create threw: a guard that breaks" })
  const msg = (await firstEvent('/board')) as BoardMsg
  assert.ok('board' in msg)
  const drafts = msg.board.floors.find((f) => f.id === 'lab')!.collections.find((c) => c.id === 'drafts')!
  assert.ok(!drafts.items.some((i) => i.id.includes('boom') || i.id.includes('shh')))
  const problem = msg.board.extensions.find((e) => e.id === 'pulse')!.problems.find((p) => p.lane === 'around')
  assert.deepEqual([problem?.code, problem?.path], ['threw', 'around.tower/collection/create'])
})

test("server: a hook's answers come back to its provider in fold order, each on its own, one off its schema failed and a problem on its answerer", async () => {
  const beat = await post('pulse/beat', { project: 'lab' })
  assert.equal(beat.status, 200, beat.body)
  const { item, heard } = JSON.parse(beat.body)
  assert.deepEqual(heard[0], { cap: 'pulse', ok: true, answer: { heard: `pulse kept ${item}` } })
  assert.deepEqual([heard.length, heard[1].cap, heard[1].ok, heard[1].code], [2, 'tally', false, 'internal'])
  const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
  assert.deepEqual([read.answers['pulse/beat.kept'], read.answers['tower/discard.record']], [['pulse', 'tally'], ['reviews', 'tally']])
  const tally = read.extensions.find((e) => e.id === 'tally')!
  assert.deepEqual(tally.problems.map((p) => [p.lane, p.code, p.path]), [['hook', 'hook', 'answers.pulse/beat.kept']])
})

test("server: worktree/discard raises tower/discard.record before anything goes: a refusal keeps the worktree and its thread unfiled, an answer comes back in the reply's x", async () => {
  const discardIn = async (name: string) => {
    const tree = path.join(HUB, '.worktrees', name)
    git('worktree', 'add', '-q', '-b', `tower/${name}`, tree, 'main')
    git('config', `branch.tower/${name}.towerBase`, 'main')
    writeFileSync(path.join(tree, 'draft.md'), 'never landed')
    const head = execFileSync('git', ['-C', tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    return { tree, reply: await post('worktree/discard', { project: 'lab', name, author: 'NEMO-92', held: [{ dir: HUB, head, dirty: 1 }] }) }
  }
  const kept = await discardIn('keep-this')
  assert.deepEqual(JSON.parse(kept.reply.body), { t: 'error', code: 'refused', message: 'tally couldn\'t record the discard of "keep-this", so nothing was removed: keep-this is one tally keeps' })
  assert.ok(existsSync(kept.tree))
  const threads = readdirSync(path.join(ROOT, 'collections', 'lab', 'reviews'))
  assert.ok(threads.includes('keep-this.md') && !threads.some((id) => id.startsWith('keep-this@')), "reviews' note stays on the live thread, unfiled")
  const gone = await discardIn('gone')
  assert.equal(gone.reply.status, 200, gone.reply.body)
  assert.deepEqual(JSON.parse(gone.reply.body).x.tally, { note: 'tally counted 1 tip' })
  assert.ok(!existsSync(gone.tree))
})

type Board = Extract<BoardMsg, { board: unknown }>['board']

/** The first board on which `holds` holds. */
const boardWhere = (holds: (b: Board) => boolean) => settled(async () => ((await firstEvent('/board')) as Extract<BoardMsg, { board: unknown }>).board, holds)
const floorOf = (b: Board, id: string) => b.floors.find((f) => f.id === id)!
/** A floor's threads as the reviews extension folds them. */
const reviewThreads = (b: Board, id: string) => (floorOf(b, id).x!.reviews as FloorPart).threads
const NO_TIDY = { worktrees: [], branches: [], threads: [], prune: [], logs: [], streams: [] }
const threadText = (checkout: string) => `# ${checkout}\n\n## NEMO-92 · 2026-10-06 14:32 · n1\nShip it.\n`
const threadsIn = (project: string) => path.join(ROOT, 'collections', project, 'reviews')

/** A worktree `name` of `hub` cut from main, one file in it uncommitted, as the board would show it to a discard. */
const cutWithWork = (hub: string, name: string) => {
  const tree = path.join(hub, '.worktrees', name)
  gitIn(hub, 'worktree', 'add', '-q', '-b', `tower/${name}`, tree, 'main')
  gitIn(hub, 'config', `branch.tower/${name}.towerBase`, 'main')
  writeFileSync(path.join(tree, 'draft.md'), 'never landed')
  return { tree, held: [{ dir: hub, head: gitIn(tree, 'rev-parse', 'HEAD').trim(), dirty: 1 }] }
}

test("reviews: Tidy lists the thread of a checkout whose work landed and files it as <checkout>@<stamp>.md, unchanged, its checkout's name freed", async () => {
  mkdirSync(threadsIn('lab'), { recursive: true })
  writeFileSync(path.join(threadsIn('lab'), 'landed.md'), threadText('landed'))
  await boardWhere((b) => floorOf(b, 'lab').tidy.threads.includes('landed'))
  const tidied = await command('tidy', { project: 'lab', plan: { ...NO_TIDY, threads: ['landed'] } })
  assert.deepEqual(tidied.threads, ['landed'])
  const filed = readdirSync(threadsIn('lab')).filter((id) => id.startsWith('landed@'))
  assert.equal(filed.length, 1)
  assert.match(filed[0], /^landed@\d{4}-\d\d-\d\d-\d{4}\.md$/)
  assert.equal(readFileSync(path.join(threadsIn('lab'), filed[0]), 'utf8'), threadText('landed'))
  assert.ok(!existsSync(path.join(threadsIn('lab'), 'landed.md')))
  await boardWhere((b) => !floorOf(b, 'lab').tidy.threads.includes('landed'))
})

test("reviews: a discard notes each repo's branch and tip on the checkout's thread, then files the thread", async () => {
  const { tree, held } = cutWithWork(HUB, 'lost')
  const discarded = await command('worktree/discard', { project: 'lab', name: 'lost', author: 'NEMO-92', held })
  assert.ok(!existsSync(tree))
  assert.match(discarded.thread!, /^lost@\d{4}-\d\d-\d\d-\d{4}\.md$/)
  assert.ok(!existsSync(path.join(threadsIn('lab'), 'lost.md')))
  const [{ tip }] = discarded.tips
  const unpushed = gitIn(HUB, 'log', '--format=%h %s', held[0].head, '--not', '--remotes').trim().split('\n')
  const thread = parseThread(readFileSync(path.join(threadsIn('lab'), discarded.thread!), 'utf8'))
  assert.deepEqual(
    thread.messages.map(({ author, n, body }) => ({ author, n, body: body.trim() })),
    [
      {
        author: 'NEMO-92',
        n: 1,
        body: [
          "Discarded the worktree lost: its work never landed. The branches the tower cut are deleted and their tips are on no branch, kept by git until it collects them (two weeks by default). To get one back, in its repo: `git branch <name> <tip>`.",
          '',
          `- \`${HUB}\`: branch \`tower/lost\`, tip \`${tip}\` (1 uncommitted file committed on top of \`${held[0].head}\`)`,
          ...unpushed.map((c) => `  - ${c}`),
        ].join('\n'),
      },
    ],
  )
})

test("reviews: a landed thread is the reviews extension's tidy entry, in Tidy's words, and its key under plan.x files it", async () => {
  writeFileSync(path.join(threadsIn('lab'), 'shipped.md'), threadText('shipped'))
  const board = await boardWhere((b) => (b.adds['floor:lab']?.tidy ?? []).some((e) => e.key === 'shipped'))
  assert.deepEqual(board.adds['floor:lab'].tidy!.find((e) => e.key === 'shipped'), {
    key: 'shipped',
    label: '◇ shipped',
    does: 'file landed thread',
    hint: 'its work has landed: filed as shipped@<time>.md',
    kind: { one: 'landed thread', many: 'landed threads' },
    cap: 'reviews',
  })
  const tidied = await command('tidy', { project: 'lab', plan: { ...NO_TIDY, x: { reviews: ['shipped'] } } })
  assert.deepEqual([tidied.x, tidied.threads], [{ reviews: { done: ['shipped'], skipped: [] } }, ['shipped']])
  assert.equal(readdirSync(threadsIn('lab')).filter((id) => id.startsWith('shipped@')).length, 1)
})

test('reviews: a resolution is a note marking earlier notes resolved, read as a plain note by the thread format, and resolved notes leave what is unseen', async () => {
  const note = (author: string, body: string) => command('review/append', { project: 'lab', checkout: 'resolving', author, body })
  await note('NEMO-92', 'Why one by one?')
  await note('NEMO-92', 'And this name?')
  await note('ODIN-07', 'Fixed both.')
  const resolved = (await post('reviews/resolve', { project: 'lab', checkout: 'resolving', author: 'NEMO-92', notes: [1, 2] }))
  assert.equal(resolved.status, 200, resolved.body)
  assert.equal(JSON.parse(resolved.body).n, 4)
  const thread = parseThread(readFileSync(path.join(threadsIn('lab'), 'resolving.md'), 'utf8'))
  assert.deepEqual(thread.messages.at(-1), { author: 'NEMO-92', at: thread.messages.at(-1)!.at, n: 4, re: undefined, anchors: [], body: '**Resolved:** n1, n2' })
  assert.deepEqual(unseenBy(thread, 'ODIN-07'), [])
  const board = await boardWhere((b) => reviewThreads(b, 'lab').some((t) => t.checkout === 'resolving' && t.resolved.length === 2))
  assert.deepEqual(reviewThreads(board, 'lab').find((t) => t.checkout === 'resolving')!.resolved, [1, 2])
  const again = await post('reviews/resolve', { project: 'lab', checkout: 'resolving', author: 'ODIN-07', notes: [2] })
  assert.deepEqual(JSON.parse(again.body), { t: 'error', code: 'invalid', message: 'n2 is resolved already, by n4' })
  assert.equal(errorCode(await post('reviews/resolve', { project: 'lab', checkout: 'resolving', author: 'ODIN-07', notes: [9] })), 'invalid')
  assert.equal(errorCode(await post('reviews/resolve', { project: 'lab', checkout: 'nowhere', author: 'ODIN-07', notes: [1] })), 'not_found')
  const said = cli(SESSION, 'note', 'on', 'resolving', 'resolve', 'n3')
  assert.match(said, /^Resolved n3 with n5 on the thread of checkout resolving: /)
  assert.deepEqual(parseThread(readFileSync(path.join(threadsIn('lab'), 'resolving.md'), 'utf8')).messages.at(-1)!.body, '**Resolved:** n3')
})

test('reviews: on a floor keeping no threads, Tidy lists and files no thread, and a discard, which nothing there records, is refused and touches nothing', async () => {
  mkdirSync(threadsIn('bare'), { recursive: true })
  writeFileSync(path.join(threadsIn('bare'), 'landed.md'), threadText('landed'))
  const board = await boardWhere((b) => floorOf(b, 'bare').worktrees !== undefined && floorOf(b, 'lab').tidy.threads !== undefined)
  assert.deepEqual(floorOf(board, 'bare').tidy.threads, [])
  assert.equal(errorCode(await post('tidy', { project: 'bare', plan: { ...NO_TIDY, threads: ['landed'] } })), 'refused')
  const { tree, held } = cutWithWork(BARE, 'thrown')
  const atRisk = await boardWhere((b) => floorOf(b, 'bare').worktrees.some((w) => w.name === 'thrown' && w.state === 'at-risk'))
  assert.deepEqual(floorOf(atRisk, 'bare').worktrees.find((w) => w.name === 'thrown')!.verbs, [], 'nothing records a discard there, so none is offered')
  assert.equal(errorCode(await post('worktree/discard', { project: 'bare', name: 'thrown', author: 'NEMO-92', held })), 'refused')
  assert.ok(existsSync(tree))
  assert.deepEqual(readdirSync(threadsIn('bare')), ['landed.md'])
  assert.equal(readFileSync(path.join(threadsIn('bare'), 'landed.md'), 'utf8'), threadText('landed'))
})

test("server: Tidy offers an extension stream's month closed more than retention.days ago, archives it, and its fold reads it the same", async () => {
  type Kept = { beats: { count: number } }
  const kept = async (): Promise<Kept> => JSON.parse((await get('/pulse/kept/lab')).body)
  const before = (await kept()).beats.count
  const month = path.join('projects', 'lab', 'pulse.beats', '2025-01.jsonl')
  const startedAt = Date.UTC(2025, 0, 1)
  mkdirSync(path.dirname(path.join(ROOT, 'streams', month)), { recursive: true })
  writeFileSync(path.join(ROOT, 'streams', month), `${JSON.stringify({ stream: 'pulse.beats', startedAt, version: 1 })}\n${JSON.stringify([60, 'b', { item: 'old-beat' }])}\n`)
  await settled(kept, (k) => k.beats.count === before + 1)
  const board = await settled(
    async () => ((await firstEvent('/board')) as Extract<BoardMsg, { board: unknown }>).board,
    (b) => b.floors.find((f) => f.id === 'lab')!.tidy.streams.some((m) => m.file === month),
  )
  const old = board.floors.find((f) => f.id === 'lab')!.tidy.streams.filter((m) => m.file === month)
  const tidied = await command('tidy', { project: 'lab', plan: { worktrees: [], branches: [], threads: [], prune: [], logs: [], streams: old } })
  assert.deepEqual(tidied.streams, [month])
  assert.ok(existsSync(path.join(ROOT, 'streams', `${month}.gz`)) && !existsSync(path.join(ROOT, 'streams', month)))
  assert.equal((await settled(kept, (k) => k.beats.count === before + 1)).beats.count, before + 1)
})

test("server: tidy hands each extension its listed entries through tower/tidy.apply, its answer in the reply's x, and refuses an entry no longer listed", async () => {
  const plan = { worktrees: [], branches: [], threads: [], prune: [], logs: [], streams: [] }
  const tidied = await post('tidy', { project: 'lab', plan: { ...plan, x: { pulse: ['echo'] } } })
  assert.equal(tidied.status, 200, tidied.body)
  assert.deepEqual(JSON.parse(tidied.body).x, { pulse: { done: ['echo'], skipped: [] } })
  const gone = await post('tidy', { project: 'lab', plan: { ...plan, x: { pulse: ['gone'] } } })
  assert.deepEqual(JSON.parse(gone.body), { t: 'error', code: 'refused', message: "Tidy's list moved on: pulse's gone no longer qualifies" })
})

test('server: extension/restart reads an extension again, a module its server imports included, and an unknown one is not found', async () => {
  writeFileSync(path.join(PULSE, 'words.ts'), "export const word = 'thump'\n")
  assert.equal(JSON.parse((await get('/pulse/beats/lab')).body).word, 'beat', 'an edit waits for a restart')
  assert.deepEqual(await command('extension/restart', { id: 'pulse' }), { t: 'restarted', state: 'started' })
  assert.equal(JSON.parse((await get('/pulse/beats/lab')).body).word, 'thump')
  assert.equal(errorCode(await post('extension/restart', { id: 'nowhere' })), 'not_found')
})

test("server: a spawn's extension field is logged as a fact before the worker's first event, its launch adds the role's text, and its card shows the role; a spawn whose role is gone is refused", async () => {
  const lab = () => settled(async () => {
    const msg = (await firstEvent('/board')) as BoardMsg
    assert.ok('board' in msg)
    return msg.board
  }, (b) => b.floors.find((f) => f.id === 'lab')!.x?.roles !== undefined)
  const before = await lab()
  assert.deepEqual(before.floors.find((f) => f.id === 'lab')!.x?.roles, { options: [{ value: 'builder.md', label: 'Builder' }] })
  assert.deepEqual(before.extensions.find((e) => e.id === 'roles')!.spawn, { fields: [{ name: 'role', words: { label: 'Role', hint: 'What this worker is for' }, options: 'floor.x.roles.options' }] })

  const { id } = await command('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } } })
  const [header, first, ...rest] = (await settled(async () => readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8'), (log) => log.includes('"x"'))).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(first.slice(1), ['h', { hook_event_name: 'tower.x.roles.role', value: 'builder.md' }])
  assert.ok(rest.some(([, code]) => code === 'o'))
  const brief = header.argv[header.argv.indexOf('--append-system-prompt') + 1] as string
  assert.ok(brief.endsWith(`\n\n${BUILDER}`), brief.slice(-200))

  const board = await settled(async () => {
    const msg = (await firstEvent('/board')) as BoardMsg
    assert.ok('board' in msg)
    return msg.board
  }, (b) => b.floors.some((f) => f.cards.some((c) => c.id === id && c.x?.roles !== undefined)))
  assert.deepEqual(board.floors.flatMap((f) => f.cards).find((c) => c.id === id)!.x?.roles, { role: 'builder.md' })
  assert.deepEqual(board.adds[`card:${id}`]?.badges, [{ label: 'builder.md', tone: 'quiet', cap: 'roles' }])

  const gone = await post('spawn', { project: 'lab', x: { roles: { role: 'gone.md' } } })
  assert.equal(errorCode(gone), 'internal')
  assert.match(JSON.parse(gone.body).message, /^roles's launch contributor threw: lab\/roles holds no item "gone\.md"/)
  assert.equal(errorCode(await post('spawn', { project: 'lab', x: { roles: { mood: 'calm' } } })), 'invalid')
  assert.equal(errorCode(await post('spawn', { project: 'lab', x: { nobody: { role: 'x' } } })), 'invalid')
})

test('server: a collection item is created, written, read back and deleted', async () => {
  const item = { project: 'lab', collection: 'drafts' }
  const created = await command('collection/create', { ...item, name: 'A Draft', ext: 'md', content: '# A draft\n' })
  const at = `/collection/lab/drafts/${created.id}`
  assert.equal((await get(at)).body, '# A draft\n')
  await command('collection/write', { ...item, id: created.id, content: '# A draft, again\n', modifiedAt: created.modifiedAt })
  assert.equal((await get(at)).body, '# A draft, again\n')
  await command('collection/delete', { ...item, id: created.id })
  assert.equal(errorCode(await get(at)), 'not_found')
})

test('server: a review note is appended to its thread', async () => {
  const appended = await command('review/append', { project: 'lab', checkout: 'main', author: 'NEMO-92', body: 'A note.' })
  assert.equal(appended.n, 1)
  const thread = parseThread((await get(`/collection/lab/reviews/${appended.id}`)).body)
  assert.deepEqual([thread.checkout, thread.messages.map((m) => [m.author, m.body.trim()])], ['main', [['NEMO-92', 'A note.']]])
})

test('server: what comes from outside the tower is refused', async () => {
  const draft = JSON.stringify({ project: 'lab', collection: 'drafts', ext: 'md', content: '' })
  const json = { 'content-type': 'application/json' }
  assert.equal((await request('/collection/create', { method: 'POST', headers: { ...json, origin: 'http://evil.example' } }, draft)).status, 403)
  assert.equal((await request('/collection/create', { method: 'POST', headers: json }, draft)).status, 403)
  assert.equal((await request('/schema', { headers: { host: 'evil.example' } })).status, 403)
  assert.equal(errorCode(await get('/nothing/here')), 'not_found')
  assert.equal(errorCode(await post('no/verb', {})), 'not_found')
})

/** Only the length is sent: the tower refuses on it and closes, and a body sent after would race that close. */
test('server: a body declared past 8 MiB is refused as invalid', async () => {
  const reply = await request('/collection/create', { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'content-length': 8 * 1024 * 1024 + 1 } })
  assert.equal(reply.status, 400)
  assert.equal(errorCode(reply), 'invalid')
})

test('server: no hidden file is served below a shown page or a renderer', async () => {
  assert.equal(errorCode(await get(`/shown/${SESSION}${path.join(HUB, 'report', '.secret')}`)), 'not_found')
  assert.equal(errorCode(await get('/r/plain/.secret')), 'not_found')
})


test('server: review threads written before the reviews extension read the same: threads, landed, filed, unseen, history and tower thread', async () => {
  const board = await settled(
    async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    },
    (b) => b.floors.find((f) => f.id === 'desk')!.worktrees.length === 3,
  )
  const desk = board.floors.find((f) => f.id === 'desk')!
  const lark = deskCallsign(DESK_SESSIONS.lark)
  const note = (checkout: string) => ['review/append', { project: 'desk', checkout }] as const
  const noting = (checkout: string) => ({ verbs: ['note'], calls: { note: note(checkout) }, actions: [{ verb: 'note', call: note(checkout) }] })
  const quiet = { verbs: [], calls: {}, actions: [] }
  const last = (author: string, at: number, n: number) => ({ author, at: localStamp(at), n })
  assert.deepEqual(desk.threads, [
    { checkout: 'kite-2', id: 'kite-2.md', tag: 'merry-grove', messages: 1, last: last('Ana', DESK_STARTED - 10 * MIN, 1), landed: true, state: { is: 'gone' }, ...quiet },
    { checkout: 'main', id: 'main.md', tag: 'chalk-whale', messages: 1, last: last('Ana', DESK_STARTED, 1), landed: true, state: { is: 'live' }, ...noting('main') },
    { checkout: 'odin-1', id: 'odin-1.md', tag: 'vivid-badger', messages: 4, last: last('Ana', DESK_STARTED + 4 * MIN, 4), landed: false, state: { is: 'live' }, ...noting('odin-1') },
  ])
  assert.deepEqual(desk.tidy.threads, ['kite-2', 'main'], 'Tidy files the threads whose work landed')
  const kept = desk.collections.find((c) => c.id === 'reviews')!
  assert.deepEqual([kept.label, kept.description, kept.items.map((i) => i.id)], ['Reviews', 'One review thread per checkout.', ['kite-2.md', FILED_ID, 'main.md', 'odin-1.md']], "the config's line names the collection")
  const served = await get('/reviews.js')
  assert.equal(served.status, 200)
  for (const name of ['parseThread', 'printThread', 'appended', 'unseenBy', 'landedThreads', 'anchorState', 'sendText']) assert.match(served.body, new RegExp(`\\b${name}\\b`), `/reviews.js serves ${name}`)

  const filed = { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT }
  const cardOf = (id: string) => {
    const c = desk.cards.find((c) => c.id === id)!
    return { reviews: c.reviews, checkoutState: c.checkoutState, threadState: c.threadState, unseen: c.unseen, note: c.calls.note }
  }
  assert.deepEqual(cardOf(DESK_SESSIONS.author), { reviews: undefined, checkoutState: { is: 'live' }, threadState: { is: 'live' }, unseen: 2, note: note('odin-1') })
  assert.deepEqual(cardOf(DESK_SESSIONS.reviewer), { reviews: AUTHOR, checkoutState: { is: 'live' }, threadState: { is: 'live' }, unseen: 1, note: note('odin-1') }, "a reviewer's thread is its author's")
  const landed = { is: 'landed', on: 'main', empty: true, filed }
  assert.deepEqual(cardOf(DESK_SESSIONS.lark), { reviews: undefined, checkoutState: landed, threadState: landed, unseen: undefined, note: undefined }, 'its work landed, its thread filed after it started')

  const message = (author: string, at: number, n: number, body: string, more: object = {}) => ({ author, at: localStamp(at), n, anchors: [], body, ...more })
  assert.deepEqual(JSON.parse((await get('/reviews/desk')).body), {
    threads: [
      { id: 'kite-2.md', checkout: 'kite-2', messages: [message('Ana', DESK_STARTED - 10 * MIN, 1, 'Where did this go?')] },
      { id: 'main.md', checkout: 'main', messages: [message('Ana', DESK_STARTED, 1, 'The main checkouts look clean.')] },
      {
        id: 'odin-1.md',
        checkout: 'odin-1',
        messages: [
          message('Ana', DESK_STARTED + MIN, 1, 'Why two lines?', { anchors: [{ repo: 'desk', path: 'src/a.ts', from: 1, to: 2, quote: { lang: 'ts', lines: ['one', 'two'] } }] }),
          message(AUTHOR, DESK_STARTED + 2 * MIN, 2, 'One per case.', { re: 1 }),
          message(REVIEWER, DESK_STARTED + 3 * MIN, 3, '**fix first**: the second case has no test.', { verdict: 'fix first' }),
          message('Ana', DESK_STARTED + 4 * MIN, 4, 'And name the file.'),
        ],
      },
      { id: FILED_ID, checkout: 'lark-3', landed: FILED_AT, messages: [message(lark, DESK_STARTED + 5 * MIN, 1, '**ship**', { verdict: 'ship' })] },
    ],
    authors: {
      Ana: { notes: 4, replies: 0, verdicts: {}, checkouts: ['kite-2', 'main', 'odin-1'] },
      [AUTHOR]: { notes: 0, replies: 1, verdicts: {}, checkouts: ['odin-1'] },
      [REVIEWER]: { notes: 1, replies: 0, verdicts: { 'fix first': 1 }, checkouts: ['odin-1'] },
      [lark]: { notes: 1, replies: 0, verdicts: { ship: 1 }, checkouts: ['lark-3'] },
    },
  })

  const threads = path.join(ROOT, 'collections', 'desk', 'reviews')
  assert.equal(
    cli(DESK_SESSIONS.author, 'thread'),
    `${DESK_THREADS['odin-1.md']}\n(${threads}/odin-1.md) New to you since your last note: n3, n4.\nA note's anchors name one of the checkout's repos: desk:<path>:<from>-<to>.\n`,
  )
  assert.equal(
    cli(DESK_SESSIONS.reviewer, 'thread'),
    `${DESK_THREADS['odin-1.md']}\n(${threads}/odin-1.md) New to you since your last note: n4.\nA note's anchors name one of the checkout's repos: desk:<path>:<from>-<to>.\n`,
  )
  assert.equal(cli(DESK_SESSIONS.lark, 'thread', 'kite-2').split('\n').at(-3), `(${threads}/kite-2.md) New to you since your last note: n1.`, "a worker that never wrote on a thread has seen none of it")
})

test("server: the reviews extension holds the threads under its own names, and the old ones answer deprecated, naming them", async () => {
  const board = await settled(
    async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    },
    (b) => b.floors.find((f) => f.id === 'desk')!.worktrees.length === 3,
  )
  const desk = board.floors.find((f) => f.id === 'desk')!
  const part = desk.x?.reviews as { threads: { key: string; checkout: string; calls: { note?: unknown } }[] }
  assert.deepEqual(part.threads.map((t) => [t.key, t.calls.note]), [
    ['desk/kite-2', undefined],
    ['desk/main', ['reviews/append', { project: 'desk', checkout: 'main' }]],
    ['desk/odin-1', ['reviews/append', { project: 'desk', checkout: 'odin-1' }]],
  ])
  const cardPart = (id: string) => desk.cards.find((c) => c.id === id)!.x?.reviews
  assert.deepEqual(cardPart(DESK_SESSIONS.reviewer), { thread: 'odin-1', threadState: { is: 'live' }, unseen: 1, of: AUTHOR, note: ['reviews/append', { project: 'desk', checkout: 'odin-1' }] })
  assert.deepEqual(cardPart(DESK_SESSIONS.lark), { thread: 'lark-3', threadState: { is: 'landed', on: 'main', empty: true, filed: { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT } }, filed: { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT } })
  assert.deepEqual(desk.main, { dirty: 0, ahead: 0, inUse: false })

  const history = await get('/reviews/history/desk')
  const old = await get('/reviews/desk')
  assert.deepEqual([old.status, old.body, old.headers.deprecation, old.headers.link], [200, history.body, '@0', '</reviews/history/<project>>; rel="successor-version"'])
  const served = await get('/reviews.js')
  assert.deepEqual([served.headers.deprecation, served.headers.link], ['@0', '</x/reviews/reviews.js>; rel="successor-version"'])
  const appended = await post('review/append', { project: 'desk', checkout: 'kite-2', author: 'Ana', body: 'Through the old name.' })
  assert.deepEqual([appended.status, JSON.parse(appended.body).n, appended.headers.deprecation], [200, 2, '@0'])
  const refused = await post('collection/create', { project: 'desk', collection: 'reviews', name: 'by hand', ext: 'md', content: '# x' })
  assert.deepEqual([errorCode(refused), JSON.parse(refused.body).message], ['refused', 'reviews owns reviews: use reviews/append'])
  const said = JSON.parse((await get(`/reviews/said/desk?checkout=odin-1&reader=${AUTHOR}&sender=Ana`)).body)
  assert.deepEqual([said.unseen, said.send], [[3, 4], `Review notes from Ana (n3, n4) on checkout odin-1: read the thread with \`tower thread odin-1\`, act on them, and answer each with \`tower note on odin-1 re n<k>\` (the reply on stdin).`])
})

test("server: an archived card carries the extensions' parts and the old fields LEGACY copies, as the board's cards do", async () => {
  const archived = (await settled(
    async () => JSON.parse((await get('/archive/desk')).body) as Card[],
    (cards) => cards.some((c) => c.id === DESK_SESSIONS.past && c.x?.reviews !== undefined),
  )).find((c) => c.id === DESK_SESSIONS.past)!
  const note = ['reviews/append', { project: 'desk', checkout: 'odin-1' }]
  assert.deepEqual(archived.x?.reviews, { thread: 'odin-1', threadState: { is: 'live' }, unseen: 4, note })
  assert.deepEqual([archived.threadState, archived.unseen, archived.calls.note], [{ is: 'live' }, 4, ['review/append', { project: 'desk', checkout: 'odin-1' }]])
  const run = { policy: 'sweep.md', tag: tagOf('sweep.md'), n: 1, start: 'hand', slot: null }
  assert.deepEqual([archived.x?.policies, archived.run], [{ run }, run], "a policy's run keeps its part and its old field too")
})

test('server: a note appended through review/append is the same bytes, numbered one past the last, and the thread file stays the format', async () => {
  const before = readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'main.md'), 'utf8')
  const reply = await command('review/append', {
    project: 'desk',
    checkout: 'main',
    author: AUTHOR,
    re: 1,
    anchors: [{ repo: 'desk', path: 'src/a.ts', from: 1, to: 1, quote: { lang: 'ts', lines: ['one'] } }],
    body: '  Agreed.\n',
  })
  assert.deepEqual({ t: reply.t, id: reply.id, n: reply.n }, { t: 'appended', id: 'main.md', n: 2 })
  const after = readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'main.md'), 'utf8')
  const at = parseThread(after).messages[1].at
  assert.equal(after, `${before}\n## ${AUTHOR} · ${at} · n2 · re n1\n\`desk:src/a.ts:1\`\n\`\`\`ts\none\n\`\`\`\nAgreed.\n`)
  const made = await command('review/append', { project: 'desk', checkout: 'wren-5', author: 'Ana', body: 'First.' })
  assert.deepEqual({ id: made.id, n: made.n }, { id: 'wren-5.md', n: 1 })
  assert.equal(readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'wren-5.md'), 'utf8'), `# wren-5\n\n## Ana · ${parseThread(readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'wren-5.md'), 'utf8')).messages[0].at} · n1\nFirst.\n`)
  for (const [input, code] of [
    [{ project: 'desk', checkout: 'main', author: 'Ana', body: '  ' }, 'invalid'],
    [{ project: 'desk', checkout: 'main', author: 'Ana', body: '## Ana · 2026-10-06 14:32 · n9\nforged' }, 'invalid'],
    [{ project: 'desk', checkout: 'main', author: 'Ana', re: 9, body: 'to nothing' }, 'not_found'],
  ] as const)
    assert.equal(errorCode(await post('review/append', input)), code)
  assert.match(String(made.modifiedAt), /^\d+$/)
})

test("server: reviews/hire starts a reviewer in a fork of its author's checkout, logged in its crew and exempt before it starts, so a full hiring limit never refuses it; the card verb review renderers before 1.95 call still hires one, read from its prompt; a refused hire cuts nothing", async () => {
  const boardWhen = (holds: (b: Board) => boolean) =>
    settled(async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    }, holds)
  const cardIn = (b: Board, id: string) => b.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  const offering = await boardWhen((b) => b.adds[`card:${LAB_AUTHOR}`]?.actions?.some((a) => 'verb' in a && a.verb === 'reviews/hire') ?? false)
  const author = cardIn(offering, LAB_AUTHOR)!
  assert.deepEqual(offering.adds[`card:${LAB_AUTHOR}`]!.actions!.find((a) => 'verb' in a && a.verb === 'reviews/hire'), { verb: 'reviews/hire', call: { project: 'lab', of: author.callsign }, cap: 'reviews' })
  const trees = () => execFileSync('git', ['-C', HUB, 'worktree', 'list']).toString()
  const treesBefore = trees()

  assert.equal(errorCode(await post('spawn', { project: 'lab', prompt: 'Build it.', by: SESSION, hire: true })), 'limited')
  assert.equal(errorCode(await post('reviews/hire', { project: 'lab', of: 'NOBODY-1', by: SESSION })), 'not_found')
  assert.equal(errorCode(await post('spawn', { project: 'lab', cut: { from: 'main' }, x: { reviews: { of: 'NOBODY-1' } } })), 'not_found')
  assert.equal(trees(), treesBefore)

  const hired = JSON.parse((await post('reviews/hire', { project: 'lab', of: author.callsign.toLowerCase(), by: SESSION, tell: true })).body) as Replies['spawn']
  assert.equal(hired.t, 'spawned')
  const [header, ...events] = (await settled(async () => readFileSync(path.join(ROOT, 'sessions', `${hired.id}.jsonl`), 'utf8'), (log) => log.includes('"o"'))).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(header.argv.slice(-2), ['--', `/tower:review ${author.callsign} tell`])
  assert.deepEqual(events.slice(0, 3).map(([, code, fact]) => [code, fact]), [
    ['h', { hook_event_name: 'tower.x.reviews.of', value: author.callsign }],
    ['h', { hook_event_name: 'tower.exempt', from: 'hiring', by: 'reviews' }],
    ['h', { hook_event_name: 'tower.reports-to', callsign: author.callsign, session: LAB_AUTHOR, by: 'reviews' }],
  ])

  const old = offering.floors.flatMap((f) => f.cards).find((c) => c.id === LAB_AUTHOR)!.calls.review!
  assert.deepEqual(old, ['spawn', { project: 'lab', cut: { from: 'main' }, prompt: `/tower:review ${author.callsign}` }])
  const legacy = await command('spawn', { ...old[1], by: SESSION, hire: true })
  const legacyLog = await settled(async () => readFileSync(path.join(ROOT, 'sessions', `${legacy.id}.jsonl`), 'utf8'), (log) => log.includes('"o"'))
  assert.ok(!legacyLog.includes('tower.exempt') && !legacyLog.includes('tower.x.reviews'))

  const hiredBoard = await boardWhen((b) => [hired.id, legacy.id].every((id) => cardIn(b, id)?.reportsTo === LAB_AUTHOR))
  const reviewer = { reviews: author.callsign, of: author.callsign, crew: { callsign: author.callsign, session: LAB_AUTHOR, by: 'reviews' }, exempt: [{ from: 'hiring', by: 'reviews' }], reportsTo: LAB_AUTHOR, hiredBy: SESSION, review: undefined }
  const read = (id: string) => {
    const c = cardIn(hiredBoard, id)!
    return { reviews: c.reviews, of: (c.x?.reviews as { of?: string }).of, crew: c.crew, exempt: c.exempt, reportsTo: c.reportsTo, hiredBy: c.hiredBy?.session, review: c.calls.review }
  }
  assert.deepEqual([read(hired.id), read(legacy.id)], [reviewer, reviewer])
  assert.ok(!hiredBoard.adds[`card:${hired.id}`]?.actions?.some((a) => 'verb' in a && a.verb === 'reviews/hire'))

  const again = await post('reviews/hire', { project: 'lab', of: cardIn(hiredBoard, hired.id)!.callsign, by: SESSION })
  assert.equal(errorCode(again), 'refused')
  assert.match(JSON.parse(again.body).message, /'s work can't be reviewed: it has no conversation yet$/)
})
