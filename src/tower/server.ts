/**
 * The control tower: a local web view of every project and session, built from the logs.
 *
 *   GET  /              the renderer the config picks (`renderer`, `page` unless set): a redirect to it at `/r/<name>/`
 *   GET  /r/<name>/[<file>]   a renderer the core or the config declares: its entry, or any file below its root, at the
 *                       tower's origin; an HTML page saying why when it isn't declared or built or the config can't be read
 *   GET  /renderers     {default, renderers}: every renderer, with its root, entry, settings and whether it is built (src/renderers.ts)
 *   GET  /board         SSE: {v, board}, the API's version and the board, again whenever the board changes, or {v, error: {code, message}}
 *                       while the tower can't build it (`config` until the config is fixed)
 *   GET  /schema        every verb's input and reply, and the error, as JSON Schema (src/shared/api.ts)
 *   GET  /screen/<id>   SSE: a snapshot of the session's screen, then its output as the host logs it
 *   GET  /tower.js      the client a renderer page includes to read the board and drive the system (src/shared/shelf-page.ts);
 *                       `?v=<major>.<minor>` pins the version the page was written against
 *   GET  /origins       the web page of each project directory's origin remote, by directory
 *   GET  /conversations/<id>  the saved conversations of every session its worker ran as up to it, its own first, each with its session, latest prompt and answer and last `brief.pairs` turns in full, read from the logs
 *   GET  /archive/<project>  the project's cards the board leaves out, newest first (src/bridge/board.ts `onBoard`)
 *   GET  /reviews/<project>  the project's review threads, live and landed (filed by Tidy), and what each author wrote in them
 *   GET  /changes/<id>  what changed in each of the session's repos, as git reads it now (src/changes.ts)
 *   GET  /stats?from&to&bucket&project   stats over every session's log and what landed on each project's default
 *                                        branches, read from git now (src/bridge/stats.ts), the query by its schema
 *   GET  /shell/<id>    SSE: a snapshot of the shell's screen, then its output, from the terms daemon
 *   GET  /mux           SSE: screen, terminal and shell streams multiplexed on one connection; POST /mux/watch {mux, key, path},
 *                       /mux/unwatch {mux, key}
 *   GET  /shelf/<project>/<n>          the files of the project's nth shelf entry, relative to its hub (an item entry's: its id, while its collection holds it)
 *   GET  /shelf/<project>/<n>/<file>   one of them, or a file beside or below an html entry's page
 *   GET  /run/<project>/<n>[/<file>]   an html or item entry as a renderer of its own, at the tower's origin; an HTML page saying why when the config can't be read
 *   GET  /collection/<project>/<collection>/<item>   one of a collection's files
 *   GET  /shown/<id>/<path>   a file the session showed (its absolute path), or what a page it showed pulls in: anything
 *                             beside or below an html file, an image beside or below a markdown one
 *   GET  /design.css    the design tokens as variables, and the faces;  GET /design.js  the design module (src/shared/design.ts)
 *   GET  /drafts.js     the drafts editor renderers share (src/shared/drafts.ts)
 *   GET  /cards.js      what renderers say about a worker (src/shared/cards.ts)
 *   GET  /icons.js      the icons renderers draw for the same things (src/shared/icons.ts)
 *   GET  /reviews.js    the review threads' format (src/shared/reviews.ts)
 *   GET  /termkeys.js   the editing keys every browser terminal sends (src/shared/termkeys.ts)
 *   GET  /keymap.js     every keyboard command, its chords and the ? sheet (src/shared/keymap.ts)
 *   GET  /fonts/<file>  a face the design names
 *   POST /spawn {project, cwd? | cut: {name?, branch?, base? | from}, model?, effort?, prompt?} | /resume {id, conversation} | /keys {id, data}
 *        | /resize {id, cols, rows} | /kill {id}   relayed to the host; a `cut` first cuts (or forks) a worktree in every dir of the project
 *   POST /worktree/recut {project, name} | /worktree/prune {project, name} | /worktree/remove {project, name}
 *        | /branch/recut {project, name} | /branch/delete {project, name} | /tidy {project}   the tower's worktrees and kept branches, through git
 *   POST /shell/spawn {project, cwd} | /shell/keys {id, data} | /shell/resize {id, cols, rows} | /shell/kill {id}
 *        relayed to the terms daemon
 *   POST /submit {id, text}   type a prompt into a session's composer and submit it
 *   POST /collection/create {project, collection, name?, ext, content} | /collection/write {project, collection, id, content, modifiedAt}
 *        | /collection/restore {project, collection, id, content} | /collection/delete {project, collection, id}
 *   POST /review/append {project, checkout, author, re?, anchors, body}   a message on a checkout's review thread
 *   POST /reap {id}     end what the session left running;  /reap/process {id, pid}  one of those processes
 *   POST /open {dir}    open a project directory in a new window of the user's editor
 *   POST /reveal {path} | /edit {path, line?}   show a path the system names in Finder, or open it in the user's editor
 *
 * Every command's body is parsed by its schema in src/shared/api.ts. A failure, of a command or a read, answers
 * `{t: 'error', code, message}` with the code's status (`ERROR_STATUS`).
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { heldBy, resumeName, runsAs } from '../bridge/chains.ts'
import { briefOf } from '../bridge/turns.ts'
import { withLiveness } from '../bridge/status.ts'
import { isLive } from '../bridge/verbs.ts'
import { snapshot } from '../bridge/screen.ts'
import { LET_GO } from '../bridge/facts.ts'
import { hostRequest, revealInFinder, originUrl, reap, runEditor, submitText, termsRequest } from '../machine.ts'
import { changesIn } from '../changes.ts'
import { readLanded } from '../landed.ts'
import { createItem, deleteItem, itemPath, renameItem, itemVersion, putItem, readItem, restoreItem, writeItem } from '../collections.ts'
import { appended, bodyProblem, landedThreadId, nextNumber, parseThread, REVIEWS, stamp, threadId } from '../shared/reviews.ts'
import { reviewHistory } from '../bridge/reviews.ts'
import { newSessionId, resumeRequest, spawnRequest, worktreeBrief, type Launch } from '../shared/launch.ts'
import { briefConfig, callsignsOf, ConfigError, configuredUser, editorArgv, outsideProject, projectCollections, projectDirs, projectPlugins, sessionDirs, shelfItem, towerPort, worktreeName, worktreesConfig, type Config, type EditorAction, type Project, type SessionLog, type ShelfEntry } from '../shared/model.ts'
import { briefFor, cut, deleteBranch, fork, linkedSources, nameIsFree, pruneWorktree, recutBranch, recutWorktree, removeWorktree, rollback, tidy, WorktreeError } from '../worktrees.ts'
import { configPath, projectCollectionsPath, systemPaths } from '../shared/paths.ts'
import { attachShell } from '../shared/client.ts'
import { HOST_PROTOCOL, sessionKeys, type FromHost, type ToHost } from '../shared/protocol.ts'
import { SHELL_SIZE, type FromTerms, type ShellStream, type ToTerms } from '../shared/terms.ts'
import { readConfig as readConfigFile, watchSystem } from '../system.ts'
import { everyEvent, logFileOf, readLog, screenEvents, tailLog } from '../tail.ts'
import { shelfFiles, shelfServes, shownServes } from '../shelf.ts'
import { archiveLog } from '../archive.ts'
import { defaultRenderer, rendererFile, renderersOf } from '../renderers.ts'
import { allCards, archiveOf, board, occupantsOf, type TidyPlan } from '../bridge/board.ts'
import type { Prune } from '../bridge/prunable.ts'
import { bucketStart, stats, weeklyBudget } from '../bridge/stats.ts'
import type { Resource } from '../bridge/resources.ts'
import type { BoardMsg, Reads, ScreenMsg, TerminalMsg } from '../shared/shelf-page.ts'
import { API_VERSION, ApiError as ApiErrorSchema, apiError, ERROR_STATUS, ITEM_ID, QUERIES, ROUTES, VERBS, type ApiError, type ErrorCode, type Route, type RouteInput } from '../shared/api.ts'
import { z } from 'zod'
import { designCss, fonts } from '../shared/design.ts'
import { esc, shelfKind, shelfPage } from '../shared/cards.ts'
import { fontFile, packageDir } from '../packages.ts'
import { bundled, MODULES, towerClient } from './served.ts'

const PUBLISH_DEBOUNCE_MS = 150
/** How long a resume waits for the host to write its session's header; the host opens the log as it answers. */
const TRACK_TIMEOUT_MS = 5000
/** Time alone moves the board: a worker goes quiet long enough to look stuck. */
const CLOCK_PUBLISH_MS = 60_000

