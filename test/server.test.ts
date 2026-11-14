/**
 * The renderer API end to end: the tower server (`src/tower/server.ts`) booted as its own process on a throwaway system
 * root, read and driven over HTTP. No host or terms daemon runs: the one session is a log written into the root, which
 * is all the session reads need.
 *
 * Every test shares the one tower and its root, and they run in file order, each reading what the earlier ones left:
 * pulse's beats are counted from the first beat on lab, the workers earlier tests hired stay on lab under its
 * `hiring` limit, and a note appended to a desk thread moves the numbers of the notes after it. A test moved, cut or
 * added can shift what a later one reads.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { inspect } from 'node:util'
import { after, before, test } from 'node:test'
import { z } from 'zod'
import { ApiError, callerHeaders, ROUTES, type Replies, type Verb } from '../src/shared/api.ts'
import boardSchema from '../src/shared/board.schema.json' with { type: 'json' }
import { fonts } from '../src/shared/design.ts'
import { parseThread, unseenBy } from '../extensions/reviews/client/reviews.ts'
import type { FloorPart } from '../extensions/reviews/threads.ts'
import { BUNDLED, type Adds } from '../src/shared/extensions.ts'
import type { BoardMsg, Reads } from '../src/shared/shelf-page.ts'
import type { Card } from '../src/bridge/board.ts'
import { CORE_VIEWS_DIR, MODULES, sourceUrl, libraryUrls, SERVER_ONLY } from '../src/tower/served.ts'
import type { Library } from './library.ts'
import { bundledClient } from '../src/extensions.ts'
import { decide, floorPolicies, standing } from '../extensions/policies/client/policies.ts'
import { slotWords } from '../src/shared/slots.ts'
import { callsignsOf } from '../src/shared/model.ts'
import { tagOf } from '../src/shared/tags.ts'
import { isObject } from '../src/system.ts'
import { callsOf, verbsOf } from './actions.ts'

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
const TYPED = path.join(EXTENSIONS, 'typed')
/** The shipped example of a writable fact and a projected fold, run in place. */
const TABLINE = path.join(REPO, 'examples', 'extensions', 'tabline')
const HANDOFF = path.join(REPO, 'examples', 'extensions', 'handoff')
const BUILDER = '# Builder\n\nBuilds what it is asked, and tests it.\n'

const BOOT_MS = 15_000

let tower: ChildProcess
let host: ChildProcess
let base: string

const gitIn = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args], { encoding: 'utf8' })
const git = (...args: string[]) => gitIn(HUB, ...args)

const POLICY = '# Nightly\n\n```json\n{"when": {"cron": ["0 3 1 1 *"]}}\n```\n\nNever started: a run waits on the user\'s approval.\n'

/** Logs whose first line holds no header, named to sort first: the tower meets them before any other log. */
const HEADLESS = '20000101-000000-dead'
const FLOORLESS = '20000101-000001-dead'

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
  const ended = (id: string, cwd: string, startedAt: number, argv: string[], facts: object[] = []) => {
    const header = { id, project: 'desk', cwd, argv, startedAt, cols: 80, rows: 24 }
    const logged = facts.map((fact) => [0, 'h', fact])
    writeFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), [header, ...logged, [0.1, 'o', 'a worker\r\n'], [0.3, 'x', { exitCode: 0 }]].map((line) => JSON.stringify(line)).join('\n') + '\n')
  }
  writeFileSync(path.join(ROOT, 'sessions', `${HEADLESS}.jsonl`), `{"id":"cut sho\n${JSON.stringify([0.1, 'h', { hook_event_name: 'SessionStart', cwd: DESK }])}\n`)
  writeFileSync(path.join(ROOT, 'sessions', `${FLOORLESS}.jsonl`), 'null\n')
  ended(DESK_SESSIONS.author, path.join(DESK, '.worktrees', 'odin-1'), DESK_STARTED, ['bash'])
  ended(DESK_SESSIONS.reviewer, path.join(DESK, '.worktrees', 'odin-1-review'), DESK_STARTED + MIN, ['bash', '--', `/reviews:review ${AUTHOR}`], [
    { hook_event_name: 'tower.x.reviews.of', value: AUTHOR },
    { hook_event_name: 'tower.exempt', from: 'hiring', by: 'reviews' },
    { hook_event_name: 'tower.reports-to', callsign: AUTHOR, session: DESK_SESSIONS.author, by: 'reviews' },
  ])
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
  for (const dir of [path.join(HUB, 'report'), RENDERER, path.join(ROOT, 'sessions'), path.join(ROOT, 'collections', 'lab', 'policies'), path.join(ROOT, 'collections', 'lab', 'roles'), path.join(ROOT, 'collections', 'lab', 'roles.notes')]) mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(ROOT, 'collections', 'lab', 'roles', 'builder.md'), BUILDER)
  writeFileSync(path.join(ROOT, 'collections', 'lab', 'roles.notes', 'note.md'), '# A note\n')
  writeFileSync(SHOWN, '<!doctype html><title>report</title>')
  writeFileSync(path.join(HUB, 'report', '.secret'), 'hidden')
  writeFileSync(path.join(HUB, 'report', 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(path.join(RENDERER, 'index.html'), '<!doctype html><title>renderer</title>')
  writeFileSync(path.join(RENDERER, 'library.html'), '<!doctype html><html><head><title>library</title><script type="module" src="/lib/view.js"></script><script type="module" src="/lib/changes.js"></script></head></html>')
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
    hosts: ['lab.localhost'],
    retention: { days: 1 },
    renderers: { plain: { root: RENDERER } },
    extensions: { quota: { settings: { every: '1h' } }, pulse: { path: PULSE, settings: { every: 3_600_000 } }, chime: { path: CHIME }, tally: { path: TALLY }, roles: { path: ROLES }, tabline: { path: TABLINE }, typed: { path: TYPED }, handoff: { path: HANDOFF } },
    projects: {
      lab: { name: 'lab', hub: HUB, repos: [], shelf: [{ label: 'Report', html: 'report/index.html' }], hiring: { live: 0 } },
      desk: { name: 'desk', hub: DESK, repos: [], capabilities: { handoff: { off: true } } },
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

/** Git's identity for the commits the tower writes (a discard's record): HOME is the throwaway root, which has none. */
const GIT_IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }

const ENV = { PATH: process.env.PATH, HOME: ROOT, TOWER_CONFIG: path.join(ROOT, 'config.json'), TZ: process.env.TZ, ...GIT_IDENTITY }

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
      if (code) console.error(`the tower exited with ${code}, its stderr ending:\n${err.slice(-4000)}`)
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

/**
 * A board stream held open once its first event came, and its close: while one is open, git is read only as its changes
 * settle, so a board can come before the tower has read what the test just did in git.
 */
const heldBoard = (): Promise<() => void> =>
  new Promise((resolve, reject) => {
    const req = http.get(`${base}/board`, { agent: false }, (res) => res.setEncoding('utf8').once('data', () => resolve(() => req.destroy())))
    req.on('error', reject)
  })

const errorCode = (reply: Reply): string => ApiError.parse(JSON.parse(reply.body)).code

test("server: a log that lost its header costs its own session: the tower starts, it reads broken in its floor's archive, and its reads answer", async () => {
  const lost = (JSON.parse((await get('/archive/desk')).body) as { id: string; attention: string; broken?: { message: string } }[]).find((c) => c.id === HEADLESS)!
  assert.equal(lost.attention, 'broken')
  assert.match(lost.broken!.message, /^its first line isn't JSON/)
  assert.equal((await get(`/conversations/${HEADLESS}`)).status, 200)
  assert.equal((await get(`/conversations/${FLOORLESS}`)).status, 404)
})

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
    ['/config', 'application/json', has('argv', 'projects')],
    [`/conversations/${SESSION}`, 'application/json', isArray],
    ['/archive/lab', 'application/json', isArray],
    ['/landing?project=lab&branch=feature', 'application/json', has('branch', 'repos')],
    [`/changes/${SESSION}`, 'application/json', isArray],
    [`/changes/${SESSION}?scope=uncommitted`, 'application/json', isArray],
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

/**
 * Each `src/shared` file holding state at its top level, with what declares it as the tower serves it: a `let`, or a
 * `new Map`, `Set`, `WeakMap` or `WeakSet` assigned. A bundle may suffix the name to keep it apart (`inFlight2`).
 */
const STATEFUL = readdirSync(path.join(REPO, 'src', 'shared'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => path.join(REPO, 'src', 'shared', name))
  .flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/^(?:export )?(?:let (\w+)|const (\w+)(?::[^=]+)? = new (?:Map|Set|WeakMap|WeakSet)\b)/gm)].map(([line, mutable, held]) => ({
      file,
      line,
      declared: mutable
        ? new RegExp(`\\b(?:var|let) ${mutable}\\d*\\s*[;=,]`)
        : new RegExp(`\\b(?:var|let|const) ${held}\\d* = (?:/\\* @__PURE__ \\*/ )?new (?:Map|Set|WeakMap|WeakSet)\\b`),
    })),
  )

/**
 * A served text by the source file each part was built from, as esbuild marks it (`// src/shared/press.ts`), `''`
 * before the first mark: another file's part holds that file's own state, though it may share a name.
 */
const sectionsOf = (text: string): [at: string, body: string][] =>
  text.split(/^(?=\/\/ \S+\.[jt]s$)/m).map((part) => [/^\/\/ (\S+\.[jt]s)$/m.exec(part.split('\n')[0]!)?.[1] ?? '', part])

/** Every URL a served module's text imports, statically or by a literal `import()`. */
const importedUrls = (text: string) => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)"(\/[^"]+)"/g)].map(([, url]) => url!)

