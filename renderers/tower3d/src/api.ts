import type { Board, Card, Floor, GalleryShowing, KeptBy, SessionRef, Wait, Status } from '/lib/board.js'
import type { Brief } from '/lib/brief.js'
import type { Stats } from '/lib/stats.js'
import type { ShelfSelf, StreamMsg, Tower } from '/lib/client.js'

export type { Board, Card, Floor, GalleryShowing, KeptBy, SessionRef, ShelfSelf, Status, Brief, Wait, StreamMsg }

export type Shell = Board['shells'][number]
export type Today = Board['today']
export type { Stats }

declare global {
  interface Window {
    tower: Tower
  }
}

export const tower = window.tower

/** `get` over a path its typed templates can't name: a shelf's file list (JSON) and a file's text. */
const read = (path: string) => (tower.get as (path: string) => Promise<unknown>)(path)
const filePath = (file: string) => file.split('/').map(encodeURIComponent).join('/')
export const shelfFiles = (project: string, n: number) => read(`shelf/${project}/${n}`) as Promise<string[]>
export const shelfText = (project: string, n: number, file: string) => read(`shelf/${project}/${n}/${filePath(file)}`) as Promise<string>
/** Where a shelf file is served, for a frame. */
export const shelfUrl = (project: string, n: number, file: string) => `/shelf/${project}/${n}/${filePath(file)}`
