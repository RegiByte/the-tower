/**
 * The control tower's HTTP server (`core:http`): a local web view of every project and session, built from the logs.
 *
 *   GET  /              the renderer the config picks (`renderer`, `page` unless set): a redirect to it at `/r/<name>/`
 *   GET  /r/<name>/[<file>]   a renderer the core or the config declares: its entry, or any file below its root but hidden ones, at the
 *                       tower's origin; an HTML page saying why when it isn't declared or built or the config can't be read
 *   GET  /x/<cap>/<file>   a file of the client folder of the extension providing <cap> (the bundled one's while none runs),
 *                          its commands' modules, a `.ts` served bundled as `.js`, with CORS as a renderer's; `/x/tower/`
 *                          the core's view modules (`CORE_VIEWS`), bundled from src/views/
 *   GET  /renderers     {default, renderers}: every renderer, with its root, entry, settings, whether it is built, and what its
 *                       renderer.json declares: regions, kit, keeps and layout, and the config's layout for it, configLayout (src/renderers.ts)
 *   GET  /board         SSE: {v, board}, the API's version and the board, again whenever the board changes, or {v, error: {code, message}}
 *                       while the tower can't build it (`config` until the config is fixed)
 *   GET  /schema        every verb's input and reply and every hook's payload and answer, the core's and each running extension's,
 *                       every read, the error and an extension's manifest, as JSON Schema (src/shared/api.ts, src/shared/extensions.ts),
 *                       and every core verb's flow, its stages open, wrapped or sealed (src/shared/flows.ts), and where the `tower` command
 *                       draws contributions (`cli.regions`, src/shared/regions.ts)
 *   GET  /extensions    {extensions, topology, chains, answers, composites, launchers}: every extension the tower found, as the board shows them, the tower's
 *                       resources as braided orders them, with their graph as Mermaid text, the chain around each verb or hook, each hook's
 *                       answerers, what the core's composites call and the launch contributors (src/tower/extensions.ts)
 *   GET  /screen/<id>   SSE: a snapshot of the session's screen, then its output as the host logs it
 *   GET  /tower.js      the client a renderer page includes to read the board and drive the system (src/shared/shelf-page.ts);
 *                       `?v=<major>.<minor>` pins the version the page was written against
 *   GET  /frame-keys.js a framed page's keys sent to the tower framing it, appended to every html page served sandboxed
 *   GET  /origins       the web page of each project directory's origin remote, by directory
 *   GET  /patterns      what users found doing with the tower, from the checkout's docs/patterns/*.md (src/shared/capabilities.ts)
 *   GET  /conversations/<id>  the saved conversations of every session its worker ran as up to it, its own first, each with its session, latest prompt and answer and last `brief.pairs` turns in full, read from the logs
 *   GET  /archive/<project>  the project's cards the board leaves out, newest first (src/bridge/board.ts `onBoard`)
 *   GET  /reviews/<project>  the reviews extension's reviews/history/<project>, through LEGACY until 2.0
 *   GET  /landing?project&branch  what landing changed on a branch: each commit landed as an edited copy, and git range-diff
 *   GET  /changes/<id>  what changed in each of the session's repos, as git reads it now, `?scope=all|uncommitted|<commit>` (src/changes.ts)
 *   GET  /runs/<project>?policy&limit  a policy's runs, newest first, each with its worker as it is now (src/bridge/policies.ts)
 *   GET  /probe/<name>?last  deprecated: the quota probe's status as board.probes shows it and its latest reads, through
 *                            quota/reads (LEGACY, src/bridge/legacy.ts)
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
 *                             beside or below an html file, an image beside or below a markdown one, none of it hidden
 *   GET  /design.css    the design tokens as variables, and the faces;  GET /design.js  the design module (src/shared/design.ts)
 *   GET  /drafts.js     deprecated: `/x/drafts/drafts.js`, served there with a `Deprecation` header (`LEGACY`)
 *   GET  /cards.js      what renderers say about a worker (src/shared/cards.ts)
 *   GET  /icons.js      the icons renderers draw for the same things (src/shared/icons.ts)
 *   GET  /reviews.js    the review threads' format (src/shared/reviews.ts)
 *   GET  /policies.js   what renderers say and decide about policies: rules and slots in words, standing (src/shared/policies.ts)
 *   GET  /termkeys.js   the editing keys every browser terminal sends (src/shared/termkeys.ts)
 *   GET  /keymap.js     every keyboard command, its chords and the ? sheet (src/shared/keymap.ts)
 *   GET  /views.js      views, the layout, locations and display: what a renderer hosting views reads (src/shared/views.ts)
 *   GET  /capabilities.js   what the tower lets a user do, and the tips renderers show of it and of the patterns (src/shared/capabilities.ts)
 *   GET  /palette.js        the command palette's entries and their ranking for what the viewer typed (src/shared/palette.ts)
 *   GET  /verb-words.js     each verb the board offers in words: label, hint, whether it asks first, its API verb (src/shared/verb-words.ts)
 *   GET  /fonts/<file>  a face the design names
 *   POST /spawn {project, cwd? | cut: {name?, branch?, base? | from}, model?, effort?, prompt?, by?, hire?} | /resume {id, conversation, prompt?} | /keys {id, data, by?}
 *        | /resize {id, cols, rows} | /kill {id, by?}   relayed to the host; a `cut` first cuts (or forks) a worktree in every dir of the project
 *   POST /worktree/recut {project, name} | /worktree/prune {project, name} | /worktree/remove {project, name}
 *        | /worktree/discard {project, name, author, held}
 *        | /branch/recut {project, name} | /branch/delete {project, name} | /tidy {project}   the tower's worktrees and kept branches, through git
 *   POST /shell/spawn {project, cwd} | /shell/keys {id, data} | /shell/resize {id, cols, rows} | /shell/kill {id}
 *        relayed to the terms daemon
 *   POST /submit {id, text, by?}   type a prompt into a session's composer and submit it
 *   POST /fact {name: show | keep | leave, value?}   a fact a running worker logs about its own session, through the host
 *   POST /collection/create {project, collection, name?, ext, content} | /collection/write {project, collection, id, content, modifiedAt}
 *        | /collection/restore {project, collection, id, content} | /collection/delete {project, collection, id}
 *   POST /review/append {project, checkout, author, re?, anchors, body}   a message on a checkout's review thread
 *   POST /policy/run {project, policy, start, slot?, by?, check?} | /policy/pass {project, policy, slot, outcome, check?}
 *        | /policy/approve {project, policy, hash, by?}   a policy's facts in its project's streams (decision `policies`)
 *   POST /probe/run {name}   deprecated: the quota probe read now, through quota/read-now (LEGACY, src/bridge/legacy.ts)
 *   POST /reap {id}     end what the session left running;  /reap/process {id, pid}  one of those processes
 *   POST /open {dir}    open a project directory in a new window of the user's editor
 *   POST /reveal {path} | /edit {path, line?}   show a path the system names in Finder, or open it in the user's editor
 *   POST /<capability>/<verb>   an extension's verb;  GET /<capability>/<read>  an extension's read (src/tower/calls.ts)
 *
 * Every command's body, up to 8 MiB, is parsed by its schema in src/shared/api.ts, or an extension's manifest, through
 * the dispatch, for the caller the `tower` command's headers claim (`CALLER_HEADERS`), the user when they claim none. A
 * deprecated verb or read answers with RFC 9745's `Deprecation` header, and a `Link` to what to use instead. A failure,
 * of a command or a read, answers `{t: 'error', code, message}` with the code's status (`ERROR_STATUS`).
 */
