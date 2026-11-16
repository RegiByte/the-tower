/**
 * The versions of files someone is looking at: a file's modification time, again each time it changes, read from the
 * OS's events on its folder while anyone listens. A folder is watched once however many of its files are listened to,
 * and not at all once nobody listens. Watching the folder, not the file, sees a file replaced by a rename onto its path
 * (a new inode) as well as one written in place or deleted and written again.
 */
import { readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { subscribe, type Subscription } from './subscribe.ts'
import type { VersionMsg } from './shared/shelf-page.ts'

type Listener = (msg: VersionMsg) => void

/** A folder watched: its files' listeners, and the watch, settled once it is watching. */
type Folder = { files: Map<string, Set<Listener>>; watching: Promise<Subscription> }

/** A file's version: its modification time in epoch ms, null while there is no file at its path. */
const versionOf = (file: string) => statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? null

/**
 * The folders below `dir` as it holds them now, left unwatched: only its own entries are this watch's, and a recursive
 * watch of a home or a repo's root would follow every change below it. A folder made in it later is watched.
 */
const below = (dir: string) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [path.join(dir, e.name)] : []))

export const fileVersions = () => {
  const folders = new Map<string, Folder>()

  const changed = (files: Folder['files']) => (paths: string[] | null) => {
    for (const [file, listeners] of files) {
      if (paths !== null && !paths.includes(file)) continue
      const msg: VersionMsg = { t: 'version', modifiedAt: versionOf(file) }
      for (const listener of listeners) listener(msg)
    }
  }

  const failed = (dir: string) => (err: Error) => {
    const folder = folders.get(dir)
    folders.delete(dir)
    for (const listeners of folder?.files.values() ?? []) for (const listener of listeners) listener({ t: 'error', message: `The watch of ${dir} stopped: ${err.message}` })
  }

  /**
   * Hands `send` the version of `at` once watching, then again whenever the file at that path changes; resolves to
   * the function that stops it. Rejects when its folder can't be watched.
   */
  const watch = async (at: string, send: Listener): Promise<() => void> => {
    const dir = realpathSync(path.dirname(at))
    const file = path.join(dir, path.basename(at))
    let folder = folders.get(dir)
    if (!folder) {
      const files: Folder['files'] = new Map()
      folder = { files, watching: subscribe(dir, below(dir), changed(files), failed(dir)) }
      folders.set(dir, folder)
    }
    const listeners = folder.files.get(file) ?? new Set()
    folder.files.set(file, listeners)
    listeners.add(send)
    const stop = () => {
      listeners.delete(send)
      if (listeners.size) return
      folder.files.delete(file)
      if (folder.files.size || folders.get(dir) !== folder) return
      folders.delete(dir)
      void folder.watching.then((s) => s.close(), () => {})
    }
    try {
      await folder.watching
    } catch (err) {
      stop()
      throw err
    }
    send({ t: 'version', modifiedAt: versionOf(file) })
    return stop
  }

  return { watch }
}
