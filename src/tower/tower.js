/**
 * tower.js: the live board and the tower's verbs for a renderer page. Include it with
 *
 *   <script src="/tower.js"></script>
 *
 * and the page gets `window.tower`:
 *
 *   tower.subscribe((board, self) => draw(board))   called now (once the tower answers) and on every change; returns unsubscribe
 *   tower.onBoardError((err) => show(err.message))  called now and whenever the tower can't build the board, with an Error whose
 *                                                   `code` is config (until the user fixes the config) or internal; the next
 *                                                   board, through `subscribe`, means it recovered; returns unsubscribe
 *   await tower.conversations(sessionId)            the saved conversations of every session its worker ran as up to it, its own first,
 *                                                   then each earlier session's, latest first: each with its `session` ({id, callsign,
 *                                                   startedAt}), latest prompt and answer, and `turns`, the last few (config
 *                                                   `brief.pairs`) oldest first, in full
 *   await tower.archive(project)                    the project's cards the board leaves out, newest first: read when a past list opens,
 *                                                   and again when `board.archiveAt` or the floor's `archived` moves
 *   await tower.stats({ from, to, bucket, project })  stats over every session's log (`/stats`): every field optional,
 *                                                   times in epoch ms, `bucket` 'hour' or 'day'; the last seven local days by day
 *   await tower.probe(name, { last })               one probe's status, as `board.probes` has it, and its latest `last` reads (20
 *                                                   unless given), newest first (`/probe/<name>`); deprecated since 1.90:
 *                                                   `get('quota/reads')` and the board's `x.quota`
 *   await tower.landing({ project, branch })         what landing changed on a worktree's or kept branch's `branch` (`/landing`), when
 *                                                   the board says it is carried: per repo, each commit landed edited, its copy and
 *                                                   `git range-diff` between them
 *   await tower.renderer()                          this page's renderer, when it is served as one at `/r/<name>/`, on its own or framed
 *                                                   on a shelf: { name, root, entry, available, settings }, `settings` what the
 *                                                   config keeps for it, and what its renderer.json declares (regions, kit,
 *                                                   keeps, layout); null for any other page
 *   await tower.get('origins')                      any read of the API: JSON as data, a shelf file as text
 *   await tower.get('patterns')                     what users found doing with the tower, one story each (`/capabilities.js` has
 *                                                   the capabilities, and the tips a renderer shows of both)
 *   await tower.get('extensions')                   every extension the tower found, as board.extensions shows it, and its
 *                                                   resources as braided orders them: { extensions, topology, chains, answers, composites, launchers },
 *                                                   `topology.mermaid` the graph
 *   await tower.text('collection/<p>/<c>/<item>')   any read of the API as text, whatever its type
 *   await tower.blob('shown/<id>/<path>')           any read of the API as a Blob of its type, such as an image to draw
 *   await tower.call('spawn', { project, cwd })     any command of the API: spawn, resume, submit, resize, kill, reap, open, shell/*, collection/*
 *                                                   a failure rejects with an Error whose `code` is invalid, not_found, refused or unavailable
 *   await tower.call('reveal', { path })            a path the system names (a project's, the system root's, a shown file) in Finder,
 *   await tower.call('edit', { path, line })        or in the user's editor, a file at `line` if given
 *   await tower.run(callOf(card, 'resume'))         a call the board offers (`callOf`, /cards.js), with the fields the user supplies: run(callOf(floor, 'spawn'), { cwd })
 *   tower.keys(id, data) / tower.shellKeys(id, data)  keystrokes, delivered in order
 *   tower.watch('screen/<id>', (msg) => …)          a stream: `screen/<id>`, `terminal/<id>` or `shell/<id>`, ending at `x` or `error`; returns unwatch
 *   tower.ui('select', { id }) / ('home') / ('shelf', { project, n })   the framing tower's own view, when framed
 *   tower.ui('go', { location }) / ('display', { subject, view? })      a location (/views.js), or a subject or its key shown
 *                                                   where the framing page's layout puts it
 *   tower.relay(frame, url, { self, ui, stored })   a shelf page framed by this page, given the board and the API: `frame` an
 *                                                   iframe sandboxed without allow-same-origin, loaded with `url`; `self` the
 *                                                   entry it is ({ project, n }); `ui` this page's `select`, `home`, `shelf`, `go`, `display`;
 *                                                   `stored(key)` called on each key it sets in tower.store; returns { close }
 *   tower.prefs.get()                               the viewer's appearance (src/shared/prefs.ts): scheme, ui, display and mono
 *                                                   faces, termSize, motion, contrast, scale; on this page's root before it paints
 *   tower.prefs.set({ mono: 'Fira Code' })          change some of it, for every page of theirs, through the tower when framed
 *   tower.prefs.on((prefs) => …)                    called whenever it changes; returns unsubscribe
 *   tower.prefs.attributes()                        the root's attributes as html, for a document drawn in a frame without
 *                                                   tower.js: `<html ${tower.prefs.attributes()}>`
 *   tower.scheme() / tower.onScheme((scheme) => …)   the colour scheme drawn, 'light' or 'dark', the system's when the viewer
 *                                                   chose none; returns unsubscribe
 *   tower.schemeChoice() / tower.chooseScheme(c)    @deprecated: tower.prefs.get().scheme and tower.prefs.set({ scheme })
 *   tower.remember(value) / await tower.recall()    a value kept for this page in the viewer's browser (null if none)
 *   tower.store.set(key, value) / await tower.store.get(key)   a value kept in the viewer's browser under a key every page
 *                                                   shares, the tower page included (null if none), such as the files viewed in a diff
 *   tower.store.on((key) => …)                      called on each key this page sets, a page it relays included; returns unsubscribe
 *   tower.framed                                    whether the page runs inside the tower
 *   tower.version                                   the API version this script speaks, `"<major>.<minor>"`, checked on every board
 *
 * A version is `<major>.<minor>`: a minor adds (a field, a verb, a read, a stream) and a major breaks (a rename, a
 * removal, a changed meaning). A board from a tower of another major, or of an older minor than this script's, stops
 * at the version check. A renderer kept apart from the tower names the version it was written against,
 *
 *   <script src="/tower.js?v=1.0"></script>
 *
 * and the script refuses to load into a tower of another major or an older minor; a page that names none moves with
 * the tower.
 *
 * `self` is `{ project, n }`: the page is the nth entry of that project's shelf (`undefined` on its own). `board`
 * is the Board of
 * src/bridge/board.ts. The API and the wire protocol are src/shared/shelf-page.ts.
 *
 * Framed in the tower (a shelf entry), the page speaks to the tower over `postMessage` and the tower relays. A
 * renderer at `/r/<name>/`, or a shelf entry opened at `/run/<project>/<n>`, runs at the tower's origin and calls the
 * routes directly, every stream multiplexed on one connection.
 */