import { defineResource, type StartedResource } from 'braided'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { z } from 'zod'
import { LEGACY_READS, legacyNamed } from '../bridge/legacy.ts'
import { bucketStart, outsideIn, stats, weeklyBudget, weeklyRead, type Stats } from '../bridge/stats.ts'
import { withLiveness } from '../bridge/status.ts'
import { briefOf } from '../bridge/turns.ts'
import { isLive } from '../bridge/verbs.ts'
import { changesIn } from '../changes.ts'
import { itemPath } from '../collections.ts'
import { readLanded } from '../landed.ts'
import { originUrl } from '../machine.ts'
import { fontFile, packageDir } from '../packages.ts'
import { readPatterns } from '../patterns.ts'
import { defaultRenderer, rendererFile, renderersOf } from '../renderers.ts'
import { CLI_REGIONS } from '../shared/regions.ts'
import { API_VERSION, apiError, ApiError as ApiErrorSchema, CALLER_HEADERS, ERROR_STATUS, HOOK_DEADLINE, HOOKS, isApiError, ITEM_ID, QUERIES, TRANSPORT, VERBS, VIEWER_ID, VIEWER_RENDERER, type ErrorCode, type Query, type RouteInput } from '../shared/api.ts'
import { FLOWS } from '../shared/flows.ts'
import boardSchema from '../shared/board.schema.json' with { type: 'json' }
import { esc, exemptionsBy, shelfKind, shelfPage } from '../shared/cards.ts'
import { attachShell } from '../shared/client.ts'
import { designCss, fonts } from '../shared/design.ts'
import { legacyOf, MANIFEST_SCHEMA, qualifiedOf, tooDeep, type Caller, type Deprecated, type LegacyEntry } from '../shared/extensions.ts'
import { bundledClient, clientSource } from '../extensions.ts'
import { briefConfig, callsignsOf, ConfigError, projectDirs, sessionDirs, shelfItem, towerHosts, towerPort, type Config, type Project, type SessionLog, type ShelfEntry } from '../shared/model.ts'
import type { Reads, ScreenMsg, TerminalMsg } from '../shared/shelf-page.ts'
import type { ShellStream } from '../shared/terms.ts'
import { MEDIA_TYPES, mediaTypeOf, UNKNOWN_TYPE } from '../shared/media.ts'
import { shelfFiles, shelfServes, shownServes } from '../shelf.ts'
import { everyEvent, logFileOf, readLog } from '../tail.ts'
import { landingOf, WorktreeError } from '../worktrees.ts'
import { errorOf, OK, type Answer } from './answers.ts'
import { DispatchResource } from './dispatch.ts'
import { collectionOn } from '../bridge/stores.ts'
import type { ExtensionsResource } from './extensions.ts'
import type { PublisherResource } from './publisher.ts'
import { lastFrames, screenMirrors } from './screens.ts'
import { bundled, bundledFile, CORE_VIEWS_DIR, FRAME_KEYS, MODULES, towerClient } from './served.ts'
import type { ConfigResource, SystemResource } from './spine.ts'

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

type Deps = {
  'core:config': ConfigResource
  'core:system': SystemResource
  'core:publisher': PublisherResource
  'core:dispatch': DispatchResource
  'core:extensions': ExtensionsResource
}

