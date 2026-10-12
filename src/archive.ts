import { createReadStream, createWriteStream, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { foldLog } from './checkpoints.ts'
import { sessionLogPath, type SystemPaths } from './shared/paths.ts'
import { ARCHIVED } from './tail.ts'

/**
 * Gzips a log no one appends to again in place, `<file>.gz` (decision `log-retention`). The archive is written whole
 * beside it and renamed into place before the plain log is removed: every reader finds one whole log at any moment.
 */
const gzipInPlace = async (plain: string) => {
  const archive = `${plain}${ARCHIVED}`
  const staging = `${archive}.${process.pid}`
  try {
    await pipeline(createReadStream(plain), createGzip(), createWriteStream(staging, { flags: 'wx' }))
  } catch (err) {
    rmSync(staging, { force: true })
    throw err
  }
  renameSync(staging, archive)
  rmSync(plain)
}

/** An ended session's log, folded first, so its checkpoint reaches the log's end and the archive is folded without inflating it. */
export const archiveLog = async (paths: SystemPaths, id: string) => {
  const plain = sessionLogPath(paths, id)
  foldLog(paths.cache, plain)
  await gzipInPlace(plain)
}

/** A stream's closed month, by its path under `streams/` (`system/probe.quota/2026-09.jsonl`). */
export const archiveStream = (paths: SystemPaths, file: string) => gzipInPlace(path.join(paths.streams, file))