const paths = systemPaths(configPath())
/** Read once: the tower serves where the config said when it started, until `tower down` and `tower up`. */
const PORT = towerPort(readConfigFile(paths.config))
const STATIC: Record<string, [file: string, type: string]> = {
  '/xterm.js': [path.join(packageDir('@xterm/xterm'), 'lib', 'xterm.js'), 'text/javascript'],
  '/xterm.css': [path.join(packageDir('@xterm/xterm'), 'css', 'xterm.css'), 'text/css'],
  '/addon-fit.js': [path.join(packageDir('@xterm/addon-fit'), 'lib', 'addon-fit.js'), 'text/javascript'],
  '/marked.js': [path.join(packageDir('marked'), 'lib', 'marked.umd.js'), 'text/javascript'],
}

/** The design reaches shelf pages too, framed at an opaque origin: fonts and modules load only with CORS. */
const ANY_ORIGIN = { 'access-control-allow-origin': '*' }

function design(res: http.ServerResponse, url: string) {
  if (url === '/design.css') return res.writeHead(200, { 'content-type': 'text/css', ...ANY_ORIGIN }).end(designCss())
  if (MODULES[url]) {
    return res.writeHead(200, { 'content-type': 'text/javascript', ...ANY_ORIGIN }).end(bundled(url).text)
  }
  const font = fonts.find((f) => url === `/fonts/${f.file}`)
  if (!font) return fail(res, 'not_found', `No face at "${url}"`)
  res
    .writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=86400', ...ANY_ORIGIN })
    .end(readFileSync(fontFile(font)))
}

/**
 * A shelved page runs its own scripts at an origin of its own, opened in a frame or a tab alike: it can't reach the
 * tower's routes as the tower.
 */
const SHELF_SANDBOX = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock'

const FILE_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * A served file's guard against running as the tower: the CSP sandbox, or for a video, which runs no script and which
 * Chrome won't play as a sandboxed document, a type the browser may not second-guess.
 */
const sandboxed = (file: string): http.OutgoingHttpHeaders =>
  path.extname(file) === '.mp4' || path.extname(file) === '.webm' ? { 'x-content-type-options': 'nosniff' } : { 'content-security-policy': SHELF_SANDBOX }

const boardClients = new Set<http.ServerResponse>()
/** The board every client holds. */
let published = ''

const sse = (res: http.ServerResponse, data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

const readConfig = (): Config => readConfigFile(paths.config)

/** A thrown error as the API answers it: a config error as `config`, anything else as `internal`. */
const errorOf = (err: unknown): ApiError => apiError(err instanceof ConfigError ? 'config' : 'internal', (err as Error).message)

/** The board, or why the tower can't build it; a failure of the tower's own also goes to its log. */
const currentBoard = (): string => {
  try {
    return JSON.stringify({ v: API_VERSION, board: boardOf() } satisfies BoardMsg)
  } catch (err) {
    const { code, message } = errorOf(err)
    if (code === 'internal') console.error('board:', err)
    return JSON.stringify({ v: API_VERSION, error: { code, message } } satisfies BoardMsg)
  }
}

const boardOf = () => board(readConfig(), system.sessions(), system.live(), system.running(), system.peers(), system.shells(), system.items(), system.threads(), system.repos(), system.logs(), paths, Date.now())

function archive(res: http.ServerResponse, project: string) {
  const config = readConfig()
  if (!Object.hasOwn(config.projects, project)) return fail(res, 'not_found', `No project "${project}" in the config`)
  const now = Date.now()
  const cards = allCards(config, system.sessions(), system.live(), system.running(), system.peers(), system.shells(), system.threads(), system.repos(), now)
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(archiveOf(cards, project, now)))
}

function conversations(res: http.ServerResponse, id: string) {
  const session = system.session(id)
  if (!session) return fail(res, 'not_found', `No session "${id}"`)
  const config = readConfig()
  const { pairs } = briefConfig(config, session.header.project)
  const logs = new Map<string, SessionLog>()
  const logOf = (sessionId: string) => logs.get(sessionId) ?? logs.set(sessionId, readLog(logFileOf(paths, sessionId), everyEvent).log).get(sessionId)!
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(briefOf(session, system.sessions(), logOf, pairs, callsignsOf(config))))
}

async function changes(res: http.ServerResponse, id: string) {
  const session = system.session(id)
  if (!session) return fail(res, 'not_found', `No session "${id}"`)
  const { project, cwd } = session.header
  const config = readConfig()
  if (!Object.hasOwn(config.projects, project)) return fail(res, 'not_found', `No project "${project}" in the config`)
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await changesIn(sessionDirs(config.projects[project], cwd))))
}

const DAY_MS = 86_400_000
const BUCKET_MS = { hour: 3_600_000, day: DAY_MS }
/** About three months of hours: a series longer than any chart draws. */
const MAX_BUCKETS = 2400