/** The server on the config's port as it is at start: it serves there until it is halted. */
export const httpServer = defineResource({
  dependencies: ['core:config', 'core:system', 'core:publisher', 'core:dispatch', 'core:extensions'],
  start: async ({ 'core:config': { paths, read: readConfig }, 'core:system': system, 'core:publisher': { board: boardOf, everyCard, archivedCards, streamBoard }, 'core:dispatch': dispatch, 'core:extensions': extensions }: Deps) => {
    const PORT = towerPort(readConfig())

    const STATIC: Record<string, [file: string, type: string]> = {
      '/xterm.js': [path.join(packageDir('@xterm/xterm'), 'lib', 'xterm.js'), 'text/javascript'],
      '/xterm.css': [path.join(packageDir('@xterm/xterm'), 'css', 'xterm.css'), 'text/css'],
      '/addon-fit.js': [path.join(packageDir('@xterm/addon-fit'), 'lib', 'addon-fit.js'), 'text/javascript'],
      '/addon-web-links.js': [path.join(packageDir('@xterm/addon-web-links'), 'lib', 'addon-web-links.js'), 'text/javascript'],
      '/addon-unicode-graphemes.js': [path.join(packageDir('@xterm/addon-unicode-graphemes'), 'lib', 'addon-unicode-graphemes.js'), 'text/javascript'],
      '/marked.js': [path.join(packageDir('marked'), 'lib', 'marked.umd.js'), 'text/javascript'],
      '/frame-keys.js': [FRAME_KEYS, 'text/javascript'],
    }

    /** The design and the renderers reach framed pages too, at an opaque origin: fonts and modules load only with CORS. */
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

    /** What a sandboxed html page gets appended: its keys sent to the tower framing it, with no API and at its own origin. */
    const FRAME_KEYS_TAG = '\n<script src="/frame-keys.js"></script>\n'

    /** The tower's own modules and styles, sent as their bare type. */
    const SCRIPTS = ['text/javascript', 'text/css']

    /** What a served file is sent as: its media type, with the charset of the text a worker writes. */
    const FILE_TYPES: Record<string, string> = Object.fromEntries(
      Object.entries(MEDIA_TYPES).map(([ext, type]) => [ext, type.startsWith('text/') && !SCRIPTS.includes(type) ? `${type}; charset=utf-8` : type]),
    )

    /**
     * A served file's guard against running as the tower: the CSP sandbox, or for a video or a sound, which runs no
     * script and which Chrome won't play as a sandboxed document, a type the browser may not second-guess.
     */
    const sandboxed = (file: string): http.OutgoingHttpHeaders =>
      /^(video|audio)\//.test(mediaTypeOf(file)) ? { 'x-content-type-options': 'nosniff' } : { 'content-security-policy': SHELF_SANDBOX }

    /**
     * A viewer that stops reading (a suspended tab, a frozen web view) is closed once it has read nothing of what waits
     * for it this long, or once this much waits: a stream's bytes can't be skipped, and its client reconnects and starts
     * again from a snapshot. A burst (every monitor's snapshot on one connection) can wait for a moment, well under both.
     */
    const STALL_MS = 30_000
    const MAX_BEHIND = 64 * 1024 * 1024

    /** Each stream response with writes waiting, and the timer that closes it unless they drain first. */
    const stalls = new Map<http.ServerResponse, NodeJS.Timeout>()

    const unstall = (res: http.ServerResponse) => {
      clearTimeout(stalls.get(res))
      stalls.delete(res)
    }

    const sse = (res: http.ServerResponse, data: unknown) => {
      if (res.writableEnded || res.destroyed) return
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      if (res.writableLength > MAX_BEHIND) return void res.destroy()
      if (!res.writableNeedDrain || stalls.has(res)) return
      stalls.set(res, setTimeout(() => res.destroy(), STALL_MS))
      res.once('drain', () => unstall(res))
    }

    function archive(res: http.ServerResponse, project: string) {
      if (!Object.hasOwn(readConfig().projects, project)) return fail(res, 'not_found', `No project "${project}" in the config`)
      const now = Date.now()
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(archivedCards(project, now)))
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

    async function changes(res: http.ServerResponse, id: string, { scope }: z.output<(typeof QUERIES)['changes/<id>']>) {
      const session = system.session(id)
      if (!session) return fail(res, 'not_found', `No session "${id}"`)
      const { project, cwd } = session.header
      const config = readConfig()
      if (!Object.hasOwn(config.projects, project)) return fail(res, 'not_found', `No project "${project}" in the config`)
      // Read before the status is written: a git failure then answers as an error the panel draws, not an empty 200.
      const repos = await changesIn(sessionDirs(config.projects[project], cwd), scope === 'all' || scope === 'uncommitted' ? scope : { commit: scope })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(repos))
    }

    const DAY_MS = 86_400_000
    const BUCKET_MS = { hour: 3_600_000, day: DAY_MS }
    /** About three months of hours: a series longer than any chart draws. */
    const MAX_BUCKETS = 2400

    /** By default, the day `to` falls in and the six whole local days before it. */
    /** What landing changed on a branch of a project, read from git now. */
    async function landingRead(res: http.ServerResponse, query: z.output<typeof QUERIES.landing>) {
      const project = readConfig().projects[query.project]
      if (!project) return fail(res, 'not_found', `No project "${query.project}"`)
      try {
        const landing = await landingOf(project, query.branch)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(landing))
      } catch (err) {
        if (!(err instanceof WorktreeError)) throw err
        fail(res, err.code, err.message)
      }
    }

    /**
     * A core read that moved into an extension (`LEGACY`): its params and query as the new read takes them, read through
     * the dispatch, and the reply as the old one answered, deprecated.
     */
    async function legacyRead(req: http.IncomingMessage, res: http.ServerResponse, old: string, params: Record<string, string | undefined>, query: Record<string, unknown>) {
      const { request, reply } = LEGACY_READS[old]
      const { now, since } = legacyNamed('read', old)!
      const mapped = request(params, query)
      if (isApiError(mapped)) return send(res, mapped)
      deprecate(res, { since, use: now })
      const { cap, name } = qualifiedOf(now)!
      const answer = await dispatch.read(cap, name, mapped.params, mapped.query, callerOf(req))
      send(res, isApiError(answer) ? answer : reply(answer, boardOf()))
    }

    async function statsRead(res: http.ServerResponse, query: z.output<typeof QUERIES.stats>) {
      const now = Date.now()
      const { to = now, bucket, project } = query
      const from = query.from ?? bucketStart(bucketStart(to, 'day') - 6 * DAY_MS + DAY_MS / 2, 'day')
      if (from >= to) return fail(res, 'invalid', '`from` must come before `to`')
      if ((to - from) / BUCKET_MS[bucket] > MAX_BUCKETS) return fail(res, 'invalid', `At most ${MAX_BUCKETS} ${bucket}s: narrow the window or take days`)
      const sessions = system.sessions()
      const scoped = sessions.filter((s) => project === undefined || s.header.project === project)
      const projects = Object.entries(readConfig().projects).filter(([id]) => project === undefined || id === project)
      const dirs = [...new Set(projects.flatMap(([, p]) => projectDirs(p)))]
      const reads = await Promise.all(dirs.map((dir) => readLanded(dir, from, to)))
      const read = new Map(dirs.map((dir, i) => [dir, reads[i]]))
      const landed = Object.fromEntries(projects.map(([id, p]) => [id, projectDirs(p).map((dir) => read.get(dir)!)]))
      const readings = extensions.readings()
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...stats(scoped, landed, { from, to, bucket }), budget: weeklyBudget(sessions, readings, now), weekly: weeklyRead(sessions, readings, { from, to }), outside: outsideIn(sessions, readings, { from, to }) } satisfies Stats))
    }

    async function origins(res: http.ServerResponse) {
      const dirs = Object.values(readConfig().projects).flatMap(projectDirs)
      const urls = await Promise.all(
        dirs.map(async (dir) => {
          try {
            return [dir, await originUrl(dir)]
          } catch (err) {
            console.error(`origin of ${dir}:`, (err as Error).message)
            return [dir, undefined]
          }
        }),
      )
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(Object.fromEntries(urls.filter(([, url]) => url))))
    }

    type Stop = () => void

    /** How long a watched screen's mirror outlives its last viewer: a reconnect or a switch back finds it built. */
    const MIRROR_GRACE_MS = 30_000

    const mirrors = screenMirrors((id) => logFileOf(paths, id), MIRROR_GRACE_MS)

    /** How many ended sessions' last frames are kept; a frame is a few KB. */
    const LAST_FRAMES_KEPT = 500

    const lastFrameOf = lastFrames((id) => logFileOf(paths, id), LAST_FRAMES_KEPT)

    /**
     * A snapshot of the session's screen, then its output as the host logs it; a session no longer running has only
     * its snapshot, its last frame. `undefined` for a session nobody logged.
     */
    async function screenStream(id: string, send: (msg: ScreenMsg) => void): Promise<Stop | undefined> {
      const session = system.session(id)
      if (!session) return
      const { facts } = session
      const running = isLive(withLiveness(facts.state, id, system.live()?.ids ?? new Set()).status)
      const sendSnapshot = (data: string, exited: boolean) => send({ t: 'snapshot', data, cols: facts.cols, rows: facts.rows, exited })
      if (running) {
        const stop = await mirrors.watch(id, {
          snapshot: (data) => sendSnapshot(data, false),
          event: (event) => {
            if (event[1] === 'o') send({ t: 'o', data: event[2] })
            if (event[1] === 'r') send({ t: 'r', size: event[2] })
            if (event[1] === 'x') send({ t: 'x', exitCode: event[2].exitCode })
          },
        })
        if (stop) return stop
      }
      sendSnapshot(await lastFrameOf.frame(id), !running)
      return () => {}
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
      const stop = await screenStream(id, (msg) => send(msg.t === 'snapshot' ? { ...msg, terminals: others } : msg)).catch((err) => {
        close()
        throw err
      })
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

    const openSse = (res: http.ServerResponse) =>
      res.on('close', () => unstall(res)).writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })

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
      /** A stream that fails to open answers its watch with the failure, and the mux holds it as one with nothing to stop. */
      mux.streams.set(key, stream.catch(() => undefined))
      if (!(await stream)) return apiError('not_found', `Nothing streams at "${path}"`)
      return OK
    }

    function muxUnwatch({ mux: muxId, key }: RouteInput['mux/unwatch']): Answer {
      const mux = muxes.get(muxId)
      void mux?.streams.get(key)?.then((stop) => stop?.())
      mux?.streams.delete(key)
      return OK
    }

    function shelf(req: http.IncomingMessage, res: http.ServerResponse, projectId: string, n: number, file: string | undefined) {
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
      serveSandboxed(req, res, found.file)
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
        serveFile(res, full, ANY_ORIGIN)
      })

    /**
     * A file of the client folder of the extension providing `cap`: the running one's, else the bundled one's, so a
     * renderer built on a bundled client keeps loading while that extension is off. A `.ts` source is served bundled.
     */
    function clientFile(res: http.ServerResponse, cap: string, file: string, headers: http.OutgoingHttpHeaders) {
      if (cap === 'tower') return coreViewFile(res, file)
      const live = extensions.live(cap)
      const dir = live.t === 'up' ? live.a.manifest.client && path.join(live.a.dir, live.a.manifest.client) : bundledClient(cap)
      if (!dir) return fail(res, 'not_found', `No running extension provides ${cap} with a client folder`)
      const source = clientSource(dir, file)
      if (!source) return fail(res, 'not_found', `${cap}'s client serves no "${file}"`)
      if (path.extname(source) === '.ts') {
        const { text } = bundledFile(source)
        return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store', ...ANY_ORIGIN, ...headers }).end(text)
      }
      serveFile(res, source, { ...ANY_ORIGIN, ...headers })
    }

    /** A module of the core's views (`CORE_VIEWS`, `/views.js`), bundled from `src/views/`. */
    function coreViewFile(res: http.ServerResponse, file: string) {
      const source = clientSource(CORE_VIEWS_DIR, file)
      if (!source) return fail(res, 'not_found', `The core serves no view module "${file}"`)
      const { text } = bundledFile(source)
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store', ...ANY_ORIGIN }).end(text)
    }

    /** A served module from before it moved into its bundled extension: what it is now, said deprecated (RFC 9745), with a `Link` to it. */
    function legacyModule(res: http.ServerResponse, { now }: LegacyEntry) {
      const { cap, file } = /^\/x\/(?<cap>[^/]+)\/(?<file>.+)$/.exec(now)!.groups!
      clientFile(res, cap!, file!, { deprecation: '@0', link: `<${now}>; rel="successor-version"` })
    }

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
    function collectionItem(req: http.IncomingMessage, res: http.ServerResponse, project: string, collection: string, id: string) {
      if (!isDeclared(project, collection)) return fail(res, 'not_found', `"${project}" has no collection "${collection}"`)
      if (!ITEM_ID.test(id)) return fail(res, 'invalid', `"${id}" is not an item id`)
      const file = itemPath(paths, project, collection, id)
      if (!existsSync(file)) return fail(res, 'not_found', `${project}/${collection} holds no item "${id}"`)
      serveSandboxed(req, res, file)
    }

    /** A file a worker showed, sandboxed like a shelf's. */
    function shownFile(req: http.IncomingMessage, res: http.ServerResponse, id: string, file: string) {
      const session = system.session(id)
      if (!session) return fail(res, 'not_found', `No session "${id}"`)
      if (!shownServes(session.facts.shown, file)) return fail(res, 'not_found', `${id} showed no "${file}"`)
      if (!existsSync(file)) return fail(res, 'not_found', `"${file}" is gone`)
      serveSandboxed(req, res, file)
    }

    const isDeclared = (project: string, collection: string) => collectionOn(readConfig(), project, collection, extensions.registry().stores) !== undefined

    const serveFile = (res: http.ServerResponse, file: string, headers: http.OutgoingHttpHeaders) => serveBytes(res, file, headers, readFileSync)

    /** Whether a script is reading the response (`sec-fetch-dest: empty`), not loading it as a page or a frame. */
    const scriptRead = (req: http.IncomingMessage) => req.headers['sec-fetch-dest'] === 'empty'

    /**
     * A file served sandboxed: an html page with `/frame-keys.js` appended after it, which keeps its doctype first;
     * read by a script, the file as written.
     */
    const serveSandboxed = (req: http.IncomingMessage, res: http.ServerResponse, file: string) =>
      mediaTypeOf(file) === 'text/html' && !scriptRead(req)
        ? serveBytes(res, file, sandboxed(file), (f) => readFileSync(f, 'utf8') + FRAME_KEYS_TAG)
        : serveFile(res, file, sandboxed(file))

    const serveBytes = (res: http.ServerResponse, file: string, headers: http.OutgoingHttpHeaders, read: (file: string) => Buffer | string) => {
      if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return fail(res, 'not_found', `"${file}" is not a file`)
      res
        .writeHead(200, { 'content-type': FILE_TYPES[path.extname(file)] ?? UNKNOWN_TYPE, 'cache-control': 'no-store', ...headers })
        .end(read(file))
    }

    /** The mux's verbs, which hold this server's connections: every other verb is the dispatch's. */
    const MUX: { [R in keyof typeof TRANSPORT]: (input: RouteInput[R]) => Answer | Promise<Answer> } = { 'mux/watch': muxWatch, 'mux/unwatch': muxUnwatch }

    /**
     * The largest command body read. The largest real requests are a `collection/write` of a self-contained html item
     * and a `review/append` carrying a diff, tens of KB; this leaves room for one with its images inlined.
     */
    const MAX_BODY = 8 * 1024 * 1024

    /** A command's body, or `undefined` once it passes `MAX_BODY`: the rest is left unread. */
    const readBody = (req: http.IncomingMessage): Promise<string | undefined> =>
      new Promise((resolve) => {
        if (Number(req.headers['content-length']) > MAX_BODY) return resolve(undefined)
        const chunks: Buffer[] = []
        let size = 0
        const onData = (chunk: Buffer) => {
          size += chunk.length
          if (size <= MAX_BODY) return void chunks.push(chunk)
          req.off('data', onData).pause()
          resolve(undefined)
        }
        req.on('data', onData)
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })

    const send = (res: http.ServerResponse, answer: unknown) =>
      res.writeHead(isApiError(answer) ? ERROR_STATUS[answer.code] : 200, { 'content-type': 'application/json' }).end(JSON.stringify(answer))

    const fail = (res: http.ServerResponse, code: ErrorCode, message: string) => send(res, apiError(code, message))

    const isMux = (name: string): name is keyof typeof TRANSPORT => Object.hasOwn(TRANSPORT, name)

    /** The caller a request claims: a worker by the `tower` command's session header, else the user. */
    const callerOf = (req: http.IncomingMessage): Caller => {
      const session = req.headers[CALLER_HEADERS.session]
      const via = req.headers[CALLER_HEADERS.client] === 'cli' ? 'cli' : 'http'
      return typeof session === 'string' && session ? { t: 'worker', id: session, via, within: [] } : { t: 'user', via, within: [] }
    }

    /**
     * A deprecated verb's or read's answer says so (RFC 9745): `Deprecation` dated `@0`, since a manifest names the version
     * it was deprecated in and no date, and a `Link` to what to use instead.
     */
    const deprecate = (res: http.ServerResponse, deprecated: Deprecated | undefined) => {
      if (!deprecated) return
      res.setHeader('deprecation', '@0')
      const use = deprecated.use && qualifiedOf(deprecated.use)
      if (use) res.setHeader('link', `</${use.cap === 'tower' ? use.name : deprecated.use}>; rel="successor-version"`)
    }

    const parseJson = (text: string): { json: unknown } | undefined => {
      try {
        return { json: JSON.parse(text) }
      } catch {
        return undefined
      }
    }

    /**
     * Every command: the mux's handled here, every other verb through the dispatch, the core's as `tower/<verb>`, which
     * parses its body and checks its reply.
     */
    async function command(req: http.IncomingMessage, res: http.ServerResponse, route: string) {
      const core = Object.hasOwn(VERBS, route)
      const q = qualifiedOf(route)
      if (!core && !isMux(route) && (!q || q.cap === 'tower')) return fail(res, 'not_found', `No verb "${route}"`)
      const text = await readBody(req)
      if (text === undefined) {
        res.setHeader('connection', 'close')
        return fail(res, 'invalid', `The body is over ${MAX_BODY / 1024 / 1024} MiB`)
      }
      const body = parseJson(text)
      if (!body) return fail(res, 'invalid', 'The body is not JSON')
      if (isMux(route)) {
        const input = TRANSPORT[route].input.safeParse(body.json)
        if (!input.success) return fail(res, 'invalid', z.prettifyError(input.error))
        return send(res, await (MUX[route] as (input: unknown) => Answer | Promise<Answer>)(input.data))
      }
      if (!core) deprecate(res, dispatch.deprecationOf(q!.cap, q!.name))
      const moved = core ? legacyNamed('verb', route) : undefined
      if (moved) deprecate(res, { since: moved.since, use: moved.now })
      send(res, await dispatch.call(core ? `tower/${route}` : route, body.json, callerOf(req)))
    }

    const LOOPBACK_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])

    /**
     * A name from the config's `hosts`, reached at the tower's port or, through a proxy, at the scheme's default port,
     * where the page may be served over https. Read on each request, so an edit to `hosts` holds at once.
     */
    const namedHostOrigins = (host: string): string[] =>
      towerHosts(readConfig()).some((name) => host === name || host === `${name}:${PORT}`) ? [`http://${host}`, `https://${host}`] : []

    /**
     * Any page open in the browser can reach the tower: through DNS rebinding, under a foreign Host, or with a
     * cross-site POST, which browsers send without a preflight but always mark with its Origin. A GET passes on its Host
     * alone: no read changes the system (what it writes is `cache/`), and a page at another origin can't read the answer.
     */
    const isFromTower = (req: http.IncomingMessage): boolean => {
      const host = req.headers.host ?? ''
      const origins = LOOPBACK_HOSTS.has(host) ? [`http://${host}`] : namedHostOrigins(host)
      return origins.length > 0 && (req.method !== 'POST' || origins.includes(req.headers.origin ?? ''))
    }

    type Served<Q extends z.ZodType> = {
      req: http.IncomingMessage
      res: http.ServerResponse
      /** The path's named groups, decoded; an optional group that didn't match is `undefined`. */
      params: Record<string, string | undefined>
      query: z.output<Q>
      /** The url's query string with its `?`, or `''`: what a redirect carries on. */
      search: string
    }

    /** Every read the API declares: the keys of `Reads` and of `QUERIES`. */
    type ReadName = keyof Reads | Query

    /** A read's query schema in `QUERIES`, or none for a read that takes no query. */
    type QueryOf<N extends ReadName> = N extends Query ? (typeof QUERIES)[N] : z.ZodUnknown

    /** What a GET route that is no API read is: a page the tower serves, a stream, or the API's own description. */
    type Kind = 'page' | 'stream' | 'schema'

    /**
     * A GET route: `path` matched against the pathname, its named groups the params; the query string parsed by the
     * read's schema in `QUERIES` before `serve` runs, refused as `invalid` when it doesn't parse, and ignored by a route
     * that declares none. An entry is the API read it `read`s, a name of `Reads` or `QUERIES`, or says its `kind`.
     */
    type StreamDoc = { description: string; read?: string; message?: object }

    type ReadRoute = {
      path: RegExp
      query?: z.ZodType
      stream?: StreamDoc
      serve(served: Served<z.ZodType>): unknown
    }

    type Read = ReadRoute & ({ read: ReadName } | { kind: Kind })

    type ReadEntry<Q extends z.ZodType> = { path: RegExp; serve(served: Served<Q>): unknown }

    const apiRead = <N extends ReadName>(name: N, entry: ReadEntry<QueryOf<N>>): ReadRoute & { read: N } => ({
      ...entry,
      read: name,
      query: name in QUERIES ? QUERIES[name as Query] : undefined,
    })

    const plain = (kind: Kind, entry: ReadEntry<z.ZodUnknown>): ReadRoute & { kind: Kind } => ({ ...entry, kind })

    const streamRead = (stream: StreamDoc, entry: ReadEntry<z.ZodUnknown>): ReadRoute & { kind: 'stream' } => ({ ...plain('stream', entry), kind: 'stream', stream })

    const json = (res: http.ServerResponse, body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))

    /** Every GET route but the served files: reads, the streams, the renderers and the floors' pages. */
    const READS = [
      plain('page', { path: /^\/$/, serve: ({ res, search }) => home(res, search) }),
      streamRead({
        description: 'The whole system as one view, again whenever it changes.',
        read: "GET /board is SSE, one `data:` line per change, each a `message`: an envelope, the board is its `board` field. A page names itself with `?viewer=<id>`, which `viewer/active` then takes, and its renderer with `&renderer=<name>` (1.129). One event: `curl -sN -m 2 <address>/board | grep -m1 '^data:' | cut -c7-`",
        message: boardSchema,
      }, { path: /^\/board$/, serve: ({ req, res, search }) => {
        const query = new URLSearchParams(search)
        const viewer = query.get('viewer') ?? undefined
        const renderer = query.get('renderer') ?? undefined
        if (viewer !== undefined && !VIEWER_ID.test(viewer)) return fail(res, 'invalid', `viewer ${JSON.stringify(viewer)} is no viewer id: 8 to 64 letters, digits and dashes`)
        if (renderer !== undefined && (viewer === undefined || !VIEWER_RENDERER.test(renderer))) return fail(res, 'invalid', `renderer ${JSON.stringify(renderer)} names no renderer of a viewer: give viewer too, and a renderer's name`)
        return streamBoard(req, res, viewer === undefined ? undefined : { viewer, ...(renderer !== undefined && { renderer }) })
      } }),
      streamRead({ description: 'The screen, terminal and shell streams on one connection; POST /mux/watch {mux, key, path} adds one, /mux/unwatch {mux, key} drops it.' }, { path: /^\/mux$/, serve: ({ req, res }) => openMux(req, res) }),
      plain('schema', { path: /^\/schema$/, serve: ({ res }): void => void res.writeHead(200, { 'content-type': 'application/json' }).end(apiSchema()) }),
      apiRead('origins', { path: /^\/origins$/, serve: ({ res }) => origins(res) }),
      apiRead('extensions', {
        path: /^\/extensions$/,
        serve: ({ res }) => {
          const read = extensions.read()
          const cards = boardOf().floors.flatMap((f) => f.cards)
          json(res, { ...read, extensions: read.extensions.map((e) => ({ ...e, exempted: exemptionsBy(cards, e.provides) })) } satisfies Reads['extensions'])
        },
      }),
      apiRead('patterns', { path: /^\/patterns$/, serve: ({ res }) => json(res, readPatterns() satisfies Reads['patterns']) }),
      apiRead('renderers', { path: /^\/renderers$/, serve: ({ res }) => renderersRead(res) }),
      apiRead('archive/<project>', { path: /^\/archive\/(?<project>[\w-]+)$/, serve: ({ res, params }) => archive(res, params.project!) }),
      apiRead('conversations/<id>', { path: /^\/conversations\/(?<id>[\w-]+)$/, serve: ({ res, params }) => conversations(res, params.id!) }),
      apiRead('reviews/<project>', { path: /^\/reviews\/(?<project>[\w-]+)$/, serve: ({ req, res, params }) => legacyRead(req, res, 'reviews/<project>', params, {}) }),
      apiRead('changes/<id>', { path: /^\/changes\/(?<id>[\w-]+)$/, serve: ({ res, params, query }) => changes(res, params.id!, query) }),
      plain('stream', { path: /^\/screen\/(?<id>[\w-]+)$/, serve: ({ req, res, params }) => streamScreen(params.id!, req, res) }),
      plain('stream', { path: /^\/shell\/(?<id>[\w-]+)$/, serve: ({ req, res, params }) => streamShell(params.id!, req, res) }),
      apiRead('stats', { path: /^\/stats$/, serve: ({ res, query }) => statsRead(res, query) }),
      apiRead('landing', { path: /^\/landing$/, serve: ({ res, query }) => landingRead(res, query) }),
      apiRead('runs/<project>', { path: /^\/runs\/(?<project>[\w-]+)$/, serve: ({ req, res, params, query }) => legacyRead(req, res, 'runs/<project>', params, query) }),
      apiRead('probe/<name>', { path: /^\/probe\/(?<name>[\w-]+)$/, serve: ({ req, res, params, query }) => legacyRead(req, res, 'probe/<name>', params, query) }),
      apiRead('collection/<project>/<collection>/<item>', { path: /^\/collection\/(?<project>[\w-]+)\/(?<collection>[\w-]+)\/(?<item>[^/]+)$/, serve: ({ req, res, params }) => collectionItem(req, res, params.project!, params.collection!, params.item!) }),
      apiRead('shelf/<project>/<n>', { path: /^\/shelf\/(?<project>[\w-]+)\/(?<n>\d+)$/, serve: ({ req, res, params }) => shelf(req, res, params.project!, Number(params.n), undefined) }),
      apiRead('shelf/<project>/<n>/<file>', { path: /^\/shelf\/(?<project>[\w-]+)\/(?<n>\d+)\/(?<file>.+)$/, serve: ({ req, res, params }) => shelf(req, res, params.project!, Number(params.n), params.file) }),
      plain('page', { path: /^\/run\/(?<project>[\w-]+)\/(?<n>\d+)(?:\/(?<file>.+))?$/, serve: ({ res, params, search }) => run(res, params.project!, Number(params.n), params.file, search) }),
      plain('page', { path: /^\/r\/(?<name>[\w-]+)(?:\/(?<file>.*))?$/, serve: ({ res, params, search }) => rendered(res, params.name!, params.file, search) }),
      plain('page', { path: /^\/x\/(?<cap>[a-z][a-z0-9-]*)\/(?<file>.+)$/, serve: ({ res, params }) => clientFile(res, params.cap!, params.file!, {}) }),
      apiRead('shown/<id>/<path>', { path: /^\/shown\/(?<id>[\w-]+)(?<path>\/.+)$/, serve: ({ req, res, params }) => shownFile(req, res, params.id!, params.path!) }),
    ] as const satisfies readonly Read[]

    /** A route's pattern as a client reads it: its named groups as `{name}`, an optional tail in brackets. */
    const pathOf = (path: RegExp) =>
      path.source
        .replace(/^\^|\$$/g, '')
        .replace(/\(\?:\\\/\(\?<(\w+)>[^()]*\)\)\?/g, '[/{$1}]')
        .replace(/\(\?<(\w+)>[^()]*\)/g, '{$1}')
        .replaceAll('\\/', '/')

    const keyOf = (entry: Read) => ('read' in entry ? entry.read : pathOf(entry.path).slice(1).replace(/\{(\w+)\}/g, '<$1>') || '/')

    /** The streams: each declared on its `READS` entry, and the one only `/mux` reaches. */
    const describeStreams = (reads: readonly Read[]): Record<string, StreamDoc> => ({
      ...Object.fromEntries(reads.flatMap((entry) => (entry.stream ? [[keyOf(entry), entry.stream]] : []))),
      'terminal/<id>': { description: 'The screen stream as an interactive terminal opens it (`TerminalMsg`).' },
    })

    /** Every entry of `READS` as `{ path, kind, query? }`, keyed by its API read or, for a route that is none, by its path. */
    const describeReads = (reads: readonly Read[]) =>
      Object.fromEntries(
        reads.map((entry) => {
          const path = pathOf(entry.path)
          const kind = 'read' in entry ? 'json' : entry.kind
          return [keyOf(entry), { path, kind, ...(entry.query && { query: z.toJSONSchema(entry.query, { io: 'input' }) }) }]
        }),
      )

    const coreVerbs = Object.fromEntries(Object.entries(VERBS).map(([verb, { input, reply }]) => [verb, { input: z.toJSONSchema(input, { io: 'input' }), reply: z.toJSONSchema(reply) }]))
    const coreReads = describeReads(READS)
    const streams = describeStreams(READS)
    const error = z.toJSONSchema(ApiErrorSchema)
    const coreHooks = Object.fromEntries(
      Object.entries(HOOKS).map(([name, { payload, answer, combine, required, absent, field, deadline, description, since }]) => [
        `tower/${name}`,
        {
          payload: z.toJSONSchema(payload),
          answer: z.toJSONSchema(answer),
          failure: required ? 'refuses' : 'reported',
          combine,
          ...(required && { required }),
          ...(absent && { absent }),
          ...(field && { field }),
          deadline: deadline ?? HOOK_DEADLINE,
          description,
          'x-since': since,
        },
      ]),
    )

    /** What a manifest says of a verb or read beside its schemas: its scope and words, and that it is on its way out. */
    const declared = ({ scope, description, deprecated }: { scope: string; description?: string; deprecated?: Deprecated }) => ({
      scope,
      ...(description !== undefined && { description }),
      ...(deprecated && { deprecated }),
    })

    /** The contract for renderers in any language: the core's verbs and reads, and each running extension's by qualified name. */
    const apiSchema = (): string => {
      const accepted = extensions.accepted()
      return JSON.stringify({
        v: API_VERSION,
        verbs: {
          ...coreVerbs,
          ...Object.fromEntries(
            accepted.flatMap((a) => Object.entries(a.manifest.verbs ?? {}).map(([name, v]) => [`${a.provides}/${name}`, { input: v.input, reply: v.reply, ...declared(v), ...(v.words && { words: v.words }) }])),
          ),
        },
        reads: {
          ...coreReads,
          ...Object.fromEntries(
            accepted.flatMap((a) =>
              Object.entries(a.manifest.reads ?? {}).map(([name, r]) => [
                `${a.provides}/${name}`,
                {
                  path: `/${a.provides}/${name.replace(/<(\w+)(\.\.\.)?>/g, '{$1$2}')}`,
                  kind: r.serves ?? 'json',
                  ...(r.query && { query: r.query }),
                  ...(r.reply && { reply: r.reply }),
                  ...declared(r),
                },
              ]),
            ),
          ),
        },
        hooks: {
          ...coreHooks,
          ...Object.fromEntries(accepted.flatMap((a) => Object.entries(a.manifest.hooks ?? {}).map(([name, hook]) => [`${a.provides}/${name}`, hook]))),
        },
        flows: FLOWS,
        streams,
        error,
        extension: MANIFEST_SCHEMA,
        cli: { regions: CLI_REGIONS },
      })
    }

    type ServedReads = Extract<(typeof READS)[number], { read: ReadName }>['read']

    /** Types only when every read the API declares has an entry in `READS`; otherwise the missing reads are the type. */
    const everyReadServed: Exclude<ReadName, ServedReads> extends never ? true : Exclude<ReadName, ServedReads> = true
    void everyReadServed

    /**
     * The first of `READS` whose path matches the pathname, its params decoded and its query parsed; else the read of the
     * extension whose capability the path's first segment names: its reply, or the file it answers, served sandboxed.
     */
    async function route(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, search: string) {
      for (const entry of READS) {
        const match = entry.path.exec(pathname)
        if (!match) continue
        const params = Object.fromEntries(Object.entries(match.groups ?? {}).map(([name, value]) => [name, value === undefined ? undefined : decodeURIComponent(value)]))
        const query = (entry.query ?? z.unknown()).safeParse(Object.fromEntries(new URLSearchParams(search)))
        if (!query.success) return fail(res, 'invalid', z.prettifyError(query.error))
        return entry.serve({ req, res, params, query: query.data, search })
      }
      const [, cap, ...rest] = pathname.split('/')
      const found = rest.length ? dispatch.readAt(cap, rest.join('/')) : undefined
      if (!found) return fail(res, 'not_found', `Nothing at "${pathname}"`)
      if ('t' in found) return send(res, found)
      deprecate(res, dispatch.deprecationOf(cap, found.name))
      const answer = await dispatch.read(cap, found.name, found.params, Object.fromEntries(new URLSearchParams(search)), callerOf(req))
      if (found.serves === 'file' && !isApiError(answer)) return serveSandboxed(req, res, (answer as { file: string }).file)
      send(res, answer)
    }

    /**
     * A core read by its name in `READS` (`conversations/<id>`), for an extension's `ctx.read`: served as over HTTP, its
     * body taken back as JSON (an `ApiError` when it failed), or as text for a file.
     */
    const read = (name: string, params: Record<string, string>, query: Record<string, string>, caller: Caller): Promise<unknown> => {
      const deep = tooDeep(caller, `tower/${name}`)
      if (deep) return Promise.resolve(apiError('refused', deep))
      const entry = READS.find((e): e is Extract<(typeof READS)[number], { read: ReadName }> => 'read' in e && e.read === name)
      if (!entry) return Promise.resolve(apiError('not_found', `The core has no read "${name}": \`tower api\` lists them`))
      const parsed = (entry.query ?? z.unknown()).safeParse(query)
      if (!parsed.success) return Promise.resolve(apiError('invalid', z.prettifyError(parsed.error)))
      return new Promise((resolve) => {
        let json = false
        const taken = {
          headersSent: false,
          setHeader: () => taken,
          writeHead: (_status: number, headers?: http.OutgoingHttpHeaders) => ((json = String(headers?.['content-type'] ?? '').startsWith('application/json')), taken),
          end: (body?: string | Buffer) => resolve(json ? JSON.parse(String(body)) : String(body ?? '')),
        }
        const served = { req: undefined as unknown as http.IncomingMessage, res: taken as unknown as http.ServerResponse, params, query: parsed.data, search: '' }
        Promise.resolve((entry.serve as (served: Served<z.ZodType>) => unknown)(served)).catch((err) => resolve(errorOf(err)))
      })
    }

    async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
      if (!isFromTower(req)) {
        res.writeHead(403).end()
        return
      }
      const url = req.url ?? '/'
      try {
        decodeURIComponent(url.split('?')[0])
      } catch {
        return fail(res, 'invalid', 'The path has a malformed % escape')
      }
      const asset = STATIC[url]
      if (req.method === 'GET' && asset) {
        res.writeHead(200, { 'content-type': asset[1] }).end(readFileSync(asset[0]))
        return
      }
      if (req.method === 'GET' && url.split('?')[0] === '/tower.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(towerClient())
      if (req.method === 'GET' && (MODULES[url] || /^\/(design\.css|fonts\/)/.test(url))) return design(res, url)
      const legacy = legacyOf('module').find((e) => e.old === url)
      if (req.method === 'GET' && legacy) return legacyModule(res, legacy)
      const [pathname, search] = url.split('?')
      if (req.method === 'GET') return route(req, res, pathname, search === undefined ? '' : `?${search}`)
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

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(PORT, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })

    /** Every connection closed, its streams stopped with it, and every screen mirror dropped. */
    const stop = async () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()))
      server.closeAllConnections()
      for (const timer of stalls.values()) clearTimeout(timer)
      stalls.clear()
      await mirrors.stop()
      await closed
    }

    return { port: PORT, read, stop }
  },
  halt: ({ stop }) => stop(),
})
export type HttpResource = StartedResource<typeof httpServer>