;(() => {
  /**
   * @typedef {import('../shared/shelf-page.ts').BoardError} BoardError
   * @typedef {import('../shared/shelf-page.ts').BoardMsg} BoardMsg
   * @typedef {import('../shared/shelf-page.ts').FromPage} FromPage
   * @typedef {import('../shared/shelf-page.ts').ShelfSelf} ShelfSelf
   * @typedef {import('../shared/shelf-page.ts').StreamMsg} StreamMsg
   * @typedef {import('../shared/shelf-page.ts').ToPage} ToPage
   * @typedef {import('../shared/shelf-page.ts').Tower} Tower
   * @typedef {import('../bridge/board.ts').Board} Board
   * @typedef {import('../shared/prefs.ts').Prefs} Prefs
   */
  /** An API error as an `Error` with its code. @typedef {Error & { code: BoardError['code'] }} Failure */
  /** The tower's latest word on the board. @typedef {{ board: Board, self: ShelfSelf | undefined, error?: undefined } | { error: Failure, board?: undefined, self?: undefined }} Latest */
  /**
   * How the page reaches the tower: the routes at its origin, or the framing tower over `postMessage`.
   * @typedef {{
   *   board(): unknown,
   *   call: Tower['call'],
   *   get(path: string): Promise<any>,
   *   text(path: string): Promise<string>,
   *   blob(path: string): Promise<Blob>,
   *   watch(path: string, fn: (msg: StreamMsg) => void): () => void,
   *   ui: Tower['ui'],
   *   setPrefs(patch: Partial<Prefs>): void,
   *   remember(value: unknown): void,
   *   recall(): Promise<unknown>,
   *   store: Omit<Tower['store'], 'on'>,
   * }} Api
   */
  /** A message of `/mux`: the connection's id, then each watched stream's messages by key. @typedef {{ t: 'mux', id: string } | { t?: undefined, key: string, data: StreamMsg }} MuxMsg */
  /** A page's message, with the token its relay knows it by. @typedef {FromPage & { token: string }} PageMsg */
  /** A message that awaits an answer, before `request` gives it its id. @typedef {FromPage extends infer M ? M extends { id: number } ? Omit<M, 'id'> : never : never} Request */

  /** Filled in by the tower as it serves this script, from src/shared/api.ts. @type {typeof import('../shared/api.ts').API_VERSION} */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const VERSION = API_VERSION
  /**
   * The appearance a viewer starts from and the families CSS names by keyword, from src/shared/prefs.ts; the shipped
   * faces each stack ends in, from src/shared/design.ts.
   * @type {Prefs}
   */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const PREFS_DEFAULT = PREFS_DEFAULT
  /** @type {typeof import('../shared/prefs.ts').PREF_CHOICES} */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const PREF_CHOICES = PREF_CHOICES
  /** @type {typeof import('../shared/prefs.ts').TERM_SIZES} */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const TERM_SIZES = TERM_SIZES
  /** @type {typeof import('../shared/prefs.ts').GENERIC_FACES} */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const GENERIC_FACES = GENERIC_FACES
  /** @type {typeof import('../shared/design.ts').type} */
  // @ts-expect-error a name src/tower/served.ts replaces with its value
  const FACES = FACES
  /** @param {string} text */
  const versionOf = (text) => {
    const match = /^(\d+)\.(\d+)$/.exec(text)
    if (!match) throw new Error(`tower.js: "${text}" is not an API version: <major>.<minor>`)
    return { major: Number(match[1]), minor: Number(match[2]) }
  }
  /**
   * Whether a speaker of `speaks` serves a reader written against `wants`: the same major, at least its minor.
   * @param {string} speaks
   * @param {string} wants
   */
  const serves = (speaks, wants) => {
    const [s, w] = [versionOf(speaks), versionOf(wants)]
    return s.major === w.major && s.minor >= w.minor
  }
  const pinned = document.currentScript && new URL(/** @type {HTMLScriptElement} */ (document.currentScript).src).searchParams.get('v')
  if (pinned && !serves(VERSION, pinned)) throw new Error(`tower.js: the tower speaks version ${VERSION}, this page was written against ${pinned}`)
  /** Relayed: framed at an origin of its own, as the tower frames a shelf page. A frame at the tower's origin calls the routes itself. */
  const framed = window.parent !== window && window.origin !== new URL(/** @type {HTMLScriptElement} */ (document.currentScript).src).origin
  if (!framed && window.origin === 'null') throw new Error('tower.js: open this page from its shelf inside the tower, at /run/<project>/<n>, or declare it as a renderer')

  const LOST = 'The tower stopped answering: reconnecting as soon as it is back (tower up starts it).'
  /** How long to wait before opening a stream the browser gave up on, as it does when the tower answers with an error. */
  const REOPEN_MS = 3000

  /** @type {Set<(board: Board, self: ShelfSelf | undefined) => void>} */
  const subscribers = new Set()
  /** @type {Set<(err: Failure) => void>} */
  const errorWatchers = new Set()
  /** The tower's latest word on the board: `{ board, self }`, or `{ error }` while it can't build one. @type {Latest | undefined} */
  let latest

  /**
   * A `/board` message: the board, or why the tower can't build it.
   * @param {BoardMsg} msg
   * @param {ShelfSelf | undefined} self
   */
  const publish = (msg, self) => {
    checkVersion(msg.v)
    if ('error' in msg) {
      latest = { error: failure(msg.error.message, msg.error.code) }
      for (const fn of errorWatchers) fn(latest.error)
      return
    }
    latest = { board: msg.board, self }
    for (const fn of subscribers) fn(msg.board, self)
  }

  /** The tower stopped answering: told once, until a board comes back. */
  const lost = () => {
    if (latest?.error?.code === 'disconnected') return
    latest = { error: failure(LOST, 'disconnected') }
    for (const fn of errorWatchers) fn(latest.error)
  }

  /** @param {string} v */
  const checkVersion = (v) => {
    if (!serves(v, VERSION)) throw new Error(`tower.js: the tower speaks version ${v}, this page version ${VERSION}`)
  }

  /**
   * An API error as an `Error` whose `code` says what went wrong: invalid, not_found, refused or unavailable.
   * @param {string} message
   * @param {BoardError['code']} code
   * @returns {Failure}
   */
  const failure = (message, code) => Object.assign(new Error(message), { code })

  /** @param {Response} res */
  const isJson = (res) => res.headers.get('content-type')?.startsWith('application/json')

  /**
   * A JSON answer as data, anything else (a shelf's markdown) as text.
   * @param {Response} res
   * @returns {Promise<any>}
   */
  const answer = async (res) => {
    const reply = isJson(res) ? await res.json().catch(() => undefined) : await res.text()
    if (reply?.t === 'error') throw failure(reply.message, reply.code)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return reply
  }

  /** A successful answer as text, whatever its type; a failure as `answer` throws it. @param {Response} res @returns {Promise<string>} */
  const textOf = (res) => (res.ok ? res.text() : answer(res))
  /** @param {Response} res @returns {Promise<Blob>} */
  const blobOf = (res) => (res.ok ? res.blob() : answer(res))

  /** At the tower's origin: the board on first subscribe, and every stream on one connection (`/mux`). @returns {Api} */
  const viaRoutes = () => {
    const [, kind, name, n] = location.pathname.split('/')
    const self = kind === 'run' ? { project: name, n: Number(n) } : undefined
    /** @param {string} verb @param {unknown} body */
    const call = (verb, body) =>
      fetch(`/${verb}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(answer)
    /** @type {Map<string, { path: string, fn: (msg: StreamMsg) => void }>} */
    const watchers = new Map()
    /** @type {string | undefined} */
    let mux
    let keys = 0
    /** @type {EventSource | undefined} */
    let source
    /** The watch in flight per key: an unwatch is sent once it has settled, so the tower never drops a stream before it holds it. @type {Map<string, Promise<unknown>>} */
    const settling = new Map()
    /** @param {string} key */
    const watchOn = (key) => {
      const settled = call('mux/watch', { mux, key, path: /** @type {{ path: string }} */ (watchers.get(key)).path }).catch((err) => watchers.get(key)?.fn({ t: 'error', message: err.message }))
      settling.set(key, settled)
      return settled
    }
    /**
     * An EventSource reconnects on its own after a dropped connection, and gives up after an error answer: `onLost`
     * hears both, and a stream given up on is opened again.
     * @template T
     * @param {string} path
     * @param {(msg: T) => void} onMessage
     * @param {() => void} onLost
     */
    const stream = (path, onMessage, onLost) => {
      const open = () => {
        const es = new EventSource(path)
        es.onmessage = (m) => onMessage(JSON.parse(m.data))
        es.onerror = () => (onLost(), es.readyState === EventSource.CLOSED && setTimeout(open, REOPEN_MS))
        return es
      }
      return open()
    }
    /** A new mux id means the connection came back, as after a tower restart: every stream starts over with a snapshot. */
    const connect = () => {
      source = stream('/mux', (/** @type {MuxMsg} */ msg) => {
        if (msg.t === 'mux') return (mux = msg.id, [...watchers.keys()].forEach(watchOn))
        watchers.get(msg.key)?.fn(msg.data)
      }, () => (mux = undefined))
    }
    return {
      board: () => stream('/board', (/** @type {BoardMsg} */ msg) => publish(msg, self), lost),
      call,
      get: (path) => fetch(`/${path}`).then(answer),
      text: (path) => fetch(`/${path}`).then(textOf),
      blob: (path) => fetch(`/${path}`).then(blobOf),
      watch: (path, fn) => {
        const key = String(++keys)
        watchers.set(key, { path, fn })
        if (!source) connect()
        if (mux) watchOn(key)
        return () => {
          if (!watchers.delete(key)) return
          const unwatchOn = mux
          const settled = settling.get(key)
          settling.delete(key)
          if (unwatchOn) (settled ?? Promise.resolve()).then(() => call('mux/unwatch', { mux: unwatchOn, key })).catch(() => {})
        }
      },
      ui: () => {},
      setPrefs: (patch) => {
        const next = normalized({ ...prefs, ...patch })
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch {}
        applyPrefs(next)
      },
      remember: (value) => {
        try { localStorage.setItem(`tower-page:${location.pathname}`, JSON.stringify(value)) } catch {}
      },
      recall: async () => {
        try { return JSON.parse(localStorage.getItem(`tower-page:${location.pathname}`) ?? 'null') } catch { return null }
      },
      store: {
        set: (key, value) => {
          try { localStorage.setItem(`tower-store:${key}`, JSON.stringify(value)) } catch {}
        },
        get: async (key) => {
          try { return JSON.parse(localStorage.getItem(`tower-store:${key}`) ?? 'null') } catch { return null }
        },
      },
    }
  }

  /** @returns {Api} */
  const viaTower = () => {
    /** @type {Map<number, { resolve: (data: unknown) => void, reject: (err: Failure) => void }>} */
    const pending = new Map()
    /** @type {Map<number, (msg: StreamMsg) => void>} */
    const watchers = new Map()
    let ids = 0
    /** The tower framing this page put a token in its URL; every message carries it back. */
    const token = new URLSearchParams(location.search).get('tower')
    /** @param {FromPage} msg */
    const send = (msg) => window.parent.postMessage({ ...msg, token }, '*')
    /** @param {Request} msg @returns {Promise<any>} */
    const request = (msg) =>
      new Promise((resolve, reject) => {
        const id = ++ids
        pending.set(id, { resolve, reject })
        send({ ...msg, id })
      })
    addEventListener('message', (e) => {
      if (e.source !== window.parent) return
      /** @type {ToPage} */
      const msg = e.data
      if (msg.t === 'board') publish(msg, msg.self)
      if (msg.t === 'event') watchers.get(msg.id)?.(msg.data)
      if (msg.t === 'answer') {
        const { resolve, reject } = /** @type {NonNullable<ReturnType<typeof pending.get>>} */ (pending.get(msg.id))
        pending.delete(msg.id)
        if ('error' in msg) reject(failure(msg.error, msg.code))
        else resolve(msg.data)
      }
    })
    send({ t: 'hello' })
    return {
      board: () => {},
      call: (verb, body) => request({ t: 'call', verb, body }),
      get: (path) => request({ t: 'get', path }),
      text: (path) => request({ t: 'text', path }),
      blob: (path) => request({ t: 'blob', path }),
      watch: (path, fn) => {
        const id = ++ids
        watchers.set(id, fn)
        send({ t: 'watch', id, path })
        return () => (watchers.delete(id), send({ t: 'unwatch', id }))
      },
      ui: (verb, fields) => send(/** @type {FromPage} */ ({ t: 'tower', verb, ...fields })),
      setPrefs: (patch) => send({ t: 'tower', verb: 'prefs', prefs: patch }),
      remember: (value) => send({ t: 'remember', value }),
      recall: () => request({ t: 'recall' }),
      store: {
        set: (key, value) => send({ t: 'store', key, value }),
        get: (key) => request({ t: 'stored', key }),
      },
    }
  }

  /**
   * The viewer's appearance on the root, which `/design.css` reads: the scheme as `data-scheme`, motion and contrast
   * as `data-motion` and `data-contrast` when the viewer overrides the system, each face they picked at the head
   * of its stack (`--ui`, `--display`, `--mono`), and the text size as `--scale`. Framed, the tower sends the record; at the tower's origin it is the
   * one the browser keeps under `PREFS_KEY`, shared by every tab.
   */
  const root = document.documentElement
  const darkSystem = matchMedia('(prefers-color-scheme: dark)')
  /** @type {Set<(prefs: Prefs) => void>} */
  const prefsWatchers = new Set()
  /** @type {Set<(scheme: 'light' | 'dark') => void>} */
  const schemeWatchers = new Set()
  /** A face's name as a CSS font family, as `faceFamily` of src/shared/prefs.ts writes it: a generic family's unquoted. @param {string} name */
  const family = (name) => (GENERIC_FACES.includes(name) ? name : `"${name.replace(/["\\]/g, '\\$&')}"`)
  /** @param {Prefs} prefs @param {Face} face */
  const stack = (prefs, face) => `${family(prefs[face])}, ${FACES[face]}`
  /** @typedef {'ui' | 'display' | 'mono'} Face */
  /** @type {Face[]} */
  const FACE_KEYS = ['ui', 'display', 'mono']
  let prefs = PREFS_DEFAULT
  /** @returns {'light' | 'dark'} */
  const scheme = () => prefs.scheme || (darkSystem.matches ? 'dark' : 'light')
  const announceScheme = () => schemeWatchers.forEach((fn) => fn(scheme()))
  /**
   * A record as the page takes it in, whoever wrote it (storage, a framed page, `set`): each choice one of its values,
   * each face a name, the terminal's size a whole number in its range; anything else is the default.
   * @param {any} raw
   * @returns {Prefs}
   */
  const normalized = (raw) => {
    /** @param {keyof Prefs} key @param {(v: unknown) => boolean} ok */
    const pick = (key, ok) => (ok(raw?.[key]) ? raw[key] : PREFS_DEFAULT[key])
    const size = Math.round(Number(raw?.termSize))
    return /** @type {Prefs} */ ({
      ...Object.fromEntries(Object.entries(PREF_CHOICES).map(([key, values]) => [key, pick(/** @type {keyof Prefs} */ (key), (v) => /** @type {unknown[]} */ (values).includes(v))])),
      ...Object.fromEntries(FACE_KEYS.map((face) => [face, pick(face, (v) => typeof v === 'string').trim()])),
      termSize: Number.isFinite(size) ? Math.min(TERM_SIZES.max, Math.max(TERM_SIZES.min, size)) : PREFS_DEFAULT.termSize,
    })
  }
  /** @param {unknown} next */
  const applyPrefs = (next) => {
    const was = scheme()
    prefs = normalized(next)
    root.dataset.scheme = prefs.scheme
    for (const face of FACE_KEYS) prefs[face] ? root.style.setProperty(`--${face}`, stack(prefs, face)) : root.style.removeProperty(`--${face}`)
    for (const key of /** @type {const} */ (['motion', 'contrast'])) prefs[key] ? (root.dataset[key] = prefs[key]) : delete root.dataset[key]
    scaled() ? root.style.setProperty('--scale', scaled()) : root.style.removeProperty('--scale')
    prefsWatchers.forEach((fn) => fn(prefs))
    if (scheme() !== was) announceScheme()
  }
  /** The root's text size as a factor of the browser's, read by `/design.css` as `--scale`; none at 100%. */
  const scaled = () => (prefs.scale === PREFS_DEFAULT.scale ? '' : String(prefs.scale / 100))
  /** @param {string} text */
  const escAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const attributes = () => {
    const faces = [...FACE_KEYS.filter((face) => prefs[face]).map((face) => `--${face}: ${stack(prefs, face)};`), ...(scaled() ? [`--scale: ${scaled()};`] : [])].join(' ')
    const data = /** @type {const} */ (['motion', 'contrast']).filter((key) => prefs[key]).map((key) => ` data-${key}="${escAttr(prefs[key])}"`).join('')
    return `data-scheme="${escAttr(scheme())}"${data}${faces ? ` style="${escAttr(faces)}"` : ''}`
  }
  darkSystem.addEventListener('change', () => prefs.scheme || announceScheme())
  const PREFS_KEY = 'tower.prefs'
  /** Before `PREFS_KEY`, the scheme alone was kept under this key: a viewer's choice there carries over. */
  const SCHEME_KEY = 'tower.scheme'
  const kept = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
      return stored ?? { scheme: localStorage.getItem(SCHEME_KEY) ?? '' }
    } catch { return {} }
  }
  if (framed) {
    addEventListener('message', (e) => {
      if (e.source !== window.parent) return
      if (e.data.t === 'prefs') applyPrefs(e.data.prefs)
      if (e.data.t === 'scheme') applyPrefs({ ...prefs, scheme: e.data.scheme })
    })
  } else {
    applyPrefs(kept())
    addEventListener('storage', (e) => e.key === PREFS_KEY && applyPrefs(kept()))
  }

  const api = framed ? viaTower() : viaRoutes()
  /** A renderer's page is served below `/r/<name>/`, framed on a shelf or not: its name is in its own path. */
  const [, served, servedAs] = location.pathname.split('/')
  let listening = false
  const listen = () => listening || ((listening = true), api.board())

  /** A stream ends with its session's or shell's exit. @type {Tower['watch']} */
  const watch = (path, fn) => {
    const stop = api.watch(path, (msg) => {
      fn(msg)
      if (msg.t === 'x' || msg.t === 'error') stop()
    })
    return stop
  }

  /**
   * Each chunk is its own write, one at a time: Claude reads text and Enter arriving in one write as a paste.
   * @param {'keys' | 'shell/keys'} verb
   * @returns {(id: string, data: string) => void}
   */
  const keySender = (verb) => {
    /** @type {Promise<unknown>} */
    let queue = Promise.resolve()
    return (id, data) => (queue = queue.then(() => api.call(verb, { id, data })).catch((err) => console.error(`tower.js ${verb}:`, err)))
  }

  /** @type {Set<(key: string) => void>} */
  const storeWatchers = new Set()
  /** `tower.store`, telling its watchers each key this page sets, a framed page's through `relay` included. @type {import('../shared/shelf-page.ts').Tower['store']} */
  const store = {
    set: (key, value) => (api.store.set(key, value), storeWatchers.forEach((fn) => fn(key))),
    get: api.store.get,
    on(fn) {
      storeWatchers.add(fn)
      return () => storeWatchers.delete(fn)
    },
  }

  /**
   * A shelf page framed by this page, given the board and the API over `postMessage` (src/shared/shelf-page.ts). The
   * frame loads `url` with a token new to this relay, and the page sends it with every message: a document the frame
   * navigates to never has it. Nothing is sent until the page says hello; a frame that loads without saying hello
   * holds another document, and the relay pauses until one does. `self` is the entry the page is; `ui` moves this
   * page's own view (`select`, `home`, `shelf`); `stored` hears each key the page sets in `tower.store`.
   * @type {Tower['relay']}
   */
  const relay = (frame, url, { self, ui, stored }) => {
    const token = crypto.randomUUID()
    let open = true
    let paired = false
    let helloSinceLoad = false
    /** @type {Map<number, () => void>} */
    const watches = new Map()
    const closeWatches = () => {
      for (const unwatch of watches.values()) unwatch()
      watches.clear()
    }
    /** @param {ToPage} msg */
    const toPage = (msg) => open && paired && frame.contentWindow?.postMessage(msg, '*')
    const sendBoard = () => {
      if (!latest) return
      /** @type {{ t: 'board', v: typeof VERSION, self: ShelfSelf }} */
      const msg = { t: 'board', v: VERSION, self }
      toPage(latest.error ? { ...msg, error: { code: latest.error.code, message: latest.error.message } } : { ...msg, board: latest.board })
    }
    const sendPrefs = () => toPage({ t: 'prefs', prefs })
    /** Where the page's remembered value is kept: one per shelf entry. */
    const memoryKey = `shelf-page:${self.project}/${self.n}`
    /** @type {Record<string, (msg: any) => unknown>} */
    const requests = {
      call: ({ verb, body }) => api.call(verb, body),
      get: ({ path }) => api.get(path),
      text: ({ path }) => api.text(path),
      blob: ({ path }) => api.blob(path),
      recall: () => {
        try { return JSON.parse(localStorage.getItem(memoryKey) ?? 'null') } catch { return null }
      },
      stored: ({ key }) => api.store.get(key),
    }
    /** @type {Record<string, (msg: any) => void>} */
    const towerVerbs = {
      ...ui,
      prefs: ({ prefs }) => api.setPrefs(prefs),
      /** @deprecated a page's tower.js asks with `prefs` */
      scheme: ({ scheme }) => api.setPrefs({ scheme }),
    }
    const onLoad = () => {
      if (!helloSinceLoad) (paired = false, closeWatches())
      helloSinceLoad = false
    }
    /** @param {MessageEvent} e */
    const onMessage = async (e) => {
      if (!e.source || e.source !== frame.contentWindow) return
      /** @type {PageMsg | undefined} */
      const msg = e.data
      if (msg?.token !== token) return
      if (msg.t === 'hello') return ((paired = true), (helloSinceLoad = true), closeWatches(), sendPrefs(), sendBoard())
      if (!paired || msg.t === 'key') return
      if (msg.t === 'tower') return towerVerbs[msg.verb]?.(msg)
      if (msg.t === 'remember') {
        try { localStorage.setItem(memoryKey, JSON.stringify(msg.value)) } catch {}
        return
      }
      if (msg.t === 'store') return (store.set(msg.key, msg.value), stored(msg.key))
      if (msg.t === 'watch') return watches.set(msg.id, watch(msg.path, (data) => toPage({ t: 'event', id: msg.id, data })))
      if (msg.t === 'unwatch') return (watches.get(msg.id)?.(), watches.delete(msg.id))
      /** @param {{ data: unknown } | { error: string, code: import('../shared/api.ts').ErrorCode }} reply */
      const answer = (reply) => toPage({ t: 'answer', id: msg.id, ...reply })
      try {
        answer({ data: await requests[msg.t](msg) })
      } catch (/** @type {any} */ err) {
        answer({ error: err.message, code: err.code })
      }
    }
    addEventListener('message', onMessage)
    frame.addEventListener('load', onLoad)
    const unsubscribe = [window.tower.subscribe(sendBoard), window.tower.onBoardError(sendBoard), window.tower.prefs.on(sendPrefs)]
    frame.src = `${url}?tower=${token}`
    return {
      close() {
        open = false
        removeEventListener('message', onMessage)
        frame.removeEventListener('load', onLoad)
        unsubscribe.forEach((fn) => fn())
        closeWatches()
      },
    }
  }

  window.tower = {
    framed,
    version: VERSION,
    subscribe(fn) {
      subscribers.add(fn)
      listen()
      if (latest?.board) fn(latest.board, latest.self)
      return () => subscribers.delete(fn)
    },
    onBoardError(fn) {
      errorWatchers.add(fn)
      listen()
      if (latest?.error) fn(latest.error)
      return () => errorWatchers.delete(fn)
    },
    conversations: (session) => api.get(`conversations/${encodeURIComponent(session)}`),
    archive: (project) => api.get(`archive/${encodeURIComponent(project)}`),
    renderer: async () => (served === 'r' ? (await api.get('renderers')).renderers.find((/** @type {import('../shared/model.ts').Renderer} */ r) => r.name === servedAs) ?? null : null),
    landing: (query) => api.get(`landing?${new URLSearchParams(query)}`),
    probe: (name, query = {}) => api.get(`probe/${encodeURIComponent(name)}?${new URLSearchParams(/** @type {string[][]} */ (Object.entries(query).filter(([, v]) => v !== undefined)))}`),
    stats: (query = {}) => api.get(`stats?${new URLSearchParams(/** @type {string[][]} */ (Object.entries(query).filter(([, v]) => v !== undefined)))}`),
    get: api.get,
    text: api.text,
    blob: api.blob,
    call: api.call,
    run: ([verb, body], fields) => api.call(verb, /** @type {import('../shared/api.ts').Verbs[typeof verb]} */ ({ ...body, ...fields })),
    keys: keySender('keys'),
    shellKeys: keySender('shell/keys'),
    watch,
    relay,
    ui: api.ui,
    remember: api.remember,
    recall: api.recall,
    store,
    prefs: {
      get: () => prefs,
      set: api.setPrefs,
      on(fn) {
        prefsWatchers.add(fn)
        return () => prefsWatchers.delete(fn)
      },
      attributes,
    },
    scheme,
    /** @deprecated `tower.prefs.get().scheme` */
    schemeChoice: () => prefs.scheme,
    /** @deprecated `tower.prefs.set({ scheme })` */
    chooseScheme: (scheme) => api.setPrefs({ scheme }),
    onScheme(fn) {
      schemeWatchers.add(fn)
      return () => schemeWatchers.delete(fn)
    },
  }
})()
