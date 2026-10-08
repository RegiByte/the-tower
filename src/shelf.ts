/** The files on a project's shelf, on disk under its hub. */
import { existsSync, globSync } from 'node:fs'
import path from 'node:path'
import type { Shown } from './bridge/facts.ts'
import { shelfItem, type Project, type Renderer, type ShelfEntry } from './shared/model.ts'

/** Numbers in names count as numbers: session 10 comes after session 9. */
const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true })

/** The files an entry shows, relative to the hub: its markdown files, or its page; an `item` entry's, its item. */
export const shelfFiles = (project: Project, entry: ShelfEntry): string[] => {
  if ('md' in entry) {
    const files = globSync(entry.md, { cwd: project.hub }).sort(byName)
    return entry.order === 'desc' ? files.reverse() : files
  }
  if ('html' in entry) return [entry.html]
  if ('item' in entry) return [shelfItem(entry).id]
  return []
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i

/**
 * Whether an entry lets `file` (relative to the hub) be read: one of its markdown files or an image beside or below
 * one, or anything beside or below its page. An `item` entry serves its item alone.
 */
export const shelfServes = (project: Project, entry: ShelfEntry, file: string): boolean => {
  if ('md' in entry) {
    const files = shelfFiles(project, entry)
    return files.includes(path.normalize(file)) || (IMAGE.test(file) && files.some((md) => besidePage(md, file)))
  }
  if ('html' in entry) return besidePage(entry.html, file)
  if ('item' in entry) return file === shelfItem(entry).id
  return false
}

/** A page's own files: anything beside or below it. */
const besidePage = (page: string, file: string): boolean => {
  const rel = path.relative(path.dirname(page), path.normalize(file))
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** What a shown page may pull in beside or below it: an html page anything, a markdown page its images. */
const servesBeside = (page: string, file: string): boolean =>
  (path.extname(page) === '.html' || (path.extname(page) === '.md' && IMAGE.test(file))) && besidePage(page, file)

/** Whether what a worker showed lets `file` (absolute) be read: a file it showed, or what a shown page pulls in. */
export const shownServes = (shown: Shown[], file: string): boolean =>
  shown.some((s) => s.kind === 'file' && (s.target === path.normalize(file) || servesBeside(s.target, file)))

/** The keys that say what a shelf entry is: each entry has exactly one. */
export const SHELF_KINDS = ['html', 'md', 'url', 'link', 'renderer', 'item'] as const

/**
 * What keeps an entry off the shelf, `undefined` when nothing does: `renderers` are the ones the tower serves,
 * `collections` the ids of the project's collections.
 */
export const shelfProblem = (project: Project, entry: ShelfEntry, renderers: Renderer[], collections: string[]): string | undefined => {
  if (typeof entry.label !== 'string' || !entry.label) return 'has no "label": the name the shelf shows it by'
  const kinds = SHELF_KINDS.filter((kind) => kind in entry)
  if (kinds.length !== 1) return `has ${kinds.length ? kinds.join(' and ') : `none of ${SHELF_KINDS.join(', ')}`}: an entry is exactly one of ${SHELF_KINDS.join(', ')}`
  const value = (entry as Record<string, unknown>)[kinds[0]]
  if (typeof value !== 'string' || !value) return `has ${kinds[0]} ${JSON.stringify(value)}: it takes a string`
  if ('html' in entry && !existsSync(path.join(project.hub, entry.html))) return `html: no file at ${path.join(project.hub, entry.html)} (paths are relative to the hub)`
  if (('url' in entry || 'link' in entry) && !/^https?:\/\//.test(value)) return `${kinds[0]}: ${JSON.stringify(value)} is no http(s) URL`
  if ('renderer' in entry && !renderers.some((r) => r.name === entry.renderer)) return `renderer: "${entry.renderer}" is none of the renderers: ${renderers.map((r) => r.name).join(', ')}`
  if ('item' in entry) {
    if (!/^[^/]+\/[^/]+$/.test(entry.item)) return `item: "${entry.item}" is no "<collection>/<id>"`
    const { collection } = shelfItem(entry)
    if (!collections.includes(collection)) return `item: the floor keeps no collection "${collection}": it keeps ${collections.join(', ') || 'none'}`
  }
  return undefined
}
