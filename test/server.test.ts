/**
 * The renderer API end to end: the tower server (`src/tower/server.ts`) booted as its own process on a throwaway system
 * root, read and driven over HTTP. No host or terms daemon runs: the one session is a log written into the root, which
 * is all the session reads need.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { z } from 'zod'
import { ApiError, ROUTES, type Replies, type Verb } from '../src/shared/api.ts'
import boardSchema from '../src/shared/board.schema.json' with { type: 'json' }
import { fonts } from '../src/shared/design.ts'
import { parseThread } from '../src/shared/reviews.ts'
import type { BoardMsg, Reads } from '../src/shared/shelf-page.ts'
import { MODULES } from '../src/tower/served.ts'

const REPO = path.join(import.meta.dirname, '..')
const ROOT = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tower-api-')))
const HUB = path.join(ROOT, 'lab')
const RENDERER = path.join(ROOT, 'renderer')
const SESSION = '20261004-210927-2c96'
const SHOWN = path.join(HUB, 'report', 'index.html')
const PULSE = path.join(REPO, 'test', 'fixtures', 'extensions', 'pulse')
const CHIME = path.join(REPO, 'test', 'fixtures', 'extensions', 'chime')
const TALLY = path.join(REPO, 'test', 'fixtures', 'extensions', 'tally')

const BOOT_MS = 15_000

let tower: ChildProcess
let base: string

const git = (...args: string[]) => execFileSync('git', ['-C', HUB, '-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args], { stdio: 'ignore' })

const POLICY = '# Nightly\n\n```json\n{"when": {"cron": ["0 3 1 1 *"]}}\n```\n\nNever started: a run waits on the user\'s approval.\n'

/**
 * A hub that is a repo with a branch cut from `main`, a page beside a hidden file, a renderer declared by the config with
 * a hidden file below its root, a policy, and a session that showed the page and ended.
 */
function seed(port: number) {
  for (const dir of [path.join(HUB, 'report'), RENDERER, path.join(ROOT, 'sessions'), path.join(ROOT, 'collections', 'lab', 'policies')]) mkdirSync(dir, { recursive: true })
  writeFileSync(SHOWN, '<!doctype html><title>report</title>')
  writeFileSync(path.join(HUB, 'report', '.secret'), 'hidden')
  writeFileSync(path.join(RENDERER, 'index.html'), '<!doctype html><title>renderer</title>')
  writeFileSync(path.join(RENDERER, '.secret'), 'hidden')
  writeFileSync(path.join(ROOT, 'collections', 'lab', 'policies', 'nightly.md'), POLICY)
  execFileSync('git', ['init', '-q', '-b', 'main', HUB])
  git('add', '.')
  git('commit', '-q', '-m', 'first')
  git('branch', 'feature')
  git('config', 'branch.feature.towerBase', 'main')
  writeFileSync(path.join(HUB, '.git', 'info', 'exclude'), '.worktrees/\n')
  const header = { id: SESSION, project: 'lab', cwd: HUB, argv: ['bash'], startedAt: Date.now() - 60_000, cols: 80, rows: 24 }
  const events = [
    [0.1, 'o', 'a session\r\n'],
    [0.2, 'h', { hook_event_name: 'tower.show', kind: 'file', target: SHOWN }],
    [0.25, 'h', { hook_event_name: 'tower.x.pulse.beat', value: 1 }],
    [0.3, 'x', { exitCode: 0 }],
  ]
  writeFileSync(path.join(ROOT, 'sessions', `${SESSION}.jsonl`), [header, ...events].map((line) => JSON.stringify(line)).join('\n') + '\n')
  writeConfig(port)
}

function writeConfig(port: number) {
  const config = {
    argv: ['bash'],
    port,
    probes: { quota: { off: true } },
    renderers: { plain: { root: RENDERER } },
    extensions: { pulse: { path: PULSE, settings: { every: 3_600_000 } }, chime: { path: CHIME }, tally: { path: TALLY } },
    projects: { lab: { name: 'lab', hub: HUB, repos: [], shelf: [{ label: 'Report', html: 'report/index.html' }] } },
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

/**
 * The tower on `port`, once it says it is up; `undefined` when another process took the port first. One that says
 * nothing within `BOOT_MS` is killed and fails the boot: node:test would wait on the hook forever.
 */
const boot = (port: number): Promise<ChildProcess | undefined> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join('src', 'tower', 'server.ts')], {
      cwd: REPO,
      env: { PATH: process.env.PATH, HOME: ROOT, TOWER_CONFIG: path.join(ROOT, 'config.json') },
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
})

after(async () => {
  if (tower && tower.exitCode === null) {
    const exited = new Promise((resolve) => tower.once('exit', resolve))
    tower.kill()
    await exited
  }
  rmSync(ROOT, { recursive: true, force: true })
})

type Reply = { status: number; type: string; body: string; headers: http.IncomingHttpHeaders }

