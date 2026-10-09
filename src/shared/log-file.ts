import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

const READ_CHUNK = 64 * 1024

/** A plain file's first line, without its newline; `undefined` while it holds no whole line. */
export const firstLine = (file: string): Buffer | undefined => {
  const fd = openSync(file, 'r')
  try {
    const chunks: Buffer[] = []
    const buf = Buffer.alloc(READ_CHUNK)
    for (let position = 0, n = readSync(fd, buf, 0, READ_CHUNK, 0); n > 0; n = readSync(fd, buf, 0, READ_CHUNK, position)) {
      const end = buf.subarray(0, n).indexOf(0x0a)
      chunks.push(Buffer.from(buf.subarray(0, end === -1 ? n : end)))
      position += n
      if (end !== -1) return Buffer.concat(chunks)
    }
    return undefined
  } finally {
    closeSync(fd)
  }
}

/** How many bytes of a file its whole lines take: a writer that died mid-line leaves an unfinished one after them. */
export const wholeLinesLength = (file: string): number => {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(READ_CHUNK)
    for (let end = fstatSync(fd).size; end > 0; end -= READ_CHUNK) {
      const start = Math.max(0, end - READ_CHUNK)
      const n = readSync(fd, buf, 0, end - start, start)
      const last = buf.subarray(0, n).lastIndexOf(0x0a)
      if (last !== -1) return start + last + 1
    }
    return 0
  } finally {
    closeSync(fd)
  }
}
