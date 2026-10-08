/**
 * The tower's renderer API, and the protocol that carries it to the `html` shelf pages the tower frames.
 *
 * The API is the tower server's HTTP routes: every renderer, the tower page included, drives the system through
 * them. A renderer at `/r/<name>/`, and a page served by the tower at `/run/<project>/<n>/`, call them directly. A shelved page runs at an opaque
 * origin and can't, so it speaks to the framing tower over `postMessage`, which relays each request to the route it
 * names. `/tower.js` hides the difference.
 */
import type { Board, Card } from '../bridge/board.ts'
import type { Stats } from '../bridge/stats.ts'
import type { Brief } from '../bridge/turns.ts'
import type { ReviewHistory } from '../bridge/reviews.ts'
import type { RepoChanges } from '../changes.ts'
import type { API_VERSION, ErrorCode, Verbs } from './api.ts'
import type { Renderer } from './model.ts'
import type { ShellStream } from './terms.ts'

/** A scheme of `/design.css`, or `''` for whichever the system's appearance picks. */
export type SchemeChoice = '' | 'light' | 'dark'

/**
 * GET `/<path>`: reads, JSON as data and anything else as text (`tower.text` reads any of them as text, `tower.blob` as
 * a Blob of its type).
 */
export type Reads = {
  'conversations/<id>': Brief[]
  /** A project's cards the board leaves out (`onBoard`), newest first: the same cards, read again when `board.archiveAt` or the floor's `archived` moves. */
  'archive/<project>': Card[]
  /** What changed in each of the session's repos, as git reads it now. */
  'changes/<id>': RepoChanges[]
  /** A project's review threads, live and landed (Tidy files a landed one as `<checkout>@<time>.md`), and each author's notes, replies and verdicts. */
  'reviews/<project>': ReviewHistory
  /** Stats over every session's log, `stats?from&to&bucket&project` (`Queries['stats']`, parsed by its schema). */
  stats: Stats
  /** Every renderer the tower serves at `/r/<name>/`, built-ins first, and `default`, the name of the one `/` opens. */
  renderers: { default: string; renderers: Renderer[] }
  /** The web page of each project directory's origin remote, by directory. */
  origins: Record<string, string>
  /** The files of a project's nth shelf entry, relative to its hub. */
  'shelf/<project>/<n>': string[]
  /** One of them as text. */
  'shelf/<project>/<n>/<file>': string
  /** One of a collection's files, as text (a `.json` item as data); the board lists them. */
  'collection/<project>/<collection>/<item>': string
  /** A file a worker showed (`card.shown`, its absolute path), anything beside or below an html one, or an image beside or below a markdown one. */
  'shown/<id>/<path>': string
}

/** Why the tower can't build the board: `config` until the user fixes the config, `internal` for a failure of its own. */
export type BoardError = { code: ErrorCode; message: string }

/** GET `/board` (SSE): the board, again whenever it changes, or why the tower can't build it until it can. */
export type BoardMsg = { v: typeof API_VERSION; board: Board } | { v: typeof API_VERSION; error: BoardError }

/** The messages of the screen stream, GET `/screen/<id>` (SSE). */
export type ScreenMsg =
  /** `exited`: the PTY no longer runs (exited, stopped with the host, or lost), so the screen is read-only. */
  | { t: 'snapshot'; data: string; cols: number; rows: number; exited: boolean }
  | { t: 'o'; data: string }
  /** The PTY's new size, `<cols>x<rows>`. */
  | { t: 'r'; size: string }
  | { t: 'x'; exitCode: number }

/**
 * The screen stream as an interactive terminal opens it: its snapshot says how many other terminals are open on the
 * session. The PTY has one size, so a terminal opened beside another leaves it until someone types.
 */
export type TerminalMsg = Exclude<ScreenMsg, { t: 'snapshot' }> | (Extract<ScreenMsg, { t: 'snapshot' }> & { terminals: number })

/** SSE streams: `screen/<id>` carries `ScreenMsg`, `terminal/<id>` `TerminalMsg`, `shell/<id>` `ShellStream`. */
export type Streams = { 'screen/<id>': ScreenMsg; 'terminal/<id>': TerminalMsg; 'shell/<id>': ShellStream }

/** What a page asks of the tower page that frames it, not of the system. */
export type TowerVerb =
  | { verb: 'select'; id: string }
  | { verb: 'home' }
  | { verb: 'shelf'; project: string; n: number }

/** The shelf entry a page was opened from: the `n`th entry of `project`'s shelf. */
export type ShelfSelf = { project: string; n: number }

export type FromPage =
  | { t: 'hello' }
  /** `id` is the page's own, echoed on the answer or on each event of a watch. */
  | { t: 'call'; id: number; verb: keyof Verbs; body: Verbs[keyof Verbs] }
  | { t: 'get'; id: number; path: string }
  | { t: 'text'; id: number; path: string }
  | { t: 'blob'; id: number; path: string }
  | { t: 'watch'; id: number; path: string }
  | { t: 'unwatch'; id: number }
  | ({ t: 'tower' } & TowerVerb)
  /** Keep a value for this page in the viewer's browser, such as where a walker stood; `recall` answers it. */
  | { t: 'remember'; value: unknown }
  | { t: 'recall'; id: number }
  /** Keep a value in the viewer's browser under a key every page shares, the tower page included; `stored` answers it. */
  | { t: 'store'; key: string; value: unknown }
  | { t: 'stored'; id: number; key: string }

export type ToPage =
  /** Sent after `hello`, then whenever the board changes: the board, or why the tower can't build it. */
  | { t: 'board'; v: typeof API_VERSION; self: ShelfSelf; board: Board }
  | { t: 'board'; v: typeof API_VERSION; self: ShelfSelf; error: BoardError }
  | { t: 'answer'; id: number; data: unknown }
  | { t: 'answer'; id: number; error: string; code: ErrorCode }
  /** One message of a watched stream. */
  | { t: 'event'; id: number; data: ScreenMsg | ShellStream }
  /**
   * The viewer's colour scheme choice, `''` to follow the system: sent after `hello`, then whenever it changes. A `url`
   * entry's frame gets it too, on each load and change, and nothing else.
   */
  | { t: 'scheme'; scheme: SchemeChoice }