/** By default, the day `to` falls in and the six whole local days before it. */
async function statsRead(res: http.ServerResponse, search: string) {
  const query = QUERIES.stats.safeParse(Object.fromEntries(new URLSearchParams(search)))
  if (!query.success) return fail(res, 'invalid', z.prettifyError(query.error))
  const now = Date.now()
  const { to = now, bucket, project } = query.data
  const from = query.data.from ?? bucketStart(bucketStart(to, 'day') - 6 * DAY_MS + DAY_MS / 2, 'day')
  if (from >= to) return fail(res, 'invalid', '`from` must come before `to`')
  if ((to - from) / BUCKET_MS[bucket] > MAX_BUCKETS) return fail(res, 'invalid', `At most ${MAX_BUCKETS} ${bucket}s: narrow the window or take days`)
  const sessions = system.sessions()
  const scoped = sessions.filter((s) => project === undefined || s.header.project === project)
  const projects = Object.entries(readConfig().projects).filter(([id]) => project === undefined || id === project)
  const dirs = [...new Set(projects.flatMap(([, p]) => projectDirs(p)))]
  const reads = await Promise.all(dirs.map((dir) => readLanded(dir, from, to)))
  const read = new Map(dirs.map((dir, i) => [dir, reads[i]]))
  const landed = Object.fromEntries(projects.map(([id, p]) => [id, projectDirs(p).map((dir) => read.get(dir)!)]))
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...stats(scoped, landed, { from, to, bucket }), budget: weeklyBudget(sessions, now) }))
}

/** The contract for renderers in any language. */
const apiSchema = JSON.stringify({
  v: API_VERSION,
  verbs: Object.fromEntries(Object.entries(VERBS).map(([verb, { input, reply }]) => [verb, { input: z.toJSONSchema(input, { io: 'input' }), reply: z.toJSONSchema(reply) }])),
  reads: Object.fromEntries(Object.entries(QUERIES).map(([read, query]) => [read, { query: z.toJSONSchema(query, { io: 'input' }) }])),
  error: z.toJSONSchema(ApiErrorSchema),
})

async function origins(res: http.ServerResponse) {
  const dirs = Object.values(readConfig().projects).flatMap(projectDirs)
  const urls = await Promise.all(dirs.map(async (dir) => [dir, await originUrl(dir)]))
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(Object.fromEntries(urls.filter(([, url]) => url))))
}

const publish = () => {
  if (!boardClients.size) return
  const next = currentBoard()
  if (next === published) return
  published = next
  for (const res of boardClients) res.write(`data: ${next}\n\n`)
}

let publishTimer: NodeJS.Timeout | undefined
const schedulePublish = () => {
  publishTimer ??= setTimeout(() => {
    publishTimer = undefined
    publish()
  }, PUBLISH_DEBOUNCE_MS)
}

const system = await watchSystem(paths, schedulePublish)
setInterval(schedulePublish, CLOCK_PUBLISH_MS)

/** A board client observes the machine while it holds the board, so its first board already says what runs. */
async function streamBoard(req: http.IncomingMessage, res: http.ServerResponse) {
  let gone = false
  const observing = system.observe()
  req.on('close', () => {
    gone = true
    boardClients.delete(res)
    void observing.then((release) => release())
  })
  await observing
  if (gone) return
  const current = currentBoard()
  if (!boardClients.size) published = current
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
  res.write(`data: ${current}\n\n`)
  boardClients.add(res)
}

type Stop = () => void

/**
 * A snapshot of the session's screen, then its output as the host logs it; a session no longer running has only
 * its snapshot. `undefined` for a session nobody logged.
 */
async function screenStream(id: string, send: (msg: ScreenMsg) => void): Promise<Stop | undefined> {
  const session = system.session(id)
  if (!session) return
  const logPath = logFileOf(paths, id)
  const { log, offset } = readLog(logPath, screenEvents)
  const { facts } = session
  const running = isLive(withLiveness(facts.state, id, system.live()?.ids ?? new Set()).status)
  send({ t: 'snapshot', data: await snapshot(log), cols: facts.cols, rows: facts.rows, exited: !running })
  if (!running) return () => {}
  return tailLog(logPath, offset, screenEvents, (event) => {
    if (event[1] === 'o') send({ t: 'o', data: event[2] })
    if (event[1] === 'r') send({ t: 'r', size: event[2] })
    if (event[1] === 'x') send({ t: 'x', exitCode: event[2].exitCode })
  })
}

/** How many terminals are open on each session. */
const terminals = new Map<string, number>()

/** A session's screen stream, opened by an interactive terminal: its snapshot says how many others are open. */
async function terminalStream(id: string, send: (msg: TerminalMsg) => void): Promise<Stop | undefined> {
  const others = terminals.get(id) ?? 0
  terminals.set(id, others + 1)
  let open = true
  const close = () => {
    if (!open) return
    open = false
    if (terminals.get(id) === 1) terminals.delete(id)
    else terminals.set(id, terminals.get(id)! - 1)
  }
  const stop = await screenStream(id, (msg) => send(msg.t === 'snapshot' ? { ...msg, terminals: others } : msg))
  if (!stop) {
    close()
    return
  }
  return () => {
    stop()
    close()
  }
}

const shellStream = (id: string, send: (msg: ShellStream) => void): Stop => attachShell(paths.terms, id, send)

const openSse = (res: http.ServerResponse) => res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })

async function streamScreen(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!system.session(id)) return fail(res, 'not_found', `No session "${id}"`)
  openSse(res)
  let gone = false
  let stop: Stop | undefined
  req.on('close', () => ((gone = true), stop?.()))
  stop = await screenStream(id, (msg) => sse(res, msg))
  if (gone) stop?.()
}

function streamShell(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
  openSse(res)
  const stop = shellStream(id, (msg) => {
    sse(res, msg)
    if (msg.t === 'x' || msg.t === 'error') res.end()
  })
  req.on('close', stop)
}

/**
 * Streams multiplexed onto one SSE connection per client: a browser holds at most six connections to a host, and
 * every live screen would otherwise take one. The client opens `GET /mux`, learns its id from the first message,
 * then adds and drops streams by `POST /mux/watch {mux, key, path}` and `/mux/unwatch {mux, key}`. Each event
 * arrives as `{key, data}`, `data` being a message of the stream at `path` (src/shared/shelf-page.ts `Streams`).
 */
type Mux = { res: http.ServerResponse; streams: Map<string, Promise<Stop | undefined>> }
const muxes = new Map<string, Mux>()

function openMux(req: http.IncomingMessage, res: http.ServerResponse) {
  const id = randomUUID()
  const mux: Mux = { res, streams: new Map() }
  muxes.set(id, mux)
  openSse(res)
  sse(res, { t: 'mux', id })
  req.on('close', () => {
    muxes.delete(id)
    for (const stream of mux.streams.values()) void stream.then((stop) => stop?.())
  })
}

