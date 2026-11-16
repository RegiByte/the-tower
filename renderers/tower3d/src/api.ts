import type { Board, Card, CardShown, Floor, KeptBy, SessionRef, Wait, Status } from '/lib/board.js'
import type { Brief } from '/lib/brief.js'
import type { Stats } from '/lib/stats.js'
import type { ShelfSelf, StreamMsg, Tower } from '/lib/client.js'

export type { Board, Card, Floor, KeptBy, SessionRef, ShelfSelf, Status, Brief, Wait, StreamMsg, Tower }

/** A showing in a floor's gallery (`galleryOf`): what was shown, under the worker that carries it now. */
export type GalleryShowing = { worker: SessionRef; shown: CardShown }

export type Shell = Board['shells'][number]
export type Today = Board['today']
export type { Stats }

declare global {
  interface Window {
    tower: Tower
  }
}

/** `get` over a path its typed templates can't name: a shelf's file list (JSON) and a file's text. */
const read = (tower: Tower, path: string) => (tower.get as (path: string) => Promise<unknown>)(path)
const filePath = (file: string) => file.split('/').map(encodeURIComponent).join('/')
export const shelfFiles = (tower: Tower, project: string, n: number) => read(tower, `shelf/${project}/${n}`) as Promise<string[]>
export const shelfText = (tower: Tower, project: string, n: number, file: string) => read(tower, `shelf/${project}/${n}/${filePath(file)}`) as Promise<string>
/** Where a shelf file is served, for a frame. */
export const shelfUrl = (project: string, n: number, file: string) => `/shelf/${project}/${n}/${filePath(file)}`
