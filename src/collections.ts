/**
 * The files of every project's collections, on disk at `collections/<project>/<collection>/<item>` in the system
 * root. Dot files are the store's own: a write lands in one, then takes the item's name in one step, so a reader
 * never sees half a file.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs'
import path from 'node:path'
import { ITEM_EXT, ITEM_ID } from './shared/api.ts'
import type { CollectionItem } from './shared/model.ts'
import type { SystemPaths } from './shared/paths.ts'

/** An item's version: its modification time in whole milliseconds, as the board carries it. */
const versionOf = (stat: Stats): number => Math.floor(stat.mtimeMs)

export const itemVersion = (file: string): number => versionOf(statSync(file))

const visible = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith('.')) : [])

/**
 * Every item of every collection on disk, declared in the config or not, in id order. Editors make and remove files
 * of their own as they save: one gone between the listing and its stat is skipped.
 */
export const scanCollections = (paths: SystemPaths): CollectionItem[] =>
  visible(paths.collections).flatMap((project) =>
    visible(path.join(paths.collections, project)).flatMap((collection) =>
      visible(path.join(paths.collections, project, collection))
        .sort()
        .flatMap((id) => {
          const stat = statSync(path.join(paths.collections, project, collection, id), { throwIfNoEntry: false })
          return stat ? [{ project, collection, id, size: stat.size, modifiedAt: versionOf(stat) }] : []
        }),
    ),
  )

/** An item's file. Ids are plain file names: no directories, no dot files. */
export const itemPath = (paths: SystemPaths, project: string, collection: string, id: string): string => {
  if (!ITEM_ID.test(id)) throw new Error(`"${id}" is not an item id`)
  return path.join(paths.collections, project, collection, id)
}

/** Writes `content` beside `file` under a dot name, so the caller can move it into place whole. */
const staged = (file: string, content: string): string => {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}`)
  writeFileSync(temp, content)
  return temp
}

const SLUG_LENGTH = 48

/**
 * Words made a part of a file name: lower case ASCII letters and digits joined by dashes, cut at a dash to at most
 * `SLUG_LENGTH` characters. Empty when the words have no letter or digit.
 */
export const slugOf = (words: string): string => {
  const slug = words.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (slug.length <= SLUG_LENGTH) return slug
  const cut = slug.slice(0, SLUG_LENGTH + 1)
  return cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut.slice(0, SLUG_LENGTH)
}

/** A UTC moment to the second, `20261008T130025Z`: ids that start with it sort as they were made. */
const stamp = (at: Date) => at.toISOString().replace(/[-:]|\.\d+/g, '')

/** Claims an empty file at `file`; false when it is taken. */
const claimed = (file: string): boolean => {
  try {
    writeFileSync(file, '', { flag: 'wx' })
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
}

/**
 * A new item, named by the moment it was made and by `name`'s words when it has some: `20261008T130025Z-life-garden.html`,
 * or `20261008T130025Z.md`; the first free of `-2`, `-3`… follows when another item took the name this second. The
 * name is claimed empty first, so an item is never overwritten; the content then moves in whole. Items only ever take
 * their name by a rename: macOS raises no watch event when a file made by a hard link is later deleted.
 */
export const createItem = (
  paths: SystemPaths,
  project: string,
  collection: string,
  name: string | undefined,
  ext: string,
  content: string,
): { id: string; modifiedAt: number } => {
  if (!ITEM_EXT.test(ext)) throw new Error(`"${ext}" is not a file extension`)
  const slug = slugOf(name ?? '')
  const base = `${stamp(new Date())}${slug && `-${slug}`}`
  mkdirSync(path.join(paths.collections, project, collection), { recursive: true })
  for (let n = 1; ; n++) {
    const id = `${base}${n === 1 ? '' : `-${n}`}.${ext}`
    const file = itemPath(paths, project, collection, id)
    if (!claimed(file)) continue
    renameSync(staged(file, content), file)
    return { id, modifiedAt: itemVersion(file) }
  }
}

/**
 * Puts `content` back under the id of an item that was deleted, answering its version; `undefined` when an item holds
 * the id. The id is claimed empty first, as a new item's is, so an item is never overwritten.
 */
export const restoreItem = (paths: SystemPaths, project: string, collection: string, id: string, content: string): number | undefined => {
  const file = itemPath(paths, project, collection, id)
  mkdirSync(path.dirname(file), { recursive: true })
  if (!claimed(file)) return undefined
  renameSync(staged(file, content), file)
  return itemVersion(file)
}

/** Replaces an item's content, answering its new version. An item that no longer exists stays gone. */
export const writeItem = (paths: SystemPaths, project: string, collection: string, id: string, content: string): number => {
  const file = itemPath(paths, project, collection, id)
  if (!existsSync(file)) throw new Error(`${project}/${collection} holds no item "${id}"`)
  renameSync(staged(file, content), file)
  return itemVersion(file)
}

/** An item's content, `undefined` while it doesn't exist. */
export const readItem = (paths: SystemPaths, project: string, collection: string, id: string): string | undefined => {
  const file = itemPath(paths, project, collection, id)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** An item by a name of the caller's, made or replaced whole, answering its new version. */
export const putItem = (paths: SystemPaths, project: string, collection: string, id: string, content: string): number => {
  const file = itemPath(paths, project, collection, id)
  mkdirSync(path.dirname(file), { recursive: true })
  renameSync(staged(file, content), file)
  return itemVersion(file)
}

/** An item under a new id, in one step. */
export const renameItem = (paths: SystemPaths, project: string, collection: string, id: string, to: string): void =>
  renameSync(itemPath(paths, project, collection, id), itemPath(paths, project, collection, to))

export const deleteItem = (paths: SystemPaths, project: string, collection: string, id: string): void =>
  unlinkSync(itemPath(paths, project, collection, id))