const streamAt = (path: string, send: (msg: ScreenMsg | TerminalMsg | ShellStream) => void): Promise<Stop | undefined> => {
  const screen = /^screen\/([\w-]+)$/.exec(path)?.[1]
  if (screen) return screenStream(screen, send)
  const terminal = /^terminal\/([\w-]+)$/.exec(path)?.[1]
  if (terminal) return terminalStream(terminal, send)
  const shell = /^shell\/([\w-]+)$/.exec(path)?.[1]
  return Promise.resolve(shell ? shellStream(shell, send) : undefined)
}

async function muxWatch({ mux: muxId, key, path }: RouteInput['mux/watch']): Promise<Answer> {
  const mux = muxes.get(muxId)
  if (!mux) return apiError('not_found', `No mux "${muxId}"`)
  void mux.streams.get(key)?.then((stop) => stop?.())
  const stream = streamAt(path, (data) => sse(mux.res, { key, data }))
  mux.streams.set(key, stream)
  if (!(await stream)) return apiError('not_found', `Nothing streams at "${path}"`)
  return OK
}

function muxUnwatch({ mux: muxId, key }: RouteInput['mux/unwatch']): Answer {
  const mux = muxes.get(muxId)
  void mux?.streams.get(key)?.then((stop) => stop?.())
  mux?.streams.delete(key)
  return OK
}

function shelf(res: http.ServerResponse, projectId: string, n: number, file: string | undefined) {
  const project = readConfig().projects[projectId]
  const entry = project?.shelf?.[n]
  if (!entry) return fail(res, 'not_found', `"${projectId}" has no shelf entry ${n}`)
  if (file === undefined) {
    const files = shelfFiles(project, entry).filter((f) => !('message' in shelfFile(projectId, project, entry, f)))
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(files))
  }
  if (!shelfServes(project, entry, file)) return fail(res, 'not_found', `The shelf entry serves no "${file}"`)
  const found = shelfFile(projectId, project, entry, file)
  if ('message' in found) return fail(res, 'not_found', found.message)
  serveFile(res, found.file, sandboxed(file))
}

/** A file an entry serves, on disk: under the hub, or an `item` entry's in its collection, which must hold it. */
function shelfFile(projectId: string, project: Project, entry: ShelfEntry, file: string): { file: string } | { message: string } {
  if (!('item' in entry)) return { file: path.join(project.hub, file) }
  const { collection, id } = shelfItem(entry)
  if (!entry.item.includes('/') || !ITEM_ID.test(id)) return { message: `The shelf entry names "${entry.item}": an item is named "<collection>/<id>", the id its file name` }
  if (!isDeclared(projectId, collection)) return { message: `The shelf entry names "${entry.item}", and "${projectId}" keeps no collection "${collection}"` }
  const found = itemPath(paths, projectId, collection, id)
  return existsSync(found) ? { file: found } : { message: `The shelf entry names "${entry.item}", and ${projectId}/${collection} holds no item "${id}"` }
}