test("server: a page gets one copy of each module: no served module, core view or bundled client holds another file's state, each served once at its own URL", async () => {
  const clients = BUNDLED.flatMap((cap) => {
    const dir = bundledClient(cap)
    return dir ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => `/x/${cap}/${f.replace(/\.ts$/, '.js')}`) : []
  })
  const views = readdirSync(CORE_VIEWS_DIR).filter((f) => f.endsWith('.ts')).map((f) => `/x/tower/${f.replace(/\.ts$/, '.js')}`)
  const texts = new Map<string, string>()
  for (let queue = [...Object.keys(MODULES), ...views, ...clients]; queue.length; ) {
    const url = queue.shift()!
    if (texts.has(url)) continue
    const reply = await get(url)
    assert.equal(reply.status, 200, `${url}: ${reply.body.slice(0, 300)}`)
    assert.equal(reply.headers['access-control-allow-origin'], '*', url)
    texts.set(url, reply.body)
    queue.push(...importedUrls(reply.body).filter((imported) => /^\/(shared|src|vendor|x)\//.test(imported)))
  }
  assert.ok(STATEFUL.some((s) => s.line.includes('inFlight')), "press.ts's in-flight set is among the stateful files")
  for (const { file, line, declared } of STATEFUL) {
    const own = sourceUrl(file)
    const holders = [...texts].filter(([, text]) => sectionsOf(text).some(([at, body]) => (at === '' || path.join(REPO, at) === file) && declared.test(body))).map(([url]) => url)
    assert.deepEqual(holders, texts.has(own) ? [own] : [], `${path.relative(REPO, file)}'s \`${line}\` is served by ${holders.join(', ') || 'nothing'}, not by ${own} alone`)
  }
  for (const [url, text] of texts) {
    if (url.startsWith('/vendor/')) continue
    const copied = [...text.matchAll(/^\/\/ (src\/\S+\.ts)$/gm)].map(([, at]) => at).filter((at) => sourceUrl(path.join(REPO, at!)) !== url)
    assert.deepEqual(copied, [], `${url} inlines files the tower serves at their own URLs`)
  }
})

/** The names a served module's text exports, as esbuild writes them: `export {\n  a,\n  b\n} from "…"` and `export const a`. */
const exportedNames = (text: string) =>
  [...text.matchAll(/^export \{([^}]*)\}/gm)].flatMap(([, list]) => list!.split(',').map((name) => name.trim()).filter(Boolean)).concat([...text.matchAll(/^export const (\w+)/gm)].map(([, name]) => name!)).sort()

test('server: each /lib/ URL exports what the list says, at one URL, and a browser is told that server code is not for it', async () => {
  const { library } = JSON.parse(readFileSync(path.join(REPO, 'test', 'served-exports.json'), 'utf8')) as { library: Library }
  assert.deepEqual(Object.keys(library).sort(), libraryUrls())
  for (const url of libraryUrls()) {
    const reply = await get(url)
    assert.equal(reply.status, 200, `${url}: ${reply.body.slice(0, 300)}`)
    assert.equal(reply.headers['access-control-allow-origin'], '*', url)
    assert.deepEqual(exportedNames(reply.body), Object.keys(library[url]!.values).sort(), url)
    assert.equal(/throw new Error/.test(reply.body), SERVER_ONLY.includes(url), url)
  }
  assert.equal((await get('/src/lib/words.js')).status, 404)
  const told = (await get('/lib/extension.js')).body
  assert.match(told, /server code/)
  assert.match(told, /import type/)
})

test('server: a page loading /lib/view.js and /lib/changes.js gets one press.ts, and the library keeps its hashed URLs and preloads', async () => {
  const page = (await get('/r/plain/library.html')).body
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(page)![1]!) as { imports: Record<string, string> }
  const preloads = [...page.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(([, url]) => url!)
  for (const url of ['/lib/view.js', '/lib/changes.js', '/shared/press.js']) {
    assert.match(map.imports[url] ?? '', /\.[0-9a-f]{10}\.js$/, `${url} has no hashed URL in the page's map`)
    assert.ok(preloads.includes(map.imports[url]!), `${url} is not preloaded at its hashed URL`)
    assert.match((await get(map.imports[url]!)).headers['cache-control'] as string, /immutable/, url)
  }
  assert.deepEqual(preloads.filter((url) => /\/press(\.[0-9a-f]{10})?\.js$/.test(url)), [map.imports['/shared/press.js']], 'one press.ts on the page')
  const texts = await Promise.all(preloads.map(async (url) => (await get(url)).body))
  const pressing = texts.filter((text) => /\binFlight\d*\s*=\s*(?:\/\* @__PURE__ \*\/ )?new (?:Map|Set|WeakMap|WeakSet)\b/.test(text))
  assert.equal(pressing.length, 1, 'one file holds the in-flight set')
})

