import { createReadStream, createWriteStream, renameSync, rmSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { foldLog } from './checkpoints.ts'
import { sessionLogPath, type SystemPaths } from './shared/paths.ts'
import { ARCHIVED } from './tail.ts'

/**
 * Gzips an ended session's log in place, `<id>.jsonl.gz` (decision `log-retention`). The log is folded first, so its
 * checkpoint reaches the log's end and the archive is folded without inflating it. The archive is written whole
 * beside it and renamed into place before the plain log is removed: every reader finds one whole log at any moment.
 */
export const archiveLog = async (paths: SystemPaths, id: string) => {
  const plain = sessionLogPath(paths, id)
  const archive = `${plain}${ARCHIVED}`
  const staging = `${archive}.${process.pid}`
  foldLog(paths.cache, plain)
  try {
    await pipeline(createReadStream(plain), createGzip(), createWriteStream(staging, { flags: 'wx' }))
  } catch (err) {
    rmSync(staging, { force: true })
    throw err
  }
  renameSync(staging, archive)
  rmSync(plain)
}
