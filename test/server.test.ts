/**
 * The renderer API end to end: the tower server (`src/tower/server.ts`) booted as its own process on a throwaway system
 * root, read and driven over HTTP. No host or terms daemon runs: the one session is a log written into the root, which
 * is all the session reads need.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
import { MODULES } from '../src/tower/served.ts'

const REPO = path.join(import.meta.dirname, '..')
const ROOT = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tower-api-')))
const HUB = path.join(ROOT, 'lab')
const RENDERER = path.join(ROOT, 'renderer')
const SESSION = '20261004-210927-2c96'
const SHOWN = path.join(HUB, 'report', 'index.html')

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
  const header = { id: SESSION, project: 'lab', cwd: HUB, argv: ['bash'], startedAt: Date.now() - 60_000, cols: 80, rows: 24 }
  const events = [
    [0.1, 'o', 'a session\r\n'],
    [0.2, 'h', { hook_event_name: 'tower.show', kind: 'file', target: SHOWN }],
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

type Reply = { status: number; type: string; body: string }

const request = (pathname: string, options: http.RequestOptions = {}, body?: Buffer | string): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = http.request(`${base}${pathname}`, options, (res) => {
      let text = ''
      res.setEncoding('utf8').on('data', (chunk) => (text += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, type: String(res.headers['content-type']), body: text }))
    })
    req.on('error', reject)
    req.end(body)
  })

const get = (pathname: string) => request(pathname)

const post = (verb: string, input: unknown) =>
  request(`/${verb}`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' } }, JSON.stringify(input))

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
    ['/schema', 'application/json', (body) => has('v', 'verbs', 'reads', 'streams', 'error')(body) && (json(body) as { reads: Record<string, { path: string }> }).reads['changes/<id>']?.path === '/changes/{id}'],
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