test('server: the old served modules say they are deprecated, and link to what replaces them', async () => {
  const { headers } = await get('/cards.js')
  assert.equal(headers.deprecation, '@0')
  assert.match(headers.link as string, /^<https:[^>]+#the-library>; rel="deprecation"$/)
  assert.equal((await get('/lib/words.js')).headers.deprecation, undefined)
})

test('server: a sandboxed html file read by a script is the file as written; loaded any other way, its frame keys follow it', async () => {
  const page = '/shelf/lab/0/report/index.html'
  const read = await request(page, { headers: { 'sec-fetch-dest': 'empty' } })
  assert.equal(read.body, '<!doctype html><title>report</title>')
  for (const dest of ['iframe', 'document', undefined]) {
    const loaded = await request(page, { headers: dest ? { 'sec-fetch-dest': dest } : {} })
    assert.ok(loaded.body.endsWith('<script src="/frame-keys.js"></script>\n'), `${dest}: ${loaded.body}`)
  }
})

/** The `tower` command as a worker runs it: its output, or its failure's. */
const cli = (session: string, ...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', path.join('src', 'cli.ts'), ...args], { cwd: REPO, env: { ...ENV, TOWER_SESSION_ID: session }, encoding: 'utf8' })

// The slot loop's first tick runs quota's read 30 s after the tower starts, and read-now then refuses for a minute: this test must run before that.
test("server: the quota probe reads the folder its stream kept, and reads now at most once a minute, appending to that folder", async () => {
  const { board } = (await firstEvent('/board')) as Extract<BoardMsg, { board: unknown }>
  const status = board.x?.quota as { every: number; lastAt: number }
  assert.equal(status.every, 3_600_000, 'extensions.quota.settings.every')
  const { reads } = JSON.parse((await get('/quota/reads?last=3')).body)
  assert.equal(reads.length, 3, "the old folder's reads are the stream's")
  const run = await post('quota/read-now', {})
  assert.equal(run.status, 200)
  const read = JSON.parse(run.body) as { ok: boolean; error?: string }
  assert.equal(read.ok, false, 'a config whose argv is no Claude answers no get_usage')
  assert.equal(errorCode(await post('quota/read-now', {})), 'refused', 'a read starts at most once a minute')
  const [newest] = JSON.parse((await get('/quota/reads?last=1')).body).reads
  assert.deepEqual([newest.ok, newest.error], [false, read.error], 'the read is appended to the old folder, newest first')
})

/** The `tower` command run with `stdin` as its fd 0: its stdout, its stderr and how it exited. */
const towerWith = (stdin: 'pipe' | number, session: string | undefined, args: string[], input?: string) => {
  const { stdout, stderr, status } = spawnSync(process.execPath, ['--import', 'tsx', path.join('src', 'cli.ts'), ...args], {
    cwd: REPO,
    env: { ...ENV, ...(session && { TOWER_SESSION_ID: session }) },
    encoding: 'utf8',
    stdio: [stdin, 'pipe', 'pipe'],
    input,
  })
  return { stdout, stderr, status }
}

/** The typed example extension's words, `tower x typed …`, run as `towerWith` runs a command. */
const typedWith = (stdin: 'pipe' | number, session: string | undefined, args: string[], input?: string) => towerWith(stdin, session, ['x', 'typed', ...args], input)

/** `run` given a file holding `input` as its stdin, as a heredoc gives it. */
const onStdin = <R,>(input: string, run: (fd: number) => R): R => {
  const file = path.join(ROOT, 'typed-stdin')
  writeFileSync(file, input)
  const fd = openSync(file, 'r')
  try {
    return run(fd)
  } finally {
    closeSync(fd)
  }
}

const typed = (session: string | undefined, args: string[], input = '') => onStdin(input, (fd) => typedWith(fd, session, args))

test('server: an extension typed as a command gets its input as written, its caller and its floor, through one path', async () => {
  const resolved = JSON.parse(typed(SESSION, ['resolve', '3', '4'], 'Done.\n').stdout)
  assert.deepEqual(resolved.input, { notes: [3, 4], body: 'Done.\n' }, 'a file on stdin gives its text')
  assert.deepEqual(resolved.caller, { t: 'worker', id: SESSION, via: 'cli', within: [] })
  assert.deepEqual(JSON.parse(typedWith('pipe', SESSION, ['resolve', '3', '4'], 'Done.\n').stdout).input, { notes: [3, 4] }, 'a socket on stdin, which may never end, gives no text')

  const note = typed(SESSION, ['note', '--re', '3'], 'Line one.\nLine two.\n')
  assert.deepEqual([note.status, note.stdout], [0, `said ${JSON.stringify({ project: 'lab', body: 'Line one.\nLine two.\n', re: 3 })}\n`])
  const elsewhere = typed(SESSION, ['note', '--project', 'desk'], 'Body.')
  assert.match(elsewhere.stdout, /"project":"desk"/)
  assert.equal(typed(SESSION, ['thread', 'odin-1']).stdout, 'lab at odin-1\n')
  assert.equal(typed(undefined, ['lines']).stdout, 'one\ntwo\n')
})

test('server: an error in a word says what to do next and exits non-zero, and a JSON argument is refused, naming the typed form', async () => {
  const failed = (session: string, args: string[], input?: string) => {
    const { status, stderr, stdout } = typed(session, args, input)
    assert.equal(status, 1, stdout)
    return stderr
  }
  assert.equal(failed(SESSION, ['note']), "tower: note needs its body on stdin: tower x typed note <<'EOF' … EOF\n")
  assert.equal(failed(SESSION, ['coutn']), 'tower: typed has no word "coutn"\n  → Did you mean count? `tower x typed` lists its words\n')
  assert.equal(failed('gone', ['note'], 'Body.'), 'tower: The tower has no session "gone"\n  → --project <id> names the floor\n')

  assert.equal(failed(SESSION, ['note', '{"body": "b"}']), "tower: tower x takes flags, not a JSON argument\n  → type tower x typed note <<'EOF' … EOF\n")
})

test("server: a door word reaches its door for the caller's session, a blank as an empty string", async () => {
  assert.deepEqual(JSON.parse(cli(SESSION, 'x', 'tabline', 'facts/line', '--value', '')), { session: SESSION, value: '' })
})

test('server: tower x lists capabilities, and tower x <cap> its words before its raw calls', async () => {
  const listed = cli(SESSION, 'x').split('\n')
  assert.ok(listed.includes('  tabline  ·  Set a short line under your card saying what you are on, when that changes.'), listed.join('\n'))
  assert.ok(listed.includes('  typed  ·  Typed'), listed.join('\n'))
  const cap = cli(SESSION, 'x', 'typed').split('\n')
  assert.deepEqual(cap.slice(0, 2), ['Words:', '  tower x typed echo --text <text>'])
  assert.ok(cap.indexOf('  tower x typed lines') < cap.findIndex((l) => l.startsWith('typed  Typed')), cap.join('\n'))
  assert.ok(cap.includes('  tower x typed plain/<id>  a read'), cap.join('\n'))
})

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
  const runByHand = (id: string) => ['run', ['policies/run', { project: 'lab', policy: id, start: 'hand' }]] as const
  const approve = (id: string, text: string) => ['approve', ['policies/approve', { project: 'lab', policy: id, hash: sha(text) }]] as const
  const offering = (...pairs: (readonly [string, unknown])[]) => ({ actions: pairs.map(([verb, call]) => ({ verb, call })) })
  const rule = (at: number) => `daily at ${new Date(at).toISOString().slice(11, 16)} (UTC)`
  const { sweep, triage, digest, broken } = KEPT
  const triageOffer = { slot: triage.slot, since: OFFERED_AT, until: triage.slot + DAY }
  const part = floorPolicies(floor)
  assert.deepEqual(
    part.policies.filter((p) => p.id !== 'nightly.md'),
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
  const accept = ['policies/run', { project: 'lab', policy: triage.id, slot: triage.slot, start: 'offer' }]
  assert.deepEqual(part.offers, [
    { key: `${triage.id}@${triage.slot}`, project: 'lab', policy: triage.id, tag: 'muddy-thistle', title: 'Triage', ...triageOffer, actions: [{ verb: 'accept', call: accept }] },
  ])
  assert.deepEqual(worker.x?.policies, { run: { policy: digest.id, tag: 'warm-lily', title: 'Digest', n: 1, check: CHECKED, start: 'auto', slot: digest.slot } })
  assert.deepEqual(
    (board.adds['floor:lab']?.slots ?? []).filter((s) => s.cap === 'policies').map((s) => s.key),
    ['digest.md', 'nightly.md', 'sweep.md', 'triage.md'],
    'every valid policy the tower runs has its slots fired by the core',
  )
  const asks = board.asks.filter((a) => a.cap === 'policies')
  assert.match(asks[0]?.hint ?? '', /^.+ offered, open until .+$/, 'the open offer says its slot and until when on hover')
  assert.deepEqual(
    asks.map(({ hint, ...a }) => a),
    [{ key: `policies:${triage.id}@${triage.slot}`, subject: `item.policies:lab/${triage.id}`, title: 'Triage', since: OFFERED_AT, until: triage.slot + DAY, sound: 'offer', opens: { view: 'policies/policies', subject: 'floor:lab' }, cap: 'policies', actions: [{ verb: 'policies/run', call: accept[1], words: { label: 'Accept', hint: 'start the run this slot offers' }, cap: 'policies' }] }],
    'the open offer is an ask that rings as an offer, until the next slot',
  )
  const standings = Object.fromEntries(part.policies.map((p) => [p.id, standing(p, now)]))
  assert.deepEqual(standings, {
    [broken.id]: { t: 'invalid' },
    [digest.id]: { t: 'waits', next: digest.slot + DAY, step: 'check' },
    'nightly.md': standings['nightly.md'],
    [sweep.id]: { t: 'waits', next: sweep.slot, step: 'run' },
    [triage.id]: { t: 'offered', slot: triage.slot, until: triage.slot + DAY },
  })
  assert.deepEqual(decide(part, new Map(), now), [], 'the slot that ran is not run again, and the offered one is not offered again')

  const runs = JSON.parse((await get(`/policies/runs/lab?policy=${digest.id}`)).body)
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
  const asWorker = { headers: callerHeaders(SESSION) }
  const listed: string[] = JSON.parse((await request('/policies/list/lab', asWorker)).body).lines
  const policyLines = (tag: string) => {
    const at = listed.findIndex((l) => l.startsWith(`${tag} `))
    assert.ok(at >= 0, listed.join('\n'))
    return listed.slice(at, at + 3).join('\n')
  }
  assert.match(policyLines('fleet-jaguar'), /^fleet-jaguar +Broken +invalid · guards: unknown key .*\(it used to run on its own\)/)
  const digestLines = policyLines('warm-lily')
  for (const words of [rule(digest.slot), `auto · approved ${sha(digest.text).slice(7, 15)} by ${worker.callsign}`, `last: run 1, ${day(digest.slot)}, ${worker.callsign} exited`, `now: ${day(digest.slot + DAY)} will check for work, then start on its own`])
    assert.ok(digestLines.includes(words), digestLines)
  const sweepLines = policyLines('slow-basil')
  for (const words of [`auto · approved ${sha(sweep.text).slice(7, 15)} by the user`, `now: ${day(sweep.slot)} will start on its own`]) assert.ok(sweepLines.includes(words), sweepLines)
  const triageLines = policyLines('muddy-thistle')
  for (const words of ['ask · live 0/2', `now: ${day(triage.slot)} is offered, until ${day(triage.slot + DAY)}`]) assert.ok(triageLines.includes(words), triageLines)
  const ran: string[] = JSON.parse((await request('/policies/run-lines/lab', asWorker)).body).lines
  assert.ok(ran[0]!.startsWith(`Digest (warm-lily) · ${rule(digest.slot)} · runs 1 to 1 of 1`), ran.join('\n'))
  assert.deepEqual(ran[1]!.trim().split(/ {2,}/), ['run 1', day(digest.slot), 'auto', worker.callsign, 'exited'])
  assert.ok(ran.includes('        its check found: two to do'), ran.join('\n'))
  const whoami = cli(SESSION, 'whoami').split('\n')
  const at = whoami.findIndex((l) => l.startsWith('You are run'))
  assert.equal(whoami[at], `You are run 1 of policy "Digest" (warm-lily), for its slot ${day(digest.slot)}, started on its own.`)
  assert.equal(whoami[at + 2], 'Its check found: two to do')
  const approved = await post('policies/approve-now', { project: 'lab', policy: 'muddy-thistle' }, callerHeaders(SESSION))
  assert.match(JSON.parse(approved.body).said, new RegExp(`^Approved "Triage" \\(muddy-thistle\\) at ${sha(triage.text).slice(7, 15)}: .*\`start: "ask"\``))
  const guided = whoami.indexOf('Extensions you can use (`tower x <name>` says when and how):')
  assert.ok(guided > 0, whoami.join('\n'))
  assert.ok(whoami.slice(guided + 1).includes('  tabline  ·  Set a short line under your card saying what you are on, when that changes.'), whoami.join('\n'))
})

/** `actual` with only the keys `expected` holds, at every depth, so fields an API minor adds leave the assertion as it was. */
const narrowedTo = (actual: unknown, expected: unknown): unknown => {
  if (Array.isArray(expected) && Array.isArray(actual)) return actual.map((a, i) => narrowedTo(a, expected[i]))
  if (isObject(expected) && isObject(actual)) return Object.fromEntries(Object.keys(expected).map((k) => [k, narrowedTo(actual[k], expected[k])]))
  return actual
}

test('server: an extension the config adds is started as x:<cap>, after the core and what it requires, and shown on the board and at GET /extensions', async () => {
  const msg = (await firstEvent('/board')) as BoardMsg
  assert.ok('board' in msg)
  const pulse = msg.board.extensions.find((e) => e.id === 'pulse')
  const expected = {
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
      { name: 'pulse/peek', scope: 'system' },
    ],
    reads: [
      { path: 'page/<project>/<file...>', scope: 'project', description: 'A page of its own, below its pages folder.' },
      { path: 'beats/<project>', scope: 'project', description: 'How often it beats on the floor, and the word it beats with.' },
      { path: 'kept/<project>', scope: 'project', description: "What it keeps on the floor as the tower folds it: its beats stream reduced, its items parsed, and a session's beat facts." },
    ],
    facts: [{ name: 'beat', description: 'A beat a session took.' }],
    commands: [{ name: 'listen', module: 'pulse.js', export: 'listen', words: { label: 'Listen', hint: 'reads the beat aloud' }, on: ['item.pulse'] }],
    slots: [{ name: 'hour', scope: 'system', when: { every: '1h' } }],
    subjects: [],
    views: [],
    regions: [],
    settings: { every: 3_600_000 },
  }
  assert.deepEqual(narrowedTo(pulse, expected), expected)
  const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
  const exempted = (id: string) => (id === 'reviews' ? [{ session: DESK_SESSIONS.reviewer, callsign: REVIEWER, from: 'hiring' }] : [])
  assert.deepEqual(read.extensions.map(({ words: _, ...e }) => e), msg.board.extensions.map((e) => ({ ...e, exempted: exempted(e.id) })), "the desk's reviewer is exempted by reviews")
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

/**
 * What `read` answers once `holds` is true of it, read again every 50 ms: the tower folds a write once it settles. One
 * that never holds within 40 reads fails with its last value.
 */
async function settled<T>(read: () => Promise<T>, holds: (value: T) => boolean): Promise<T> {
  for (let tries = 0; ; tries++) {
    const value = await read()
    if (holds(value)) return value
    if (tries === 40) assert.fail(`never held within ${tries + 1} reads, the last: ${inspect(value, { depth: 4 })}`)
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
  assert.deepEqual(callsOf(lab).tidy, ['tidy', { project: 'lab', plan: { ...lab.tidy, x: { pulse: ['echo'] } } }], "the floor's Tidy carries the extensions' entries")
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

test("server: a writable fact's door logs the value for the writers its manifest names, and the projected fold puts the newest on the card", async () => {
  const linesOn = async (holds: (lines: string[]) => boolean) =>
    settled(
      async () => {
        const msg = (await firstEvent('/board')) as BoardMsg
        assert.ok('board' in msg)
        return (msg.board.adds[`card:${SESSION}`]?.lines ?? []).filter((l) => l.cap === 'tabline').map((l) => l.text)
      },
      holds,
    )
  const byUser = await post('tabline/facts/line', { session: SESSION, value: 'the user named it' })
  assert.equal(byUser.status, 200, byUser.body)
  assert.deepEqual(JSON.parse(byUser.body), { session: SESSION, value: 'the user named it' })
  assert.deepEqual(await linesOn((l) => l.length > 0), ['the user named it'])
  const asWorker = { 'tower-session': SESSION, 'tower-client': 'cli' }
  const bySelf = await post('tabline/facts/line', { value: 'writing the migration' }, asWorker)
  assert.deepEqual(JSON.parse(bySelf.body), { session: SESSION, value: 'writing the migration' })
  assert.deepEqual(await linesOn((l) => l[0] === 'writing the migration'), ['writing the migration'])
  assert.equal(errorCode(await post('tabline/facts/line', { session: LAB_AUTHOR, value: 'not mine' }, asWorker)), 'refused')
  assert.equal(errorCode(await post('tabline/facts/line', { value: 'whose?' })), 'invalid')
  assert.equal(errorCode(await post('tabline/facts/line', { session: SESSION, value: 'x'.repeat(81) })), 'invalid')
  assert.equal(errorCode(await post('tabline/facts/line', { session: SESSION, value: 'a', extra: true })), 'invalid')
  assert.equal(errorCode(await post('tabline/facts/line', { session: 'nobody', value: 'a' })), 'not_found')
  assert.equal(errorCode(await post('tabline/facts/nothing', { session: SESSION, value: 'a' })), 'not_found')
  assert.equal(errorCode(await post('pulse/facts/beat', { session: SESSION, value: 2 })), 'not_found', 'a fact its manifest makes no door for')
  const cleared = await post('tabline/facts/line', { session: SESSION, value: null })
  assert.deepEqual(JSON.parse(cleared.body), { session: SESSION, value: null })
  assert.deepEqual(await linesOn((l) => l.length === 0), [])
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

test("server: an extension's ctx.read of a core read answers as over HTTP: a text file's text as written", async () => {
  const peek = async (read: string, params: Record<string, string>) => {
    const answered = await post('pulse/peek', { read, params })
    assert.equal(answered.status, 200, answered.body)
    return (JSON.parse(answered.body) as { answer: unknown }).answer
  }
  assert.equal(await peek('tower/shelf/<project>/<n>/<file>', { project: 'lab', n: '0', file: 'report/index.html' }), readFileSync(SHOWN, 'utf8'), 'an html shelf file, unframed')
  assert.equal((await peek('tower/shelf/<project>/<n>/<file>', { project: 'lab', n: '0', file: 'report/chart.png' }) as { code: string }).code, 'invalid', 'a file that is no text, whose bytes are left to HTTP')
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
  assert.deepEqual(schema.reads['pulse/page/<project>/<file...>'].path, '/pulse/page/{project}/{file...}')
})

test("server: an extension's read that serves a file serves the path its handler answers, sandboxed as a shown file, and its refusal as an error", async () => {
  const page = await get('/pulse/page/lab/beat.html')
  assert.equal(page.status, 200, page.body)
  assert.deepEqual([page.headers['content-type'], String(page.headers['content-security-policy']).startsWith('sandbox')], ['text/html; charset=utf-8', true])
  assert.ok(page.body.startsWith('<!doctype html>\n<p>beat</p>') && page.body.includes('/frame-keys.js'), 'an html page carries the frame keys, after its doctype')
  assert.equal(errorCode(await get('/pulse/page/lab/..%2Fserver.ts')), 'refused')
  assert.equal(errorCode(await get('/pulse/page/lab/gone.html')), 'not_found')
  assert.equal(errorCode(await get('/pulse/page/lab')), 'not_found', 'a rest param takes one segment at least')
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
const NO_TIDY = { worktrees: [], branches: [], prune: [], logs: [], streams: [] }
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
  const tidyKeys = (b: Board, project: string) => (b.adds[`floor:${project}`]?.tidy ?? []).map((e) => e.key)
  await boardWhere((b) => tidyKeys(b, 'lab').includes('landed'))
  const tidied = await command('tidy', { project: 'lab', plan: { ...NO_TIDY, x: { reviews: ['landed'] } } })
  assert.deepEqual(tidied.x, { reviews: { done: ['landed'], skipped: [] } })
  const filed = readdirSync(threadsIn('lab')).filter((id) => id.startsWith('landed@'))
  assert.equal(filed.length, 1)
  assert.match(filed[0], /^landed@\d{4}-\d\d-\d\d-\d{4}\.md$/)
  assert.equal(readFileSync(path.join(threadsIn('lab'), filed[0]), 'utf8'), threadText('landed'))
  assert.ok(!existsSync(path.join(threadsIn('lab'), 'landed.md')))
  await boardWhere((b) => !tidyKeys(b, 'lab').includes('landed'))
})

test("reviews: a discard notes each repo's branch and tip on the checkout's thread, then files the thread", async () => {
  const { tree, held } = cutWithWork(HUB, 'lost')
  const discarded = await command('worktree/discard', { project: 'lab', name: 'lost', author: 'NEMO-92', held })
  assert.ok(!existsSync(tree))
  const filedId = (discarded.done!.reviews as { item: { id: string } }).item.id
  assert.match(filedId, /^lost@\d{4}-\d\d-\d\d-\d{4}\.md$/)
  assert.ok(!existsSync(path.join(threadsIn('lab'), 'lost.md')))
  const [{ tip }] = discarded.tips
  const unpushed = gitIn(HUB, 'log', '--format=%h %s', held[0].head, '--not', '--remotes').trim().split('\n')
  const thread = parseThread(readFileSync(path.join(threadsIn('lab'), filedId), 'utf8'))
  assert.deepEqual(
    thread.messages.map(({ author, n }) => ({ author, n })),
    [{ author: 'NEMO-92', n: 1 }],
  )
  const [first, ...lines] = thread.messages[0]!.body.trim().split('\n')
  assert.match(first!, /^Discarded the worktree lost: .*`git branch <name> <tip>`/)
  assert.deepEqual(lines, ['', `- \`${HUB}\`: branch \`tower/lost\`, tip \`${tip}\` (1 uncommitted file committed on top of \`${held[0].head}\`)`, ...unpushed.map((c) => `  - ${c}`)])
})

test("reviews: a landed thread is the reviews extension's tidy entry, belonging to its checkout, in Tidy's words, and its key under plan.x files it", async () => {
  writeFileSync(path.join(threadsIn('lab'), 'shipped.md'), threadText('shipped'))
  const board = await boardWhere((b) => (b.adds['floor:lab']?.tidy ?? []).some((e) => e.key === 'shipped'))
  assert.deepEqual(board.adds['floor:lab'].tidy!.find((e) => e.key === 'shipped'), {
    key: 'shipped',
    checkout: 'shipped',
    label: '◇ shipped',
    does: 'file landed thread',
    hint: 'its work has landed: filed as shipped@<time>.md',
    kind: { one: 'landed thread', many: 'landed threads' },
    cap: 'reviews',
  })
  const tidied = await command('tidy', { project: 'lab', plan: { ...NO_TIDY, x: { reviews: ['shipped'] } } })
  assert.deepEqual(tidied.x, { reviews: { done: ['shipped'], skipped: [] } })
  assert.equal(readdirSync(threadsIn('lab')).filter((id) => id.startsWith('shipped@')).length, 1)
})

test('reviews: a resolution is a note marking earlier notes resolved, read as a plain note by the thread format, and resolved notes leave what is unseen', async () => {
  const note = async (author: string, body: string) => assert.equal((await post('reviews/append', { project: 'lab', checkout: 'resolving', author, body })).status, 200)
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
  const said = JSON.parse((await post('reviews/resolve', { project: 'lab', on: 'resolving', resolves: ['n3'] }, callerHeaders(SESSION))).body).said
  assert.match(said, /^Resolved n3 with n5 on the thread of checkout resolving: /)
  assert.deepEqual(parseThread(readFileSync(path.join(threadsIn('lab'), 'resolving.md'), 'utf8')).messages.at(-1)!.body, '**Resolved:** n3')
})

test('reviews: on a floor keeping no threads, Tidy lists and files no thread, and a discard, which nothing there records, is refused and touches nothing', async () => {
  mkdirSync(threadsIn('bare'), { recursive: true })
  writeFileSync(path.join(threadsIn('bare'), 'landed.md'), threadText('landed'))
  const board = await boardWhere((b) => floorOf(b, 'bare').worktrees !== undefined)
  assert.deepEqual(board.adds['floor:bare']?.tidy ?? [], [])
  assert.equal(errorCode(await post('tidy', { project: 'bare', plan: { ...NO_TIDY, x: { reviews: ['landed'] } } })), 'refused')
  const { tree, held } = cutWithWork(BARE, 'thrown')
  const atRisk = await boardWhere((b) => floorOf(b, 'bare').worktrees.some((w) => w.name === 'thrown' && w.state === 'at-risk'))
  assert.deepEqual(verbsOf(floorOf(atRisk, 'bare').worktrees.find((w) => w.name === 'thrown')!), [], 'nothing records a discard there, so none is offered')
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

  assert.equal((await get('/collection/lab/roles.notes/note.md')).body, '# A note\n', 'a collection named <provides>.<name> reads its items')

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

test("server: a launch contributor sees a worker's hire as one, its hirer as by, and the user's spawn as none; tower hire's x.<cap>.<field> reaches the contributor's fields", async () => {
  const server = readFileSync(path.join(ROLES, 'server.ts'), 'utf8')
  const swap = (text: string, from: string, to: string) => {
    assert.ok(text.includes(from), `the roles fixture no longer holds: ${from}`)
    return text.replace(from, to)
  }
  writeFileSync(
    path.join(ROLES, 'server.ts'),
    swap(
      swap(server, 'launch: async ({ project, fields, facts }', 'launch: async ({ project, fields, facts, hire, by }'),
      "return role ? { systemPrompt: [await collections.read(project, 'roles', role)] } : {}",
      "return { systemPrompt: [`hire ${hire} by ${by}`, ...(role ? [await collections.read(project, 'roles', role)] : [])] }",
    ),
  )
  assert.deepEqual(await command('extension/restart', { id: 'roles' }), { t: 'restarted', state: 'started' })
  const brief = (id: string) => {
    const header = JSON.parse(readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8').split('\n')[0]) as { argv: string[] }
    return header.argv[header.argv.indexOf('--append-system-prompt') + 1]
  }
  const deskRoles = path.join(ROOT, 'collections', 'desk', 'roles')
  mkdirSync(deskRoles, { recursive: true })
  writeFileSync(path.join(deskRoles, 'builder.md'), BUILDER)
  try {
    const own = await command('spawn', { project: 'desk' })
    assert.ok(brief(own.id).endsWith('\n\nhire false by undefined'), brief(own.id).slice(-200))

    const hired = onStdin('Build it.', (fd) => towerWith(fd, SESSION, ['hire', 'floor', 'desk', 'x.roles.role', 'builder.md']))
    assert.equal(hired.status, 0, hired.stderr)
    const id = /, session (\S+), on /.exec(hired.stdout)![1]
    assert.ok(brief(id).endsWith(`\n\nhire true by ${SESSION}\n\n${BUILDER}`), brief(id).slice(-200))
    const [, first] = readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(first.slice(1), ['h', { hook_event_name: 'tower.x.roles.role', value: 'builder.md' }])
  } finally {
    writeFileSync(path.join(ROLES, 'server.ts'), server)
    rmSync(deskRoles, { recursive: true })
    await command('extension/restart', { id: 'roles' })
  }
})

test("server: a launch contributor's fields fill the spawn fields it left unset, logged as the spawn's are; a field the spawn set keeps its value, and one the extension doesn't declare refuses a spawn carrying its fields and is dropped from one carrying none", async () => {
  const server = readFileSync(path.join(ROLES, 'server.ts'), 'utf8')
  const from = "return role ? { systemPrompt: [await collections.read(project, 'roles', role)] } : {}"
  assert.ok(server.includes(from), `the roles fixture no longer holds: ${from}`)
  const returning = async (fields: string) => {
    writeFileSync(path.join(ROLES, 'server.ts'), server.replace(from, `return { fields: ${fields}, ...(role ? { systemPrompt: [await collections.read(project, 'roles', role)] } : {}) }`))
    assert.deepEqual(await command('extension/restart', { id: 'roles' }), { t: 'restarted', state: 'started' })
  }
  const roleFacts = (id: string) =>
    readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((e) => e[1] === 'h' && e[2].hook_event_name === 'tower.x.roles.role').map((e) => e[2].value)
  try {
    await returning("{ role: 'filled.md' }")
    const filled = await command('spawn', { project: 'lab' })
    assert.deepEqual(roleFacts(filled.id), ['filled.md'])
    const set = await command('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } } })
    assert.deepEqual(roleFacts(set.id), ['builder.md'])

    await returning('{ role: 42 }')
    const unread = await command('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } } })
    assert.deepEqual(roleFacts(unread.id), ['builder.md'], "a value for a field the spawn set is left unread, off its schema or not")

    await returning("{ mood: 'calm' }")
    const undeclared = await post('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } } })
    assert.equal(errorCode(undeclared), 'internal')
    assert.match(JSON.parse(undeclared.body).message, /^roles's launch contributor returned a part claude can't place: x\.roles\.mood: roles declares no spawn field mood/)
    const dropped = await command('spawn', { project: 'lab' })
    assert.deepEqual(roleFacts(dropped.id), [], 'a spawn carrying none of its fields starts without the parts')
    const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
    const problems = read.extensions.find((e) => e.id === 'roles')!.problems.filter((p) => p.lane === 'launch')
    assert.ok(problems.some((p) => p.code === 'shape' && p.message.includes('x.roles.mood: roles declares no spawn field mood')), JSON.stringify(problems))
  } finally {
    writeFileSync(path.join(ROLES, 'server.ts'), server)
    await command('extension/restart', { id: 'roles' })
  }
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

const CONFIG = path.join(ROOT, 'config.json')
const configNow = () => JSON.parse(readFileSync(CONFIG, 'utf8'))
/** An edit of the config file as the user makes one by hand. */
const handEdit = (change: (config: Record<string, any>) => void) => {
  const config = configNow()
  change(config)
  writeFileSync(CONFIG, JSON.stringify(config))
}

test('server: a config short of what every read stands on, not JSON, gone or unreadable is a config error on the board naming what is wrong, and the tower stays up', async () => {
  const good = readFileSync(CONFIG, 'utf8')
  const said = (words: string) =>
    settled(
      async () => (firstEvent('/board') as Promise<BoardMsg>),
      (msg) => 'error' in msg && msg.error.code === 'config' && msg.error.message.includes(words),
    )
  try {
    writeFileSync(CONFIG, JSON.stringify({ argv: ['x'], projects: { lab: { name: 'lab' } } }))
    await said(`${CONFIG}: projects.lab.hub must be the path of a directory`)
    writeFileSync(CONFIG, '{ not json')
    await said(`${CONFIG} is not valid JSON`)
    rmSync(CONFIG)
    await said(`${CONFIG} is gone`)
    mkdirSync(CONFIG)
    await said(`${CONFIG} can't be read`)
  } finally {
    rmSync(CONFIG, { recursive: true, force: true })
    writeFileSync(CONFIG, good)
  }
  await boardWhere((b) => b.floors.length > 0)
  assert.equal(tower.exitCode, null)
})

/**
 * The first board that `holds` on one stream held open, once `act` has run, or a failure `ms` after it ran. `act` runs
 * once the stream has been quiet for a second: the boards an opening stream brings (it starts reading the machine) are
 * past, so a board that comes after `act` was published for what it did.
 */
const boardAfter = (act: () => Promise<unknown>, holds: (board: Board) => boolean, ms: number): Promise<void> =>
  new Promise((resolve, reject) => {
    let quiet: NodeJS.Timeout | undefined
    let deadline: NodeJS.Timeout | undefined
    let acted = false
    const done = (err?: Error) => (clearTimeout(quiet), clearTimeout(deadline), req.destroy(), err ? reject(err) : resolve())
    const actWhenQuiet = () => {
      clearTimeout(quiet)
      quiet = setTimeout(() => {
        acted = true
        deadline = setTimeout(() => done(new Error(`no board held it within ${ms} ms`)), ms)
        act().catch(done)
      }, 1000)
    }
    const req = http.get(`${base}/board`, { agent: false }, (res) => {
      let text = ''
      res.setEncoding('utf8').on('data', (chunk) => {
        text += chunk
        for (let end = text.indexOf('\n\n'); end >= 0; end = text.indexOf('\n\n')) {
          const event = JSON.parse(text.slice(0, end).replace(/^data: /, '')) as BoardMsg
          text = text.slice(end + 2)
          if (!acted) actWhenQuiet()
          else if ('board' in event && holds(event.board)) done()
        }
      })
    })
    req.on('error', done)
  })

test('server: a session whose floor no longer names its checkout is not_found on /changes', async () => {
  const hub = configNow().projects.lab.hub
  handEdit((c) => (c.projects.lab.hub = path.join(ROOT, 'moved')))
  try {
    assert.equal(errorCode(await get(`/changes/${SESSION}`)), 'not_found')
  } finally {
    handEdit((c) => (c.projects.lab.hub = hub))
  }
})

test('server: GET /config is the config file as it holds it, parsed', async () => {
  assert.deepEqual(JSON.parse((await get('/config')).body), configNow())
})

test('server: config/set applies while its key still holds was, a hand edit elsewhere aside, and is refused as changed after one at its key; append answers unchanged for a value the array holds', async () => {
  const name = ['projects', 'bare', 'name']
  handEdit((c) => (c.projects.bare.name = 'bare by hand'))
  const stale = await post('config/set', { key: name, value: 'Bare', was: 'bare' })
  assert.equal(errorCode(stale), 'changed', stale.body)
  assert.equal(configNow().projects.bare.name, 'bare by hand')
  handEdit((c) => ((c.projects.bare.name = 'bare'), (c.retention.days = 2)))
  assert.deepEqual(await command('config/set', { key: name, value: 'Bare', was: 'bare' }), { t: 'set', key: 'projects.bare.name' })
  assert.equal(configNow().projects.bare.name, 'Bare')
  assert.equal(configNow().retention.days, 2)
  const report = configNow().projects.lab.shelf[0]
  assert.deepEqual(await command('config/append', { key: ['projects', 'lab', 'shelf'], value: report }), { t: 'unchanged', key: 'projects.lab.shelf' })
  await command('config/set', { key: name, value: 'bare', was: 'Bare' })
  handEdit((c) => (c.retention.days = 1))
})

test("server: a floor config/add adds is on the board at once, though the config is a link into a folder the tower doesn't watch", async () => {
  const target = path.join(ROOT, 'dotfiles', 'config.json')
  const hub = path.join(ROOT, 'added')
  mkdirSync(path.dirname(target), { recursive: true })
  mkdirSync(hub, { recursive: true })
  renameSync(CONFIG, target)
  symlinkSync(target, CONFIG)
  const floor = { name: 'added', hub, repos: [] }
  const onBoard = (board: Board) => board.floors.some((f) => f.id === 'added')
  try {
    await boardAfter(() => command('config/add', { key: ['projects', 'added'], value: floor }), onBoard, 2000)
    assert.ok(lstatSync(CONFIG).isSymbolicLink())
    await boardAfter(() => command('config/remove', { key: ['projects', 'added'], was: floor }), (board) => !onBoard(board), 2000)
  } finally {
    rmSync(CONFIG)
    renameSync(target, CONFIG)
  }
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

test("server: a name in the config's hosts reaches the tower, and its POSTs carry its own Origin", async () => {
  const named = `lab.localhost:${new URL(base).port}`
  const draft = JSON.stringify({ project: 'lab', collection: 'drafts', ext: 'md', content: '' })
  const json = { 'content-type': 'application/json', host: named }
  assert.equal((await request('/schema', { headers: { host: named } })).status, 200)
  assert.equal((await request('/schema', { headers: { host: 'lab.localhost' } })).status, 200, 'a proxy at the default port sends the bare name')
  assert.equal((await request('/schema', { headers: { host: `other.localhost:${new URL(base).port}` } })).status, 403)
  assert.equal((await request('/collection/create', { method: 'POST', headers: { ...json, origin: base } }, draft)).status, 403)
  const created = await request('/collection/create', { method: 'POST', headers: { ...json, origin: `http://${named}` } }, draft)
  assert.equal(created.status, 200)
  await post('collection/delete', { project: 'lab', collection: 'drafts', id: JSON.parse(created.body).id })
})

/** Only the length is sent: the tower refuses on it and closes, and a body sent after would race that close. */
test('server: a body declared past 28 MB is refused as invalid', async () => {
  const reply = await request('/collection/create', { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'content-length': 28_000_001 } })
  assert.equal(reply.status, 400)
  assert.equal(errorCode(reply), 'invalid')
})

test('server: no hidden file is served below a shown page or a renderer', async () => {
  assert.equal(errorCode(await get(`/shown/${SESSION}${path.join(HUB, 'report', '.secret')}`)), 'not_found')
  assert.equal(errorCode(await get('/r/plain/.secret')), 'not_found')
})


test('server: review threads written before the reviews extension read the same: landed, filed, unseen, history and tower x reviews thread', async () => {
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
  const note = (checkout: string) => ['reviews/append', { project: 'desk', checkout }]
  assert.deepEqual((board.adds['floor:desk']?.tidy ?? []).filter((e) => e.cap === 'reviews').map((e) => e.key), ['kite-2', 'main'], 'Tidy files the threads whose work landed')
  const kept = desk.collections.find((c) => c.id === 'reviews')!
  assert.deepEqual([kept.label, kept.description, kept.items.map((i) => i.id)], ['Reviews', 'One review thread per checkout.', ['kite-2.md', FILED_ID, 'main.md', 'odin-1.md']], "the config's line names the collection")

  const filed = { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT }
  const cardOf = (id: string) => {
    const c = desk.cards.find((c) => c.id === id)!
    const part = c.x?.reviews as { of?: string; threadState?: unknown; unseen?: number; note?: unknown }
    return { of: part.of, checkoutState: c.checkoutState, threadState: part.threadState, unseen: part.unseen, note: part.note }
  }
  assert.deepEqual(cardOf(DESK_SESSIONS.author), { of: undefined, checkoutState: { is: 'live' }, threadState: { is: 'live' }, unseen: 2, note: note('odin-1') })
  assert.deepEqual(cardOf(DESK_SESSIONS.reviewer), { of: AUTHOR, checkoutState: { is: 'live' }, threadState: { is: 'live' }, unseen: 1, note: note('odin-1') }, "a reviewer's thread is its author's")
  assert.deepEqual(cardOf(DESK_SESSIONS.lark), { of: undefined, checkoutState: { is: 'landed', on: 'main', empty: true }, threadState: { is: 'landed', on: 'main', empty: true, filed }, unseen: undefined, note: undefined }, 'its work landed, its thread filed after it started')

  const message = (author: string, at: number, n: number, body: string, more: object = {}) => ({ author, at: localStamp(at), n, anchors: [], body, ...more })
  assert.deepEqual(JSON.parse((await get('/reviews/history/desk')).body), {
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
  const authorRead = cli(DESK_SESSIONS.author, 'x', 'reviews', 'thread')
  assert.ok(authorRead.startsWith(`${DESK_THREADS['odin-1.md']}\n`), authorRead)
  assert.ok(authorRead.includes(`(${threads}/odin-1.md) New to you since your last note: n3, n4.\n`), authorRead)
  const threadSaid = async (session: string, query: string) => JSON.parse((await request(`/reviews/thread/desk${query}`, { headers: callerHeaders(session) })).body).said as string
  assert.ok((await threadSaid(DESK_SESSIONS.reviewer, '')).includes(`(${threads}/odin-1.md) New to you since your last note: n4.\n`))
  assert.ok((await threadSaid(DESK_SESSIONS.lark, '?checkout=kite-2')).includes(`(${threads}/kite-2.md) New to you since your last note: n1.\n`), "a worker that never wrote on a thread has seen none of it")
})

test("server: the reviews extension holds the threads under its own names, and owns their collection", async () => {
  const board = await settled(
    async () => {
      const msg = (await firstEvent('/board')) as BoardMsg
      assert.ok('board' in msg)
      return msg.board
    },
    (b) => b.floors.find((f) => f.id === 'desk')!.worktrees.length === 3,
  )
  const desk = board.floors.find((f) => f.id === 'desk')!
  const part = desk.x?.reviews as { threads: { key: string; checkout: string; actions: { verb: string; call: unknown }[] }[] }
  assert.deepEqual(part.threads.map((t) => [t.key, callsOf(t).note]), [
    ['desk/kite-2', undefined],
    ['desk/main', ['reviews/append', { project: 'desk', checkout: 'main' }]],
    ['desk/odin-1', ['reviews/append', { project: 'desk', checkout: 'odin-1' }]],
  ])
  const cardPart = (id: string) => desk.cards.find((c) => c.id === id)!.x?.reviews
  assert.deepEqual(cardPart(DESK_SESSIONS.reviewer), { thread: 'odin-1', threadState: { is: 'live' }, unseen: 1, of: AUTHOR, note: ['reviews/append', { project: 'desk', checkout: 'odin-1' }] })
  assert.deepEqual(cardPart(DESK_SESSIONS.lark), { thread: 'lark-3', threadState: { is: 'landed', on: 'main', empty: true, filed: { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT } }, filed: { id: FILED_ID, tag: tagOf(FILED_ID), at: FILED_AT } })
  assert.deepEqual(desk.main, { dirty: 0, ahead: 0, changed: 0, inUse: false })

  const refused = await post('collection/create', { project: 'desk', collection: 'reviews', name: 'by hand', ext: 'md', content: '# x' })
  assert.deepEqual([errorCode(refused), JSON.parse(refused.body).message], ['refused', 'reviews owns reviews: use reviews/append'])
  const said = JSON.parse((await get(`/reviews/said/desk?checkout=odin-1&reader=${AUTHOR}&sender=Ana`)).body)
  assert.deepEqual([said.unseen, said.send], [[3, 4], `Review notes from Ana (n3, n4) on checkout odin-1: read the thread with \`tower x reviews thread odin-1\`, act on them, and answer each with \`tower x reviews note --on odin-1 --re <k>\` (the reply on stdin).`])
})

test("server: an archived card carries the extensions' parts and the old fields LEGACY copies, as the board's cards do", async () => {
  const archived = (await settled(
    async () => JSON.parse((await get('/archive/desk')).body) as Card[],
    (cards) => cards.some((c) => c.id === DESK_SESSIONS.past && c.x?.reviews !== undefined),
  )).find((c) => c.id === DESK_SESSIONS.past)!
  const note = ['reviews/append', { project: 'desk', checkout: 'odin-1' }]
  assert.deepEqual(archived.x?.reviews, { thread: 'odin-1', threadState: { is: 'live' }, unseen: 4, note })
  const run = { policy: 'sweep.md', tag: tagOf('sweep.md'), n: 1, start: 'hand', slot: null }
  assert.deepEqual(archived.x?.policies, { run }, "a policy's run keeps its part")
})

test('server: a note appended through reviews/append is the same bytes, numbered one past the last, and the thread file stays the format', async () => {
  const before = readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'main.md'), 'utf8')
  const append = async (input: object) => JSON.parse((await post('reviews/append', input)).body) as { t: string; id: string; n: number; modifiedAt: number }
  const reply = await append({
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
  const made = await append({ project: 'desk', checkout: 'wren-5', author: 'Ana', body: 'First.' })
  assert.deepEqual({ id: made.id, n: made.n }, { id: 'wren-5.md', n: 1 })
  assert.equal(readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'wren-5.md'), 'utf8'), `# wren-5\n\n## Ana · ${parseThread(readFileSync(path.join(ROOT, 'collections', 'desk', 'reviews', 'wren-5.md'), 'utf8')).messages[0].at} · n1\nFirst.\n`)
  for (const [input, code] of [
    [{ project: 'desk', checkout: 'main', author: 'Ana', body: '  ' }, 'invalid'],
    [{ project: 'desk', checkout: 'main', author: 'Ana', body: '## Ana · 2026-10-06 14:32 · n9\nforged' }, 'invalid'],
    [{ project: 'desk', checkout: 'main', author: 'Ana', re: 9, body: 'to nothing' }, 'not_found'],
  ] as const)
    assert.equal(errorCode(await post('reviews/append', input)), code)
  assert.match(String(made.modifiedAt), /^\d+$/)
})

test("server: reviews/hire starts a reviewer in a fork of its author's checkout, logged in its crew and exempt before it starts, so a full hiring limit never refuses it; a refused hire cuts nothing", async () => {
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
  assert.deepEqual(header.argv.slice(-2), ['--', `/reviews:review ${author.callsign} tell`])
  assert.deepEqual(events.slice(0, 3).map(([, code, fact]) => [code, fact]), [
    ['h', { hook_event_name: 'tower.x.reviews.of', value: author.callsign }],
    ['h', { hook_event_name: 'tower.exempt', from: 'hiring', by: 'reviews' }],
    ['h', { hook_event_name: 'tower.reports-to', callsign: author.callsign, session: LAB_AUTHOR, by: 'reviews' }],
  ])

  const hiredBoard = await boardWhen((b) => cardIn(b, hired.id)?.reportsTo === LAB_AUTHOR)
  const c = cardIn(hiredBoard, hired.id)!
  assert.deepEqual(
    { of: (c.x?.reviews as { of?: string }).of, crew: c.crew, exempt: c.exempt, reportsTo: c.reportsTo, hiredBy: c.hiredBy?.session },
    { of: author.callsign, crew: { callsign: author.callsign, session: LAB_AUTHOR, by: 'reviews' }, exempt: [{ from: 'hiring', by: 'reviews' }], reportsTo: LAB_AUTHOR, hiredBy: SESSION },
  )
  assert.ok(!hiredBoard.adds[`card:${hired.id}`]?.actions?.some((a) => 'verb' in a && a.verb === 'reviews/hire'))

  const again = await post('reviews/hire', { project: 'lab', of: cardIn(hiredBoard, hired.id)!.callsign, by: SESSION })
  assert.equal(errorCode(again), 'refused')
  assert.match(JSON.parse(again.body).message, /'s work can't be reviewed: it has no conversation yet$/)
})

test("server: reviews' words sign with their calling worker, default to its thread, and say what they did", async () => {
  const asWorker = { 'tower-session': LAB_AUTHOR, 'tower-client': 'cli' }
  const said = async (verb: string, input: unknown) => {
    const reply = await post(verb, input, asWorker)
    assert.equal(reply.status, 200, reply.body)
    return (JSON.parse(reply.body) as { said: string; n: number })
  }
  const noted = await said('reviews/note', { project: 'lab', on: 'worded', body: 'From a word.' })
  assert.match(noted.said, new RegExp(`^Noted as n${noted.n} on the thread of checkout worded: `))
  assert.match((await said('reviews/note', { project: 'lab', on: 'worded', re: `n${noted.n}`, body: 'An answer.' })).said, new RegExp(`answering n${noted.n}`))
  assert.match((await said('reviews/resolve', { project: 'lab', on: 'worded', resolves: [`n${noted.n}`] })).said, new RegExp(`^Resolved n${noted.n} with n`))
  const plain = await said('reviews/note', { project: 'lab', on: 'worded', re: String(noted.n), body: 'Another.' })
  assert.match((await said('reviews/resolve', { project: 'lab', checkout: 'worded', notes: [plain.n] })).said, new RegExp(`^Resolved n${plain.n} with n`))
  assert.equal(errorCode(await post('reviews/resolve', { project: 'lab', on: 'worded' }, asWorker)), 'invalid')
  const thread = await request(`/reviews/thread/lab?checkout=worded`, { headers: asWorker })
  assert.equal(thread.status, 200, thread.body)
  assert.match((JSON.parse(thread.body) as { said: string }).said, /From a word\.[\s\S]*Nothing new to you since your last note\.[\s\S]*A note's anchors name/)
  assert.equal(errorCode(await post('reviews/note', { project: 'lab', on: 'worded', body: 'No worker.' })), 'refused')
  assert.equal(errorCode(await post('reviews/note', { project: 'lab', on: 'worded', at: ['nonsense'], body: 'x' }, asWorker)), 'invalid')
  assert.match((await post('reviews/note', { project: 'lab', on: 'worded' }, asWorker)).body, /needs its body on stdin/)
  assert.equal(errorCode(await post('reviews/send', { to: 'NOBODY-1' }, asWorker)), 'not_found')
  assert.equal(errorCode(await post('reviews/review', { of: 'NOBODY-1' }, asWorker)), 'not_found')
})

test("server: tower/spawn.gate is answered by the core's hiring limits first, then by its answerers on spawn and resume, the first refusal naming its gate; a failed answer is a problem and the worker starts; a hook nobody answers on a floor is the core's badge there", async () => {
  const badges = (b: Board, id: string) => (b.adds[`floor:${id}`]?.badges ?? []).filter((x) => x.cap === 'tower')
  const before = await boardWhere(() => true)
  assert.deepEqual(badges(before, 'bare'), [
    { label: 'Discards refused', hint: 'Nothing records what a discard would throw away.', cap: 'tower' },
    { label: 'Nothing filed', hint: 'No record or thread is filed once a worktree is discarded.', cap: 'tower' },
  ])
  assert.deepEqual([badges(before, 'lab'), badges(before, 'desk')], [[], []], 'the core answers the gate, and reviews the discard hooks')

  const manifest = readFileSync(path.join(TALLY, 'extension.json'), 'utf8')
  const server = readFileSync(path.join(TALLY, 'server.ts'), 'utf8')
  const gated = JSON.parse(manifest)
  writeFileSync(path.join(TALLY, 'extension.json'), JSON.stringify({ ...gated, requires: { ...gated.requires, tower: '2.0' }, answers: { ...gated.answers, 'tower/spawn.gate': {} } }))
  writeFileSync(
    path.join(TALLY, 'server.ts'),
    server.replace(
      'answers: {',
      `answers: {
    'tower/spawn.gate': ({ project, kind, fields }: { project: string; kind: string; fields: Record<string, Record<string, unknown>> }, ctx: { cards(): unknown[] }) => {
      if (kind === 'resume') return { code: 'refused', message: \`tally counts \${ctx.cards().length} cards and lets none resume\` }
      if (project === 'desk') throw new Error('no desks')
      return fields.roles?.role === 'builder.md' ? { code: 'refused', message: 'builders wait' } : { t: 'error', code: 'refused', message: 'not counted' }
    },`,
    ),
  )
  assert.deepEqual(await command('extension/restart', { id: 'tally' }), { t: 'restarted', state: 'started' })
  try {
    const refused = await post('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } } })
    assert.deepEqual(JSON.parse(refused.body), { t: 'error', code: 'refused', message: "builders wait (tally's gate)" })
    const limited = JSON.parse((await post('spawn', { project: 'lab', x: { roles: { role: 'builder.md' } }, by: SESSION, hire: true })).body)
    assert.equal(limited.code, 'limited', 'the core answers first')
    assert.match(limited.message, /lets a worker run 0 at once \(the limits are `hiring` in the tower's config\)$/)

    const resumed = JSON.parse((await post('resume', { id: LAB_AUTHOR, conversation: 'c-author' })).body)
    assert.equal(resumed.code, 'refused')
    assert.match(resumed.message, /^tally counts [1-9]\d* cards and lets none resume \(tally's gate\)$/)

    const onLab = await command('spawn', { project: 'lab' })
    assert.equal(onLab.t, 'spawned', "an ApiError is a failed answer, never a refusal")
    const onDesk = await command('spawn', { project: 'desk' })
    assert.equal(onDesk.t, 'spawned', 'a throw is a failed answer')
    const loads = (id: string) => (JSON.parse(readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8').split('\n')[0]) as { argv: string[] }).argv.includes(path.join(HANDOFF, 'plugin'))
    assert.deepEqual([loads(onLab.id), loads(onDesk.id)], [true, false], "an extension's plugin reaches sessions on floors where it is on")
    const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
    assert.deepEqual(read.answers['tower/spawn.gate'], ['tally'])
    const problems = read.extensions.find((e) => e.id === 'tally')!.problems.filter((p) => p.path === 'answers.tower/spawn.gate')
    assert.deepEqual(problems.map((p) => [p.lane, p.code, p.message]).sort(), [
      ['hook', 'hook', 'on a spawn on lab, not counted: the worker started'],
      ['hook', 'hook', 'threw: no desks'],
    ])
  } finally {
    writeFileSync(path.join(TALLY, 'extension.json'), manifest)
    writeFileSync(path.join(TALLY, 'server.ts'), server)
    await command('extension/restart', { id: 'tally' })
  }
})

/** A board stream held open as `viewer`, closed by the function it answers once the tower took it. */
const holdBoard = (viewer: string, renderer: string): Promise<() => void> =>
  new Promise((resolve, reject) => {
    const req = http.get(`${base}/board?viewer=${viewer}&renderer=${renderer}`, { agent: false }, (res) => {
      res.setEncoding('utf8').once('data', () => resolve(() => req.destroy()))
    })
    req.on('error', (err) => (req.destroyed ? undefined : reject(err)))
  })

test("server: the active viewer is the one the user acted on last among those whose board stream is open, and each renderer's its own, held in memory alone", async () => {
  const [mini, laptop, world] = ['viewer-mini-01', 'viewer-laptop-01', 'viewer-world-01']
  const closeMini = await holdBoard(mini, 'page')
  const closeLaptop = await holdBoard(laptop, 'page')
  const closeWorld = await holdBoard(world, 'tower3d')
  try {
    await command('viewer/active', { viewer: mini })
    await boardWhere((b) => b.viewers.active === mini)
    await command('viewer/active', { viewer: laptop })
    await boardWhere((b) => b.viewers.active === laptop)
    await command('viewer/active', { viewer: world })
    await boardWhere((b) => b.viewers.active === world && b.viewers.last?.page === laptop && b.viewers.last?.tower3d === world)
    closeLaptop()
    closeWorld()
    await boardWhere((b) => b.viewers.active === mini && b.viewers.last?.page === mini && b.viewers.last?.tower3d === undefined)
    assert.equal(errorCode(await post('viewer/active', { viewer: 'viewer-gone-01' })), 'not_found')
    assert.equal(errorCode(await post('viewer/active', { viewer: 'no' })), 'invalid')
    assert.equal(errorCode(await get('/board?viewer=no%20id')), 'invalid')
    assert.equal(errorCode(await get('/board?renderer=page')), 'invalid')
  } finally {
    closeMini()
  }
  await boardWhere((b) => b.viewers.active === undefined)
})

test("server: each viewer's selected worker is on the board while its board stream is open, none left out, held in memory alone", async () => {
  const [mini, laptop] = ['viewer-mini-02', 'viewer-laptop-02']
  const closeMini = await holdBoard(mini, 'page')
  const closeLaptop = await holdBoard(laptop, 'page')
  try {
    await command('viewer/selected', { viewer: mini, id: 'worker-a' })
    await command('viewer/selected', { viewer: laptop, id: 'worker-b' })
    await command('viewer/active', { viewer: laptop })
    await boardWhere((b) => b.viewers.last?.page === laptop && b.viewers.selected?.[mini] === 'worker-a' && b.viewers.selected?.[laptop] === 'worker-b')
    await command('viewer/selected', { viewer: laptop, id: null })
    await boardWhere((b) => b.viewers.selected !== undefined && !(laptop in b.viewers.selected) && b.viewers.selected[mini] === 'worker-a')
    closeMini()
    await boardWhere((b) => b.viewers.selected === undefined && b.viewers.last?.page === laptop)
    assert.equal(errorCode(await post('viewer/selected', { viewer: 'viewer-gone-02', id: 'worker-a' })), 'not_found')
    assert.equal(errorCode(await post('viewer/selected', { viewer: laptop, id: '' })), 'invalid')
    assert.equal(errorCode(await post('viewer/selected', { viewer: laptop })), 'invalid')
  } finally {
    closeMini()
    closeLaptop()
  }
  await boardWhere((b) => b.viewers.active === undefined && b.viewers.selected === undefined)
})

test('server: a prompt is refused where it would answer a question, and at-prompt refuses a busy worker or a composer holding text, before typing anything', async () => {
  const log = (id: string, events: unknown[]) => {
    const header = { id, project: 'bare', cwd: BARE, argv: ['claude'], startedAt: Date.now() - 60_000, cols: 80, rows: 24 }
    writeFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), [header, ...events].map((line) => JSON.stringify(line)).join('\n') + '\n')
  }
  const started = [0.1, 'h', { hook_event_name: 'SessionStart', source: 'startup', session_id: 'c-prompt' }]
  const sessions = { asking: '20261004-212000-a5c1', holding: '20261004-212100-b0d2', working: '20261004-212200-c3e4' }
  log(sessions.asking, [started, [0.2, 'h', { hook_event_name: 'UserPromptSubmit', session_id: 'c-prompt', prompt: 'Write it.' }], [0.3, 'h', { hook_event_name: 'PermissionRequest' }]])
  log(sessions.holding, [started, [0.2, 'i', 'half typed']])
  log(sessions.working, [started, [0.2, 'h', { hook_event_name: 'UserPromptSubmit', session_id: 'c-prompt', prompt: 'Write it.' }]])
  await boardWhere((b) => Object.values(sessions).every((id) => floorOf(b, 'bare').cards.some((c) => c.id === id)))
  const refusal = async (verb: string, id: string) => {
    const reply = await post(verb, { id, text: 'hello' })
    assert.equal(reply.status, 409, reply.body)
    return errorCode(reply)
  }
  assert.equal(await refusal('submit', sessions.asking), 'not_at_prompt')
  assert.equal(await refusal('submit/at-prompt', sessions.asking), 'not_at_prompt')
  assert.equal(await refusal('submit/at-prompt', sessions.working), 'not_at_prompt')
  assert.equal(await refusal('submit/at-prompt', sessions.holding), 'composer_holds')
  assert.equal(errorCode(await post('submit/at-prompt', { id: sessions.holding, text: '' })), 'invalid')
})

test("server: resume recuts a worktree that was removed with its landed branch from origin's default, under its name, and tells the resumed session in its first prompt, before the prompt given; one on a detached HEAD whose folder is gone is unresumable and refused", async () => {
  const release = await heldBoard()
  const origin = path.join(ROOT, 'bare-origin.git')
  execFileSync('git', ['clone', '-q', '--bare', BARE, origin])
  gitIn(BARE, 'remote', 'add', 'origin', origin)
  gitIn(BARE, 'fetch', '-q', 'origin')
  gitIn(BARE, 'remote', 'set-head', 'origin', '--auto')
  await boardWhere((b) => floorOf(b, 'bare').defaultBase === 'origin/main')
  const tree = (name: string) => path.join(BARE, '.worktrees', name)
  gitIn(BARE, 'worktree', 'add', '-q', '-b', 'tower/kite-9', tree('kite-9'), 'origin/main')
  gitIn(BARE, 'config', 'branch.tower/kite-9.towerBase', 'origin/main')
  gitIn(BARE, 'config', 'branch.tower/kite-9.towerName', 'kite-9')
  gitIn(BARE, 'worktree', 'add', '-q', '-b', 'tower/moth-5', tree('moth-5'), 'origin/main')
  gitIn(BARE, 'config', 'branch.tower/moth-5.towerBase', 'origin/main')
  gitIn(BARE, 'config', 'branch.tower/moth-5.towerName', 'moth-5')
  gitIn(BARE, 'worktree', 'add', '-q', '--detach', tree('wren-4'), 'main')
  const sessions = { tidied: '20261004-213000-d1e2', detached: '20261004-213100-e3f4', quiet: '20261004-213200-f5a6' }
  const ended = (id: string, cwd: string, conversation: string) => {
    const header = { id, project: 'bare', cwd, argv: ['bash'], startedAt: Date.now(), cols: 80, rows: 24 }
    const events = [
      [0.1, 'h', { hook_event_name: 'SessionStart', source: 'startup', session_id: conversation }],
      [0.2, 'h', { hook_event_name: 'UserPromptSubmit', session_id: conversation, prompt: 'Build it.' }],
      [0.3, 'x', { exitCode: 0 }],
    ]
    writeFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), [header, ...events].map((line) => JSON.stringify(line)).join('\n') + '\n')
  }
  ended(sessions.tidied, tree('kite-9'), 'c-tidied')
  ended(sessions.detached, tree('wren-4'), 'c-detached')
  ended(sessions.quiet, tree('moth-5'), 'c-quiet')
  for (const name of ['kite-9', 'moth-5']) {
    gitIn(BARE, 'worktree', 'remove', tree(name))
    gitIn(BARE, 'branch', '-D', `tower/${name}`)
  }
  rmSync(tree('wren-4'), { recursive: true, force: true })

  const cardOf = (b: Board, id: string) => floorOf(b, 'bare').cards.find((c) => c.id === id)
  const gone = await boardWhere((b) => [sessions.tidied, sessions.detached].every((id) => cardOf(b, id)?.worktree?.gone))
  assert.deepEqual(
    [cardOf(gone, sessions.tidied)!.unresumable, cardOf(gone, sessions.detached)!.unresumable],
    [undefined, 'gone'],
    'a worktree is gone only by git read since its session started',
  )
  release()

  const refused = await post('resume', { id: sessions.detached, conversation: 'c-detached' })
  assert.equal(errorCode(refused), 'lost')
  assert.match(JSON.parse(refused.body).message, /was on a detached HEAD, with no branch to recut it from: forget "wren-4" from its floor, then try again$/)

  const main = gitIn(BARE, 'rev-parse', 'origin/main').trim()
  const note = (name: string) =>
    `Your worktree \`${name}\` was removed after you went home, with its branch, which the tower deletes only once its work has landed. ` +
    `It was recut on a new branch from \`origin/main\` at \`${main.slice(0, 7)}\`: your earlier work is there, not on your old branch or at its commits.`
  const argvOf = async (id: string): Promise<string[]> =>
    JSON.parse((await settled(async () => readFileSync(path.join(ROOT, 'sessions', `${id}.jsonl`), 'utf8'), (log) => log.length > 0)).split('\n')[0]).argv

  const resumed = await command('resume', { id: sessions.tidied, conversation: 'c-tidied', prompt: 'Carry on.' })
  assert.deepEqual(resumed.restored, { name: 'kite-9', how: 'fresh', repos: [{ dir: BARE, from: 'origin/main', commit: main }] })
  assert.equal(gitIn(tree('kite-9'), 'branch', '--show-current').trim(), 'tower/kite-9')
  assert.equal(gitIn(BARE, 'config', 'branch.tower/kite-9.towerName').trim(), 'kite-9')
  const argv = await argvOf(resumed.id)
  assert.deepEqual(argv.slice(-4), ['--resume', 'c-tidied', '--', `${note('kite-9')}\n\nCarry on.`], 'the note, then the prompt given, as one message')

  const quiet = await command('resume', { id: sessions.quiet, conversation: 'c-quiet', prompt: '' })
  assert.deepEqual((await argvOf(quiet.id)).slice(-4), ['--resume', 'c-quiet', '--', `${note('moth-5')}\n\nMake no changes now: answer briefly that you've read this, then wait for the next message.`])
})
