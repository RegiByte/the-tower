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
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { gitWith } from './git.ts'
import { configPath, systemPaths } from './shared/paths.ts'

/** A staging file or a checkout's folder this old is left over from a stopped read, never one in progress. */
const LEFT_OVER_MS = 10 * 60_000

/**
 * The index at `real` copied to `to`, whole (written beside `to`, then renamed), its mtime no later than the real one's.
 * Git trusts an entry whose stat matches unless the entry is as new as the index file itself: a copy dated later would
 * read a same-size edit made in the second of the index's last write as clean. A whole second is an exact timestamp,
 * so the copy is dated to the real index's second, never after it.
 */
export const copyIndex = (real: string, to: string): void => {
  const staging = stagingFor(to)
  const { mtimeMs, atime } = statSync(real)
  copyFileSync(real, staging)
  utimesSync(staging, atime, Math.floor(mtimeMs / 1000))
  renameSync(staging, to)
}

const stagingFor = (file: string) => `${file}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`

const hashed = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 16)

/** The copies of every checkout of repo `repo`, one folder per checkout, in the system root's cache. */
const repoCache = (repo: string) => path.join(systemPaths(configPath()).cache, 'index', hashed(repo))

const leftOver = (file: string) => Date.now() - statSync(file).mtimeMs > LEFT_OVER_MS

/**
 * The private copy of the index of checkout `checkout` of repo `repo`, whose own git dir is `gitDir`: named by the real
 * index's identity (inode, mtime, size), stated before it is copied, so a copy is never kept under a newer index's
 * name. A name present always holds a refreshed copy; a new one replaces the checkout's older copies. `undefined` when
 * the checkout has no index, which git reads as empty: nothing to refresh.
 */
export const privateIndex = async (repo: string, checkout: string, gitDir: string): Promise<string | undefined> => {
  const real = path.join(gitDir, 'index')
  if (!existsSync(real)) return undefined
  const { ino, mtimeNs, size } = statSync(real, { bigint: true })
  const folder = path.join(repoCache(repo), hashed(checkout))
  const key = `${ino}-${mtimeNs}-${size}`
  const copy = path.join(folder, key)
  if (existsSync(copy)) return copy
  mkdirSync(folder, { recursive: true })
  const staging = stagingFor(copy)
  try {
    copyIndex(real, staging)
    await gitWith({ GIT_INDEX_FILE: staging })(checkout, ['-c', 'core.splitIndex=false', 'update-index', '-q', '--unmerged', '--refresh'])
    renameSync(staging, copy)
  } finally {
    rmSync(staging, { force: true })
  }
  for (const name of readdirSync(folder)) {
    const file = path.join(folder, name)
    if (name !== key && (!name.endsWith('.tmp') || leftOver(file))) rmSync(file, { force: true })
  }
  return copy
}

/** Repo `repo`'s copies of checkouts other than `checkouts`, once untouched long enough that no read is making them. */
export const sweepIndexes = (repo: string, checkouts: string[]): void => {
  const cache = repoCache(repo)
  if (!existsSync(cache)) return
  const kept = new Set(checkouts.map(hashed))
  for (const name of readdirSync(cache)) {
    const folder = path.join(cache, name)
    if (!kept.has(name) && leftOver(folder)) rmSync(folder, { recursive: true, force: true })
  }
}
