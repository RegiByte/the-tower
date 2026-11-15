/**
 * Copies of a checkout's index that git reads and writes through `GIT_INDEX_FILE`, so the tower never writes or locks
 * the index a worker's git uses.
 */
import { copyFileSync, renameSync, statSync, utimesSync } from 'node:fs'

/**
 * The index at `real` copied to `to`, whole (written beside `to`, then renamed), its mtime no later than the real one's.
 * Git trusts an entry whose stat matches unless the entry is as new as the index file itself: a copy dated later would
 * read a same-size edit made in the second of the index's last write as clean. A whole second is an exact timestamp,
 * so the copy is dated to the real index's second, never after it.
 */
export const copyIndex = (real: string, to: string): void => {
  const staging = `${to}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`
  const { mtimeMs, atime } = statSync(real)
  copyFileSync(real, staging)
  utimesSync(staging, atime, Math.floor(mtimeMs / 1000))
  renameSync(staging, to)
}
