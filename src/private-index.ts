/**
 * Copies of a checkout's index that git reads and writes through `GIT_INDEX_FILE`, so the tower never writes or locks
 * the index a worker's git uses.
 *
 * `git worktree add`, a checkout, a rebase or a pull writes files and the index in the same second, which leaves the
 * index's entries racy: git can't trust their stat, so every `status` or `diff` against the working tree hashes those
 * files again. Only a write of the index clears it, and the tower reads with `--no-optional-locks`, which never writes
 * it. Each checkout's read goes through a private copy instead, refreshed once (`update-index --refresh`), which
 * changes only the stat of entries whose content matches: every read through it answers as the real index would.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { gitWith } from './git.ts'
import { configPath, systemPaths } from './shared/paths.ts'

/**
 * The index at `real` copied to `to`, whole (written beside `to`, then renamed), its mtime no later than the real one's.
 * Git trusts an entry whose stat matches unless the entry is as new as the index file itself: a copy dated later would
 * read a same-size edit made in the second of the index's last write as clean. A whole second is an exact timestamp,
 * so the copy is dated to the real index's second, never after it.
 */
export const copyIndex = (real: string, to: string): void => {
  const staging = ownName(to, 'tmp')
  const { mtimeMs, atime } = statSync(real)
  copyFileSync(real, staging)
  utimesSync(staging, atime, Math.floor(mtimeMs / 1000))
  renameSync(staging, to)
}

/** A name beside `file` that only this call uses, marked with this process's pid. */
const ownName = (file: string, kind: 'tmp' | 'held') => `${file}.${process.pid}-${Math.random().toString(36).slice(2)}.${kind}`

const OWNED = /\.(\d+)-[a-z0-9]+\.(tmp|held)$/

/**
 * Whether the file named `name` is free to delete: a copy no read uses directly, or a staging file or a hold whose
 * process has ended. A live process's own files are removed only by the call that made them, however long it waits.
 * A pid another user's process now holds counts as alive: its file stays until that process ends.
 */
const free = (name: string): boolean => {
  const owner = OWNED.exec(name)?.[1]
  if (owner === undefined) return true
  try {
    process.kill(Number(owner), 0)
    return false
  } catch (err) {
    const { code } = err as NodeJS.ErrnoException
    if (code === 'ESRCH') return true
    if (code === 'EPERM') return false
    throw err
  }
}

const hashed = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 16)

/** The copies of every checkout of repo `repo`, one folder per checkout, in the system root's cache. */
const repoCache = (repo: string) => path.join(systemPaths(configPath()).cache, 'index', hashed(repo))

/** `folder`'s files other than `keep` that are free to delete, deleted. */
const sweep = (folder: string, keep?: string) => {
  for (const name of readdirSync(folder)) if (name !== keep && free(name)) rmSync(path.join(folder, name), { force: true })
}

/** A hard link to `file` under a name of this call's own, which a sweep never deletes; `undefined` once `file` is gone. */
const holdOn = (file: string): string | undefined => {
  const held = ownName(file, 'held')
  try {
    linkSync(file, held)
    return held
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

/** A read's own name for a private index (`privateIndex`), and how it lets go of it once its git calls are done. */
export type HeldIndex = { index: string; release: () => void }

/**
 * The private copy of the index of checkout `checkout` of repo `repo`, whose own git dir is `gitDir`, held for one read.
 * Copies are named by the real index's identity (inode, mtime, size), stated before it is copied, so a copy is never
 * kept under a newer index's name, and a name present always holds a refreshed copy. A read uses its own hard link to
 * the copy, so a newer copy can delete the checkout's older ones at once: git reads a `GIT_INDEX_FILE` that is gone as
 * an empty index, without a word, and a read waits in git's queue for as long as the queue takes. `undefined` when the
 * checkout has no index, which git reads as empty: nothing to refresh.
 */
export const privateIndex = async (repo: string, checkout: string, gitDir: string): Promise<HeldIndex | undefined> => {
  const real = path.join(gitDir, 'index')
  if (!existsSync(real)) return undefined
  const { ino, mtimeNs, size } = statSync(real, { bigint: true })
  const folder = path.join(repoCache(repo), hashed(checkout))
  const key = `${ino}-${mtimeNs}-${size}`
  const copy = path.join(folder, key)
  const held = holdOn(copy) ?? (await refreshed(real, folder, copy, checkout))
  return { index: held, release: () => rmSync(held, { force: true }) }
}

/** A refreshed copy of `real` made at `copy`, held (`holdOn`) before it is named, and the folder's others swept. */
const refreshed = async (real: string, folder: string, copy: string, checkout: string): Promise<string> => {
  mkdirSync(folder, { recursive: true })
  const staging = ownName(copy, 'tmp')
  try {
    copyIndex(real, staging)
    await gitWith({ GIT_INDEX_FILE: staging })(checkout, ['-c', 'core.splitIndex=false', 'update-index', '-q', '--unmerged', '--refresh'])
    const held = holdOn(staging)!
    renameSync(staging, copy)
    sweep(folder, path.basename(copy))
    return held
  } finally {
    rmSync(staging, { force: true })
  }
}

/** Repo `repo`'s copies of checkouts other than `checkouts`, swept. An emptied folder stays: a read may be making a copy in it. */
export const sweepIndexes = (repo: string, checkouts: string[]): void => {
  const cache = repoCache(repo)
  if (!existsSync(cache)) return
  const kept = new Set(checkouts.map(hashed))
  for (const name of readdirSync(cache)) {
    if (kept.has(name)) continue
    sweep(path.join(cache, name))
  }
}
