/**
 * The tower's renderer API, and the protocol that carries it to the `html` shelf pages the tower frames.
 *
 * The API is the tower server's HTTP routes: every renderer, the tower page included, drives the system through
 * them. A renderer at `/r/<name>/`, and a page served by the tower at `/run/<project>/<n>/`, call them directly. A shelved page runs at an opaque
 * origin and can't, so it speaks to the framing tower over `postMessage`, which relays each request to the route it
 * names. `/tower.js` hides the difference.
 */
import type { Board, Card } from '../bridge/board.ts'
import type { Stats, StatsQuery } from '../bridge/stats.ts'
import type { ProbeView } from '../bridge/probes.ts'
import type { LandingRead } from '../bridge/worktrees.ts'
import type { Brief } from '../bridge/turns.ts'
import type { ReviewHistory } from '../bridge/reviews.ts'
import type { RepoChanges } from '../changes.ts'
import type { API_VERSION, Call, ErrorCode, Replies, Verb, Verbs } from './api.ts'
import type { Scheme } from './design.ts'
import type { ExtensionView } from './extensions.ts'
import type { Pattern } from './capabilities.ts'
import type { Renderer } from './model.ts'
import type { Prefs } from './prefs.ts'
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
  /** What changed in each of the session's repos, as git reads it now, `changes/<id>?scope` (`Queries['changes/<id>']`): all since the base, uncommitted, or one commit. */
  'changes/<id>': RepoChanges[]
  /** A project's review threads, live and landed (Tidy files a landed one as `<checkout>@<time>.md`), and each author's notes, replies and verdicts. */
  'reviews/<project>': ReviewHistory
  /** Stats over every session's log, `stats?from&to&bucket&project` (`Queries['stats']`, parsed by its schema). */
  stats: Stats
  /** One probe's status, as `board.probes` has it, and its latest reads, newest first, `probe/<name>?last` (`Queries['probe/<name>']`). */
  'probe/<name>': ProbeView
  /** What landing changed on a carried branch, `landing?project&branch` (`Queries['landing']`): each commit landed edited, its copy and `git range-diff`. */
  landing: LandingRead
  /** Every renderer the tower serves at `/r/<name>/`, built-ins first, and `default`, the name of the one `/` opens. */
  renderers: { default: string; renderers: Renderer[] }
  /** The web page of each project directory's origin remote, by directory. */
  origins: Record<string, string>
  /** What users found doing with the tower, one story each, from the checkout's `docs/patterns/` (`/capabilities.js`). */
  patterns: Pattern[]
  /** The files of a project's nth shelf entry, relative to its hub. */
  'shelf/<project>/<n>': string[]
  /** One of them as text. */
  'shelf/<project>/<n>/<file>': string
  /** One of a collection's files, as text (a `.json` item as data); the board lists them. */
  'collection/<project>/<collection>/<item>': string
  /** A file a worker showed (`card.shown`, its absolute path), anything beside or below an html one, or an image beside or below a markdown one. */
  'shown/<id>/<path>': string
  /**
   * Every extension the tower found, as `board.extensions` shows them, and its resources as braided starts them, each
   * extension's as `x:<cap>`: the order, the layers by depth, who depends on whom. `chains`: the capabilities whose
   * links wrap each verb or hook, outermost first; `answers`: each hook's answerers, in the order they answer;
   * `composites`: each core verb the core's composites call through the dispatch, with those composites.
   * `chains`, `answers` and `composites` @since 1.84
   */
  extensions: { extensions: ExtensionView[]; topology: Topology; chains: Record<string, string[]>; answers: Record<string, string[]>; composites: Record<string, string[]> }
}

/** A resource the tower runs: what it depends on, what depends on it, and its depth (0 when it depends on nothing). */
export type TopologyNode = { id: string; dependencies: string[]; dependents: string[]; depth: number }

/** The tower's resources as braided orders them: started in `startupOrder`, halted in `shutdownOrder`; `mermaid` draws the graph. */
export type Topology = {
  layers: { depth: number; resources: TopologyNode[] }[]
  /** Each resource's dependencies. */
  graph: Record<string, string[]>
  /** Each resource's dependents. */
  dependents: Record<string, string[]>
  depths: Record<string, number>
  totalResources: number
  maxDepth: number
  startupOrder: string[]
  shutdownOrder: string[]
  /** The graph as a Mermaid flowchart, an edge from each dependency to its dependent. */
  mermaid: string
}

