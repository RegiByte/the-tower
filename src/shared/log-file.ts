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

/** Whether a non-empty file's last byte is a newline: a writer that died mid-line leaves one without. */
export const endsLine = (file: string): boolean => {
  const fd = openSync(file, 'r')
  try {
    const last = Buffer.alloc(1)
    return readSync(fd, last, 0, 1, Math.max(0, fstatSync(fd).size - 1)) === 1 && last[0] === 0x0a
  } finally {
    closeSync(fd)
  }
}