/** What a page run on its own shows in place of itself when it can't be served: a reader of it is in a browser tab. */
const problemPage = (title: string, detail: string, fix: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Tower: ${esc(title)}</title>
<link rel="stylesheet" href="/design.css">
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--wall); color: var(--ink); font: var(--fs-xl)/1.5 var(--ui); }
main { max-width: 640px; margin: var(--sp-xl); padding: var(--sp-2xl) var(--sp-3xl); background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--broken); border-radius: var(--radius); }
h1 { margin: 0 0 var(--sp-l); font: 800 var(--fs-2xl)/1.2 var(--display); }
pre { margin: var(--sp-l) 0; padding: var(--sp-l); white-space: pre-wrap; overflow-wrap: anywhere; font: var(--fs-m)/1.5 var(--mono); background: var(--panel-2); border-radius: var(--radius); }
code { font: var(--fs-m) var(--mono); overflow-wrap: anywhere; }
p { margin: var(--sp-l) 0 0; color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<pre>${esc(detail)}</pre>
<p>${fix}</p>
</main>
</body>
</html>
`

const htmlPage = (res: http.ServerResponse, status: number, page: string) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(page)

/** A page opened in a browser tab, read with the config: a config it can't read shows as a page saying so. */
function withConfig(res: http.ServerResponse, serve: (config: Config) => void) {
  try {
    serve(readConfig())
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    htmlPage(res, ERROR_STATUS.config, problemPage('The config needs a fix', err.message, `Fix <code>${esc(paths.config)}</code> and reload this page.`))
  }
}

/** `/`: the configured renderer, at its own URL, so its files resolve below its root. */
const home = (res: http.ServerResponse, query: string) =>
  withConfig(res, (config) => res.writeHead(302, { location: `/r/${defaultRenderer(config, renderersOf(config)).name}/${query}` }).end())

/** A declared renderer: trusted like the tower page, at the tower's origin, so `/tower.js` calls the routes directly. */
const rendered = (res: http.ServerResponse, name: string, file: string | undefined, query: string) =>
  withConfig(res, (config) => {
    const renderers = renderersOf(config)
    const renderer = renderers.find((r) => r.name === name)
    const built = renderers.filter((r) => r.available).map((r) => `<a href="/r/${esc(r.name)}/">${esc(r.name)}</a>`).join(', ')
    if (!renderer) return htmlPage(res, ERROR_STATUS.not_found, problemPage(`No renderer "${name}"`, `The renderers are ${renderers.map((r) => r.name).join(', ')}`, `Declare it in <code>renderers</code> in <code>${esc(paths.config)}</code>, or open one that is built: ${built}.`))
    if (file === undefined) return res.writeHead(302, { location: `/r/${name}/${query}` }).end()
    if (!renderer.available) {
      const entry = path.join(renderer.root, renderer.entry)
      return htmlPage(res, ERROR_STATUS.unavailable, problemPage(`${name} isn't built`, `${entry} doesn't exist`, `Build the renderer into its root and reload this page, or open one that is built: ${built}.`))
    }
    const full = rendererFile(renderer, file || renderer.entry)
    if (!full || !statSync(full, { throwIfNoEntry: false })?.isFile()) return fail(res, 'not_found', `The renderer "${name}" serves no "${file}"`)
    serveFile(res, full, {})
  })

/** Every renderer, and the one `/` opens. */
function renderersRead(res: http.ServerResponse) {
  const config = readConfig()
  const renderers = renderersOf(config)
  const read: Reads['renderers'] = { default: defaultRenderer(config, renderers).name, renderers }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(read))
}

/** An `html` or `item` entry's page run as a renderer of its own: at the tower's origin, so `/tower.js` calls the routes directly. */
const run = (res: http.ServerResponse, projectId: string, n: number, file: string | undefined, query: string) =>
  withConfig(res, (config) => {
    const project = config.projects[projectId]
    const entry = project?.shelf?.[n]
    if (!entry || shelfKind(entry) !== 'html') return fail(res, 'not_found', `"${projectId}" has no html or item shelf entry ${n}`)
    if (file === undefined) return res.writeHead(302, { location: `/run/${projectId}/${n}/${shelfPage(entry)}${query}` }).end()
    if (!shelfServes(project, entry, file)) return fail(res, 'not_found', `The shelf entry serves no "${file}"`)
    const found = shelfFile(projectId, project, entry, file)
    if ('message' in found) return fail(res, 'not_found', found.message)
    serveFile(res, found.file, {})
  })

/** A collection's file, sandboxed like a shelf's: an html item opened by its URL runs at an origin of its own. */
function collectionItem(res: http.ServerResponse, project: string, collection: string, id: string) {
  if (!isDeclared(project, collection)) return fail(res, 'not_found', `"${project}" has no collection "${collection}"`)
  if (!ITEM_ID.test(id)) return fail(res, 'invalid', `"${id}" is not an item id`)
  const file = itemPath(paths, project, collection, id)
  if (!existsSync(file)) return fail(res, 'not_found', `${project}/${collection} holds no item "${id}"`)
  serveFile(res, file, sandboxed(file))
}

/** A file a worker showed, sandboxed like a shelf's. */
function shownFile(res: http.ServerResponse, id: string, file: string) {
  const session = system.session(id)
  if (!session) return fail(res, 'not_found', `No session "${id}"`)
  if (!shownServes(session.facts.shown, file)) return fail(res, 'not_found', `${id} showed no "${file}"`)
  if (!existsSync(file)) return fail(res, 'not_found', `"${file}" is gone`)
  serveFile(res, file, sandboxed(file))
}

const isDeclared = (project: string, collection: string): boolean => {
  const config = readConfig()
  return Object.hasOwn(config.projects, project) && Object.hasOwn(projectCollections(config, project), collection)
}

const serveFile = (res: http.ServerResponse, file: string, headers: http.OutgoingHttpHeaders) =>
  res
    .writeHead(200, { 'content-type': FILE_TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...headers })
    .end(readFileSync(file))

type Answer = { t: string } | ApiError

const OK = { t: 'ok' } as const

/** A daemon that answers no refuses; one that doesn't answer is unavailable. */
async function daemon(ask: () => Promise<FromHost | FromTerms>): Promise<Answer> {
  try {
    const reply = await ask()
    return reply.t === 'error' ? apiError('refused', reply.message) : reply
  } catch (err) {
    return apiError('unavailable', (err as Error).message)
  }
}

async function host(msg: ToHost): Promise<Answer> {
  const answer = await daemon(() => hostRequest(paths, msg))
  void system.refreshLive()
  return answer
}

async function terms(msg: ToTerms): Promise<Answer> {
  const answer = await daemon(() => termsRequest(paths, msg))
  void system.refreshShells()
  return answer
}

const withSession = (id: string, act: () => Answer | Promise<Answer>) =>
  system.session(id) ? act() : apiError('not_found', `No session "${id}"`)

/**
 * Only a card that offers `let-go` is let go: stranded, on duty, its latest conversation not yet resumed. The fact is
 * appended by the host, which takes it from `HOST_PROTOCOL` 2 on.
 */
const letGo = (id: string) =>
  withSession(id, () => {
    const live = system.live()
    if (live && (live.protocol ?? 0) < HOST_PROTOCOL)
      return apiError('unavailable', `The running host is too old to let a worker go (protocol ${live.protocol ?? 0}, this tower needs ${HOST_PROTOCOL}): restart it with tower down host, then tower up (its running sessions stop, each resumable)`)
    return boardOf().floors.some((f) => f.cards.some((c) => c.id === id && c.verbs.includes('let-go')))
      ? host({ t: 'fact', id, fact: { hook_event_name: LET_GO } })
      : apiError('refused', `Session "${id}" is not stranded on duty: only a worker the host stopped or lost, waiting to be resumed, is let go`)
  })

/** A worktree with a folder gone, in any repo, can't be worked in until it is recut. */
const lostWorktree = (project: Project, cwd: string): ApiError | undefined => {
  const name = worktreeName(project, cwd)
  const gone = name === undefined ? undefined : sessionDirs(project, cwd).find((dir) => !existsSync(dir))
  return gone ? apiError('lost', `The worktree ${gone} is gone: recut "${name}" from its floor, then try again`) : undefined
}

/**
 * A resume continues one of the conversations Claude saved in the source session, in the directory it ran in, unless a
 * running session is already in it. Resumes run one at a time, each until the system holds the session it started, so
 * the next one reads it.
 */
let resuming: Promise<unknown> = Promise.resolve()
const resume = (id: string, conversation: string): Promise<Answer> => {
  const run = resuming.then(() => resumeOnce(id, conversation))
  resuming = run.catch(() => undefined)
  return run
}

const resumeOnce = (id: string, conversation: string) =>
  withSession(id, async () => {
    const source = system.session(id)!
    const held = source.facts.conversations.find((c) => c.id === conversation)
    if (!held) return apiError('not_found', `Session "${id}" holds no conversation "${conversation}"`)
    if (!held.saved) return apiError('refused', `Claude hasn't saved conversation "${conversation}" yet`)
    await system.refreshLive()
    const holder = heldBy(conversation, system.sessions(), system.live()?.ids ?? new Set())
    if (holder) return apiError('refused', `${runsAs(holder)} (session ${holder.header.id}) is already in conversation "${conversation}": go to it`)
    const config = readConfig()
    const project = config.projects[source.header.project]
    if (!project) return apiError('not_found', `No project "${source.header.project}" in the config`)
    const lost = lostWorktree(project, source.header.cwd)
    if (lost) return lost
    const heir = newSessionId()
    const brief = await briefFor(project, worktreesConfig(config, source.header.project).links, source.header.cwd)
    const answer = await host(resumeRequest(source.header, conversation, heir, resumeName(source, conversation, heir, system.sessions(), callsignsOf(config)), sessionDirs(project, source.header.cwd), configuredUser(config), brief, projectCollectionsPath(paths, source.header.project), projectPlugins(config, source.header.project)))
    if (answer.t === 'spawned') await system.tracked(heir, TRACK_TIMEOUT_MS)
    return answer
  })

const withProject = (projectId: string, act: (project: Project, config: Config) => Answer | Promise<Answer>) => {
  const config = readConfig()
  const project = config.projects[projectId]
  return project ? act(project, config) : apiError('not_found', `No project "${projectId}"`)
}

/** A git refusal answers as its API error; the board reads git again after anything that may have changed it. */
async function worktreeVerb(act: () => Promise<Answer>): Promise<Answer> {
  try {
    return await act()
  } catch (err) {
    if (err instanceof WorktreeError) return apiError(err.code, err.message)
    throw err
  } finally {
    void system.refreshRepos()
  }
}

