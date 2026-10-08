import type { Board, Card, Floor, GalleryShowing, KeptBy, SessionRef, Wait } from '../../../src/bridge/board.ts'
import type { Brief } from '../../../src/bridge/turns.ts'
import type { Stats, StatsQuery } from '../../../src/bridge/stats.ts'
import type { Status } from '../../../src/bridge/status.ts'
import type { API_VERSION, Call, ErrorCode, Replies, Verb, Verbs } from '../../../src/shared/api.ts'
import type { Renderer } from '../../../src/shared/model.ts'
import type { Reads, ScreenMsg, ShelfSelf, TerminalMsg, TowerVerb } from '../../../src/shared/shelf-page.ts'
import type { ShellStream } from '../../../src/shared/terms.ts'
import type { Scheme } from '../../../src/shared/design.ts'

export type { Board, Card, Floor, GalleryShowing, KeptBy, SessionRef, ShelfSelf, Status, Brief, Wait }

export type Shell = Board['shells'][number]
export type Today = Board['today']
export type { Stats }

/** What a watch hands its callback: a stream's messages, or the error that ended it. */
export type StreamMsg = ScreenMsg | TerminalMsg | ShellStream

/** `window.tower`, from `/tower.js` (src/tower/tower.js). */
export type Tower = {
  framed: boolean
  version: typeof API_VERSION
  subscribe(fn: (board: Board, self: ShelfSelf | undefined) => void): () => void
  /** Why the tower can't build the board, `code` config or internal, until `subscribe` hands a board again. */
  onBoardError(fn: (err: Error & { code: ErrorCode }) => void): () => void
  conversations(session: string): Promise<Brief[]>
  archive(project: string): Promise<Card[]>
  /** This page's renderer when it is served as one, at `/r/<name>/`, on its own or framed on a shelf; null for any other page. */
  renderer(): Promise<Renderer | null>
  stats(query?: Partial<StatsQuery & { project: string }>): Promise<Stats>
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
  scheme(): Scheme
  onScheme(fn: (scheme: Scheme) => void): () => void
}

declare global {
  interface Window {
    tower: Tower
  }
}

export const tower = window.tower

/** `get` over a path its typed templates can't name: a shelf's file list (JSON) and a file's text. */
const read = tower.get as (path: string) => Promise<unknown>
const filePath = (file: string) => file.split('/').map(encodeURIComponent).join('/')
export const shelfFiles = (project: string, n: number) => read(`shelf/${project}/${n}`) as Promise<string[]>
export const shelfText = (project: string, n: number, file: string) => read(`shelf/${project}/${n}/${filePath(file)}`) as Promise<string>
/** Where a shelf file is served, for a frame. */
export const shelfUrl = (project: string, n: number, file: string) => `/shelf/${project}/${n}/${filePath(file)}`
