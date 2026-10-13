/** Appending to streams: the tower is the one writer of each (`src/bridge/streams.ts` reads them). */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs'
import path from 'node:path'
import { eventLine, monthFile, monthStart, type StreamHeader } from './bridge/streams.ts'

/** Whether the file's last byte ends a line: an append torn by a crash leaves it open. */
const endsLine = (file: string): boolean => {
  const { size } = statSync(file)
  if (size === 0) return true
  const fd = openSync(file, 'r')
  try {
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    return last[0] === 0x0a
  } finally {
    closeSync(fd)
  }
}

/**
 * Appends a fact to the stream in `dir`, named `stream`, in the file of its month, which starts with its header. After
 * a torn append the fact starts a line of its own, so the torn text costs only its own fact.
 */
export const appendFact = (dir: string, stream: string, at: number, code: string, fact: unknown) => {
  const file = path.join(dir, monthFile(at))
  mkdirSync(dir, { recursive: true })
  const header: StreamHeader = { stream, startedAt: monthStart(at), version: 1 }
  const before = !existsSync(file) ? `${JSON.stringify(header)}\n` : endsLine(file) ? '' : '\n'
  appendFileSync(file, `${before}${eventLine(at, code, fact)}\n`)
}