/** Who is in a worktree right now: a running session or shell keeps it from removal. */
const occupants = () => occupantsOf(cardsNow(), system.shells())
const cardsNow = () => boardOf().floors.flatMap((f) => f.cards)

/** A session in `cwd`, or in the hub's main checkout when none is given. */
const spawnIn = (projectId: string, given: string | undefined, launch: Launch) =>
  withProject(projectId, async (project, config) => {
    const id = newSessionId()
    const cwd = given ?? project.hub
    const outside = outsideProject(project, cwd)
    if (outside) return apiError('refused', outside)
    return lostWorktree(project, cwd) ?? host(spawnRequest(id, callsignsOf(config)(id), projectId, cwd, sessionDirs(project, cwd), launch, configuredUser(config), await briefFor(project, worktreesConfig(config, projectId).links, cwd), projectCollectionsPath(paths, projectId), projectPlugins(config, projectId)))
  })

/** Callsigns until one names a worktree, default branch and recorded name the floor doesn't have: of a hundred per name, few are taken. */
const MAX_NAME_TRIES = 50

/** A session id whose callsign, lowercased, is a free worktree name. */
async function freeName(project: Project, branchPrefix: string, callsign: (id: string) => string): Promise<{ id: string; name: string }> {
  for (let i = 0; i < MAX_NAME_TRIES; i++) {
    const id = newSessionId()
    const name = callsign(id).toLowerCase()
    if (await nameIsFree(projectDirs(project), name, `${branchPrefix}${name}`)) return { id, name }
  }
  throw new WorktreeError('exists', `No free worktree name after ${MAX_NAME_TRIES} callsigns: name it`)
}

/**
 * A new worktree in every dir of the project, cut from a base on origin or forked from a checkout, then a session in the
 * hub's. The worker is named for the worktree unless the worktree was named: a session id is drawn until its callsign is
 * a free name. A failed spawn rolls the cut back.
 */
const spawnCut = (projectId: string, request: { name?: string; branch?: string; base?: string; from?: string }, launch: Launch) =>
  withProject(projectId, (project, config) =>
    worktreeVerb(async () => {
      const { branchPrefix, links } = worktreesConfig(config, projectId)
      const { id, name } = request.name ? { id: newSessionId(), name: request.name } : await freeName(project, branchPrefix, callsignsOf(config))
      const branch = request.branch ?? `${branchPrefix}${name}`
      const made = await (request.from !== undefined ? fork(project, links, { name, branch, from: request.from }) : cut(project, links, { name, branch, base: request.base }))
      const cwd = made.made[0].path
      const answer = await host(spawnRequest(id, callsignsOf(config)(id), projectId, cwd, sessionDirs(project, cwd), launch, configuredUser(config), worktreeBrief(project, cwd, made.branch, linkedSources(project, links)), projectCollectionsPath(paths, projectId), projectPlugins(config, projectId)))
      if (answer.t === 'error') {
        await rollback(made.made)
        return apiError('worktree_failed', `The session didn't start in ${cwd}, so the cut was rolled back: ${(answer as ApiError).message}`)
      }
      return { ...answer, cut: { name: made.name, branch: made.branch, bases: made.bases } }
    }),
  )

const onWorktrees = (projectId: string, act: (project: Project, config: Config) => Promise<Answer>) =>
  withProject(projectId, (project, config) => worktreeVerb(() => act(project, config)))

/** Ends what the session left running and `picks`, read from the machine as it is now. */
const reapIn = (id: string, picks: (r: Resource) => boolean, nothing: string) =>
  withSession(id, async () => {
    const release = await system.observe()
    try {
      const doomed = system.running().filter((r) => r.session === id && picks(r))
      if (!doomed.length) return apiError('refused', nothing)
      reap(doomed)
      void system.refreshRunning()
      return OK
    } finally {
      release()
    }
  })

const reapSession = (id: string) => reapIn(id, () => true, `Session "${id}" left nothing running`)

const reapProcess = (id: string, pid: number) => reapIn(id, (r) => r.pid === pid, `Session "${id}" left no process ${pid} running`)

/** Does `action` in the user's editor: a command the tower can't find is a config error. */
async function inEditor(action: EditorAction, values: Record<string, string>): Promise<void> {
  const config = readConfig()
  const argv = editorArgv(config, action, values)
  try {
    await runEditor(argv)
  } catch (err) {
    const from = config.editor ? `editor.${action} in the config` : 'the default editor: set editor in the config'
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigError(`"${argv[0]}" (${from}) is not on the tower's PATH`)
    throw err
  }
}

/** A project's main checkout or one of its worktrees. */
async function openDir(dir: string): Promise<Answer> {
  const projects = Object.values(readConfig().projects)
  if (!projects.some((p) => projectDirs(p).includes(dir) || worktreeName(p, dir) !== undefined)) return apiError('not_found', `"${dir}" is not a project directory or a worktree of one`)
  if (!existsSync(dir)) return apiError('lost', `"${dir}" is gone`)
  await inEditor('window', { dir })
  return OK
}