/**
 * Why a renderer has no live board: the tower can't build it, `config` until the user fixes the config, `internal` for
 * a failure of its own; or `disconnected`, told by `/tower.js` (never by the tower) while the tower doesn't answer.
 */
export type BoardError = { code: ErrorCode | 'disconnected'; message: string }

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
  /** Some of the viewer's appearance, kept by the tower page for every page of theirs and sent back as `prefs`. */
  | { verb: 'prefs'; prefs: Partial<Prefs> }
  /** @deprecated `{ verb: 'prefs', prefs: { scheme } }` */
  | { verb: 'scheme'; scheme: SchemeChoice }

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
  /** The viewer's whole appearance (`tower.prefs`): sent after `hello`, then whenever it changes. */
  | { t: 'prefs'; prefs: Prefs }

/** The verbs a framed page moves its framing page's own view with. */
export type RelayedUi = { [V in 'select' | 'home' | 'shelf']: (fields: Extract<TowerVerb, { verb: V }>) => void }

/** What a watch hands its callback: a stream's messages, or the error that ended it. */
export type StreamMsg = ScreenMsg | TerminalMsg | ShellStream

/** `window.tower`, from `/tower.js` (src/tower/tower.js). */
export type Tower = {
  framed: boolean
  version: typeof API_VERSION
  subscribe(fn: (board: Board, self: ShelfSelf | undefined) => void): () => void
  /** Why there is no live board, `code` config, internal or disconnected, until `subscribe` hands a board again. */
  onBoardError(fn: (err: Error & { code: BoardError['code'] }) => void): () => void
  conversations(session: string): Promise<Brief[]>
  archive(project: string): Promise<Card[]>
  /** This page's renderer when it is served as one, at `/r/<name>/`, on its own or framed on a shelf; null for any other page. */
  renderer(): Promise<Renderer | null>
  stats(query?: Partial<StatsQuery & { project: string }>): Promise<Stats>
  /** One probe's status and its latest `last` reads, newest first. */
  probe(name: string, query?: { last?: number }): Promise<ProbeView>
  /** What landing changed on a carried branch: each commit landed edited, its copy and `git range-diff`. */
  landing(query: { project: string; branch: string }): Promise<LandingRead>
  get<K extends keyof Reads>(path: K): Promise<Reads[K]>
  text(path: string): Promise<string>
  blob(path: string): Promise<Blob>
  call<K extends keyof Verbs>(verb: K, body: Verbs[K]): Promise<Replies[K]>
  run<V extends Verb>(call: Call<V>, fields?: Partial<Verbs[V]>): Promise<Replies[V]>
  keys(id: string, data: string): void
  shellKeys(id: string, data: string): void
  watch(path: string, fn: (msg: StreamMsg) => void): () => void
  remember(value: unknown): void
  recall(): Promise<unknown>
  store: { set(key: string, value: unknown): void; get(key: string): Promise<unknown> }
  ui<V extends TowerVerb['verb']>(verb: V, fields?: Omit<Extract<TowerVerb, { verb: V }>, 'verb'>): void
  /** A shelf page framed by this page, given the board and the API: `ui` is this page's own view, `stored` hears each key it sets in `store`. */
  relay(frame: HTMLIFrameElement, url: string, opts: { self: ShelfSelf; ui: RelayedUi; stored(key: string): void }): { close(): void }
  /** The viewer's appearance, on the root before the page paints. */
  prefs: { get(): Prefs; set(patch: Partial<Prefs>): void; on(fn: (prefs: Prefs) => void): () => void; attributes(): string }
  scheme(): Scheme
  onScheme(fn: (scheme: Scheme) => void): () => void
  /** @deprecated `prefs.get().scheme` */
  schemeChoice(): SchemeChoice
  /** @deprecated `prefs.set({ scheme })` */
  chooseScheme(choice: SchemeChoice): void
}