const request = (pathname: string, options: http.RequestOptions = {}, body?: Buffer | string): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = http.request(`${base}${pathname}`, options, (res) => {
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
    const req = http.get(`${base}${pathname}`, (res) => {
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
    problems: [],
    verbs: [
      { name: 'pulse/ping', scope: 'project', words: { label: 'Ping', hint: 'rings chime for the floor' } },
      { name: 'pulse/pong', scope: 'system', deprecated: { since: '1.0', use: 'pulse/ping', why: 'a ping names its floor' } },
      { name: 'pulse/beat', scope: 'project', words: { label: 'Beat', hint: 'keeps a beat on the floor, and as a fact of the session when one is named' } },
    ],
    commands: [{ name: 'listen', module: 'pulse.js', export: 'listen', words: { label: 'Listen', hint: 'reads the beat aloud' }, on: ['item.pulse'] }],
  })
  const read: Reads['extensions'] = JSON.parse((await get('/extensions')).body)
  assert.deepEqual(read.extensions, msg.board.extensions)
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
  assert.deepEqual([lab.x, card.x], [{ pulse: { beats: 1 } }, { pulse: { beats: 1 } }])
  assert.deepEqual(board.adds[`card:${SESSION}`], {
    badges: [{ label: '1 beat', tone: 'ready', cap: 'pulse' }],
    lines: [{ text: 'You took 1 beat: `tower x pulse beat` keeps another.', cap: 'pulse' }],
  })
  assert.deepEqual(board.adds['floor:lab'], {
    actions: [{ verb: 'pulse/ping', call: { project: 'lab' }, cap: 'pulse' }],
    tidy: [{ key: 'echo', label: 'Echo the beats', hint: 'answered done, and nothing kept changes', cap: 'pulse' }],
  })
  assert.deepEqual(
    board.asks.map(({ key, subject, title, sound, cap, actions }) => ({ key, subject, title, sound, cap, actions })),
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
  assert.deepEqual(JSON.parse(beats.body), { project: 'lab', every: 3_600_000 })
  const pong = await post('pulse/pong', {})
  assert.deepEqual([pong.status, JSON.parse(pong.body), pong.headers.deprecation, pong.headers.link], [200, { pong: true }, '@0', '</pulse/ping>; rel="successor-version"'])
  const schema = JSON.parse((await get('/schema')).body)
  assert.equal(schema.verbs['pulse/ping'].scope, 'project')
  assert.equal(schema.reads['pulse/beats/<project>'].path, '/pulse/beats/{project}')
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
  assert.deepEqual(read.composites['tower/spawn'], ['tower/policy/run'])
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
  assert.deepEqual([read.answers['pulse/beat.kept'], read.answers['tower/discard.record']], [['pulse', 'tally'], ['tally']])
  const tally = read.extensions.find((e) => e.id === 'tally')!
  assert.deepEqual(tally.problems.map((p) => [p.lane, p.code, p.path]), [['hook', 'hook', 'answers.pulse/beat.kept']])
})

test("server: worktree/discard raises tower/discard.record before anything goes: a refusal keeps the worktree, an answer comes back in the reply's x", async () => {
  const discardIn = async (name: string) => {
    const tree = path.join(HUB, '.worktrees', name)
    git('worktree', 'add', '-q', '-b', `tower/${name}`, tree, 'main')
    git('config', `branch.tower/${name}.towerBase`, 'main')
    writeFileSync(path.join(tree, 'draft.md'), 'never landed')
    const head = execFileSync('git', ['-C', tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    return { tree, reply: await post('worktree/discard', { project: 'lab', name, author: 'NEMO-92', held: [{ dir: HUB, head, dirty: 1 }] }) }
  }
  const kept = await discardIn('keep-this')
  assert.deepEqual(JSON.parse(kept.reply.body), { t: 'error', code: 'refused', message: 'tally couldn\'t record the discard of "keep-this", so nothing was noted or removed: keep-this is one tally keeps' })
  assert.ok(existsSync(kept.tree))
  const gone = await discardIn('gone')
  assert.equal(gone.reply.status, 200, gone.reply.body)
  assert.deepEqual(JSON.parse(gone.reply.body).x, { tally: { note: 'tally counted 1 tip' } })
  assert.ok(!existsSync(gone.tree))
})

test("server: tidy hands each extension its listed entries through tower/tidy.apply, its answer in the reply's x, and refuses an entry no longer listed", async () => {
  const plan = { worktrees: [], branches: [], threads: [], prune: [], logs: [], streams: [] }
  const tidied = await post('tidy', { project: 'lab', plan: { ...plan, x: { pulse: ['echo'] } } })
  assert.equal(tidied.status, 200, tidied.body)
  assert.deepEqual(JSON.parse(tidied.body).x, { pulse: { done: ['echo'], skipped: [] } })
  const gone = await post('tidy', { project: 'lab', plan: { ...plan, x: { pulse: ['gone'] } } })
  assert.deepEqual(JSON.parse(gone.body), { t: 'error', code: 'refused', message: "Tidy's list moved on: pulse's gone no longer qualifies" })
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