const isWithin = (dir: string, target: string): boolean => {
  const rel = path.relative(dir, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/** A path with its links followed, so `/tmp/x` and `/private/tmp/x` are one: a missing path's nearest existing folder's. */
const real = (p: string): string => (existsSync(p) || p === path.dirname(p) ? realpathSync(p) : path.join(real(path.dirname(p)), path.basename(p)))

/** Why the system doesn't name `target`, if it doesn't: it names its projects' dirs, its root and the files workers showed. */
const unnamed = (target: string): string | undefined => {
  const file = real(target)
  const named =
    Object.values(readConfig().projects).some((p) => projectDirs(p).some((dir) => isWithin(real(dir), file))) ||
    isWithin(real(path.dirname(paths.config)), file) ||
    system.sessions().some((s) => s.facts.shown.some((shown) => shown.kind === 'file' && real(shown.target) === file))
  return named ? undefined : `"${target}" is inside no project directory nor the system root, and no worker showed it`
}

/** A path the system names, as it is on disk: refused when the system doesn't name it, `lost` when it is gone. */
async function onPath(target: string, act: (file: string) => Promise<void>): Promise<Answer> {
  const file = path.resolve(target)
  const refusal = unnamed(file)
  if (refusal) return apiError('not_found', refusal)
  if (!existsSync(file)) return apiError('lost', `"${file}" is gone`)
  await act(file)
  return OK
}

/** Changes only inside a collection the config declares for the project. */
const inCollection = (project: string, collection: string, change: () => Answer) =>
  isDeclared(project, collection) ? change() : apiError('not_found', `"${project}" has no collection "${collection}"`)

const toItem = (project: string, collection: string, id: string, change: (file: string) => Answer) =>
  inCollection(project, collection, () => {
    const file = itemPath(paths, project, collection, id)
    return existsSync(file) ? change(file) : apiError('not_found', `${project}/${collection} holds no item "${id}"`)
  })

/**
 * A message on a checkout's thread, numbered one past the last. Read, numbered and written in one synchronous step,
 * so appends from the page and from every worker never interleave.
 */
const appendReview = ({ project, checkout, author, re, anchors, body }: RouteInput['review/append']): Answer =>
  inCollection(project, REVIEWS, () => {
    if (!body.trim() && !anchors.length) return apiError('invalid', 'A note needs a body or an anchor')
    const problem = bodyProblem(body) ?? anchors.flatMap((a) => (a.from > a.to ? [`${a.repo}:${a.path}: line ${a.from} comes after ${a.to}`] : []))[0]
    if (problem) return apiError('invalid', problem)
    const id = threadId(checkout)
    const text = readItem(paths, project, REVIEWS, id)
    const thread = parseThread(text ?? '')
    if (re !== undefined && !thread.messages.some((m) => m.n === re)) return apiError('not_found', `The thread of ${checkout} holds no n${re}`)
    const n = nextNumber(thread)
    const modifiedAt = putItem(paths, project, REVIEWS, id, appended(text, checkout, { author, at: stamp(new Date()), n, re, anchors, body: body.trim() }))
    return { t: 'appended', id, n, modifiedAt }
  })

const pruneKey = (p: Prune) => (p.t === 'reap' ? `reap ${p.id} ${p.pid}` : `kill ${p.id}`)

/** What of the listed plan the floor's Tidy no longer lists: the processes, workers and landed threads, as read now. `callsign`: a session id's. */
const movedOn = (plan: TidyPlan, now: TidyPlan, callsign: (id: string) => string): string[] => {
  const prunes = new Set(now.prune.map(pruneKey))
  return [
    ...plan.prune.filter((p) => !prunes.has(pruneKey(p))).map((p) => (p.t === 'reap' ? `process ${p.pid}` : `worker ${callsign(p.id)}`)),
    ...plan.threads.filter((t) => !now.threads.includes(t)).map((t) => `thread ${t}`),
    ...plan.logs.filter((l) => !now.logs.some((n) => n.id === l.id)).map((l) => `log ${l.id}`),
  ]
}

/**
 * Tidy as listed, or nothing when the list moved on: git's part (checked after its fetch), then the landed threads
 * filed, the leftover processes ended, the idle workers killed and the old logs archived. A worker is checked again just before its kill,
 * since the fetch takes seconds: one no longer listed, or whose kill fails, is skipped and named, and the rest goes on.
 */
const tidyProject = (projectId: string, plan: TidyPlan) =>
  onWorktrees(projectId, async (project) => {
    const release = await system.observe()
    try {
      const callsign = callsignsOf(readConfig())
      const gone = movedOn(plan, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign)
      if (gone.length) return apiError('refused', `Tidy's list moved on: ${gone.join(', ')} no longer qualif${gone.length === 1 ? 'ies' : 'y'}`)
      const git = plan.worktrees.length || plan.branches.length ? await tidy(project, projectId, occupants(), plan) : { removed: [], deleted: [] }
      const now = new Date()
      for (const checkout of plan.threads) renameItem(paths, projectId, REVIEWS, threadId(checkout), landedThreadId(checkout, now))
      const reaps = plan.prune.flatMap((p) => (p.t === 'reap' ? [p] : []))
      const reaped = reap(system.running().filter((r) => reaps.some((p) => p.id === r.session && p.pid === r.pid)))
      void system.refreshRunning()
      const killed: string[] = []
      const skipped: string[] = []
      for (const p of plan.prune) {
        if (p.t !== 'kill') continue
        if (movedOn({ ...plan, threads: [], prune: [p], logs: [] }, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign).length) {
          skipped.push(`worker ${callsign(p.id)}: no longer done with its purpose`)
          continue
        }
        const answer = await host({ t: 'kill', id: p.id })
        if (answer.t === 'error') skipped.push(`worker ${callsign(p.id)}: ${(answer as ApiError).message}`)
        else killed.push(p.id)
      }
      for (const { id } of plan.logs) await archiveLog(paths, id)
      return { t: 'tidied', ...git, threads: plan.threads, reaped: reaped.map((r) => r.pid), killed, skipped, archived: plan.logs.map((l) => l.id) }
    } finally {
      release()
    }
  })

const HANDLERS: { [R in Route]: (input: RouteInput[R]) => Answer | Promise<Answer> } = {
  spawn: ({ project, cwd, cut, model, effort, prompt }) => (cut ? spawnCut(project, cut, { model, effort, prompt }) : spawnIn(project, cwd, { model, effort, prompt })),
  resume: ({ id, conversation }) => resume(id, conversation),
  keys: ({ id, data }) =>
    withSession(id, () => {
      const keys = sessionKeys(data)
      return keys ? host({ t: 'write', id, data: keys }) : OK
    }),
  submit: ({ id, text }) => withSession(id, () => daemon(() => submitText(paths, id, text))),
  resize: ({ id, cols, rows }) => withSession(id, () => host({ t: 'resize', id, cols, rows })),
  kill: ({ id }) => withSession(id, () => host({ t: 'kill', id })),
  'let-go': ({ id }) => letGo(id),
  reap: ({ id }) => reapSession(id),
  'reap/process': ({ id, pid }) => reapProcess(id, pid),
  open: ({ dir }) => openDir(dir),
  reveal: ({ path: target }) => onPath(target, revealInFinder),
  edit: ({ path: target, line }) =>
    onPath(target, (file) => (line === undefined ? inEditor('open', { path: file }) : inEditor('goto', { path: file, line: String(line) }))),
  'shell/spawn': ({ project, cwd }) => terms({ t: 'spawn', project, cwd, ...SHELL_SIZE }),
  'shell/keys': ({ id, data }) => terms({ t: 'write', id, data }),
  'shell/resize': ({ id, cols, rows }) => terms({ t: 'resize', id, cols, rows }),
  'shell/kill': ({ id }) => terms({ t: 'kill', id }),
  'collection/create': ({ project, collection, name, ext, content }) =>
    inCollection(project, collection, () => ({ t: 'created', ...createItem(paths, project, collection, name, ext, content) })),
  'collection/write': ({ project, collection, id, content, modifiedAt }) =>
    toItem(project, collection, id, (file) =>
      itemVersion(file) === modifiedAt
        ? { t: 'written', modifiedAt: writeItem(paths, project, collection, id, content) }
        : apiError('refused', `${project}/${collection}/${id} changed since version ${modifiedAt}`),
    ),
  'collection/restore': ({ project, collection, id, content }) =>
    inCollection(project, collection, () => {
      const modifiedAt = restoreItem(paths, project, collection, id, content)
      return modifiedAt === undefined ? apiError('refused', `${project}/${collection} already holds an item "${id}"`) : { t: 'created', id, modifiedAt }
    }),
  'collection/delete': ({ project, collection, id }) => toItem(project, collection, id, () => (deleteItem(paths, project, collection, id), OK)),
  'worktree/recut': ({ project, name }) =>
    onWorktrees(project, async (p, config) => (await recutWorktree(p, project, worktreesConfig(config, project).links, name, occupants()), OK)),
  'worktree/prune': ({ project, name }) => onWorktrees(project, async (p) => (await pruneWorktree(p, project, name, occupants()), OK)),
  'worktree/remove': ({ project, name }) => onWorktrees(project, async (p) => (await removeWorktree(p, project, name, occupants()), OK)),
  'branch/recut': ({ project, name }) =>
    onWorktrees(project, async (p, config) => (await recutBranch(p, project, worktreesConfig(config, project).links, name), OK)),
  'branch/delete': ({ project, name }) => onWorktrees(project, async (p) => (await deleteBranch(p, project, name), OK)),
  tidy: ({ project, plan }) => tidyProject(project, plan),
  'review/append': appendReview,
  'mux/watch': muxWatch,
  'mux/unwatch': muxUnwatch,
}

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => (body += chunk))
    req.on('end', () => resolve(body))
  })

const send = (res: http.ServerResponse, answer: Answer) =>
  res.writeHead(answer.t === 'error' ? ERROR_STATUS[(answer as ApiError).code] : 200, { 'content-type': 'application/json' }).end(JSON.stringify(answer))

const fail = (res: http.ServerResponse, code: ErrorCode, message: string) => send(res, apiError(code, message))

const isRoute = (name: string): name is Route => Object.hasOwn(ROUTES, name)

const parseJson = (text: string): { json: unknown } | undefined => {
  try {
    return { json: JSON.parse(text) }
  } catch {
    return undefined
  }
}

/** Every command: its body parsed by the verb's schema, handled, and its reply checked against the verb's. */
async function command(req: http.IncomingMessage, res: http.ServerResponse, route: string) {
  if (!isRoute(route)) return fail(res, 'not_found', `No verb "${route}"`)
  const body = parseJson(await readBody(req))
  if (!body) return fail(res, 'invalid', 'The body is not JSON')
  const input = ROUTES[route].input.safeParse(body.json)
  if (!input.success) return fail(res, 'invalid', z.prettifyError(input.error))
  const answer = await (HANDLERS[route] as (input: unknown) => Answer | Promise<Answer>)(input.data)
  send(res, answer.t === 'error' ? answer : ROUTES[route].reply.parse(answer))
}

const TOWER_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])

/**
 * Any page open in the browser can reach the tower: through DNS rebinding, under a foreign Host, or with a
 * cross-site POST, which browsers send without a preflight but always mark with its Origin.
 */
const isFromTower = (req: http.IncomingMessage): boolean =>
  TOWER_HOSTS.has(req.headers.host ?? '') && (req.method !== 'POST' || req.headers.origin === `http://${req.headers.host}`)

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!isFromTower(req)) {
    res.writeHead(403).end()
    return
  }
  const url = req.url ?? '/'
  const asset = STATIC[url]
  if (req.method === 'GET' && asset) {
    res.writeHead(200, { 'content-type': asset[1] }).end(readFileSync(asset[0]))
    return
  }
  if (req.method === 'GET' && url.split('?')[0] === '/tower.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(towerClient())
  if (req.method === 'GET' && (MODULES[url] || /^\/(design\.css|fonts\/)/.test(url))) return design(res, url)
  if (req.method === 'GET' && url === '/board') return streamBoard(req, res)
  if (req.method === 'GET' && url === '/origins') return origins(res)
  if (req.method === 'GET' && url === '/schema') return res.writeHead(200, { 'content-type': 'application/json' }).end(apiSchema)
  if (req.method === 'GET' && url === '/mux') return openMux(req, res)
  const archived = /^\/archive\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && archived) return archive(res, archived)
  const held = /^\/conversations\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && held) return conversations(res, held)
  const reviewed = /^\/reviews\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && reviewed) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reviewHistory(system.threads().filter((t) => t.project === reviewed))))
  const changed = /^\/changes\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && changed) return changes(res, changed)
  const screen = /^\/screen\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && screen) return streamScreen(screen, req, res)
  const shell = /^\/shell\/([\w-]+)$/.exec(url)?.[1]
  if (req.method === 'GET' && shell) return streamShell(shell, req, res)
  const shelved = /^\/shelf\/([\w-]+)\/(\d+)(?:\/(.+))?$/.exec(url.split('?')[0])
  if (req.method === 'GET' && shelved) return shelf(res, shelved[1], Number(shelved[2]), shelved[3] && decodeURIComponent(shelved[3]))
  const [pathname, search] = url.split('?')
  const query = search === undefined ? '' : `?${search}`
  if (req.method === 'GET' && pathname === '/') return home(res, query)
  if (req.method === 'GET' && pathname === '/renderers') return renderersRead(res)
  const rendering = /^\/r\/([\w-]+)(?:\/(.*))?$/.exec(pathname)
  if (req.method === 'GET' && rendering) return rendered(res, rendering[1], rendering[2] === undefined ? undefined : decodeURIComponent(rendering[2]), query)
  if (req.method === 'GET' && pathname === '/stats') return statsRead(res, search ?? '')
  const ran = /^\/run\/([\w-]+)\/(\d+)(?:\/(.+))?$/.exec(pathname)
  if (req.method === 'GET' && ran) return run(res, ran[1], Number(ran[2]), ran[3] && decodeURIComponent(ran[3]), query)
  const item = /^\/collection\/([\w-]+)\/([\w-]+)\/([^/]+)$/.exec(pathname)
  if (req.method === 'GET' && item) return collectionItem(res, item[1], item[2], decodeURIComponent(item[3]))
  const shown = /^\/shown\/([\w-]+)(\/.+)$/.exec(pathname)
  if (req.method === 'GET' && shown) return shownFile(res, shown[1], decodeURIComponent(shown[2]))
  if (req.method === 'POST') return command(req, res, pathname.slice(1))
  fail(res, 'not_found', `Nothing at "${pathname}"`)
}

/** An error thrown inside an async request handler would otherwise end the whole tower. */
const server = http.createServer((req, res) => {
  handle(req, res).catch((err: Error) => {
    console.error(`${req.method} ${req.url}:`, err)
    if (res.headersSent) res.end()
    else send(res, errorOf(err))
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`tower up: http://127.0.0.1:${PORT}  (${paths.config})`))
