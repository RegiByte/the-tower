/**
 * `git diff` output as data: one entry per file, its hunks as git printed them. Read with `src/changes.ts`, drawn by
 * renderers, which number the lines from each hunk's start.
 */
import { fnv1a } from '../shared/hash.ts'

/** A file's lines past this many changed are left out: a lockfile or a build output, not something to read. */
export const MAX_FILE_LINES = 2000

/** A file's unchanged lines before its hunks past this many would be a large file changed near its end: it isn't read for them (`beforeCount`). */
export const MAX_BEFORE_LINES = 1000

/**
 * One region of a file: `old` and `new` are the first line's numbers, each line keeps git's mark (` `, `+`, `-`, `\`).
 * `before`: the unchanged lines since the last hunk (or the file's start), the same on both sides, so a renderer reads
 * each hunk in the code it stands in (a comment or a string opened above it). On every hunk of a file or on none: absent when `withBefore` didn't read them.
 */
export type Hunk = { old: number; new: number; heading: string; lines: string[]; before?: string[] }

export type DiffFile = {
  path: string
  /** The path it was renamed from. */
  from?: string
  change: 'added' | 'deleted' | 'modified' | 'renamed'
  binary: boolean
  added: number
  removed: number
  /** Changes whenever the file's diff does: a mark set on one version of the file holds only for that version. */
  hash: string
  /** Absent for a binary file, or one past `MAX_FILE_LINES`. */
  hunks?: Hunk[]
}

const C_ESCAPES: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"' }

/** A path as git prints it: plain, or C-quoted with octal bytes when it holds a quote, a backslash or a control. */
const unquote = (text: string): string => {
  if (!text.startsWith('"')) return text
  const bytes: number[] = []
  const body = text.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      bytes.push(...Buffer.from(body[i]))
    } else if (/[0-7]/.test(body[i + 1])) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8))
      i += 3
    } else {
      bytes.push(...Buffer.from(C_ESCAPES[body[i + 1]]))
      i += 1
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** `a/<p>` → `<p>`; `/dev/null` → undefined. */
const sidePath = (text: string): string | undefined => {
  const p = unquote(text.replace(/\t$/, ''))
  return p === '/dev/null' ? undefined : p.slice(2)
}

/** The path in `diff --git a/<p> b/<p>`, for a file with no `---`/`+++` lines (binary, a pure rename, a mode change). */
const headerPath = (line: string): string => {
  const rest = line.slice('diff --git '.length)
  if (rest.endsWith('"')) return unquote(rest.slice(rest.lastIndexOf(' "') + 1)).slice(2)
  return rest.slice((rest.length + 1) / 2 + 2)
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/

const parseFile = (block: string[]): DiffFile => {
  let from: string | undefined
  let to: string | undefined
  let renamedFrom: string | undefined
  let renamedTo: string | undefined
  let added = false
  let deleted = false
  let binary = false
  const hunks: Hunk[] = []
  for (const line of block.slice(1)) {
    const hunk = hunks.at(-1)
    if (hunk && /^[ +\-\\]/.test(line)) hunk.lines.push(line)
    else if (HUNK.test(line)) {
      const [, old, now, heading] = HUNK.exec(line)!
      hunks.push({ old: Number(old), new: Number(now), heading, lines: [] })
    } else if (line.startsWith('--- ')) from = sidePath(line.slice(4))
    else if (line.startsWith('+++ ')) to = sidePath(line.slice(4))
    else if (line.startsWith('rename from ')) renamedFrom = unquote(line.slice(12))
    else if (line.startsWith('rename to ')) renamedTo = unquote(line.slice(10))
    else if (line.startsWith('new file mode ')) added = true
    else if (line.startsWith('deleted file mode ')) deleted = true
    else if (line.startsWith('Binary files ') || line === 'GIT binary patch') binary = true
  }
  const lines = hunks.flatMap((h) => h.lines)
  const plus = lines.filter((l) => l[0] === '+').length
  const minus = lines.filter((l) => l[0] === '-').length
  return {
    path: renamedTo ?? to ?? from ?? headerPath(block[0]),
    ...(renamedFrom && { from: renamedFrom }),
    change: added ? 'added' : deleted ? 'deleted' : renamedFrom ? 'renamed' : 'modified',
    binary,
    added: plus,
    removed: minus,
    hash: fnv1a(block.join('\n')).toString(16),
    ...(!binary && plus + minus <= MAX_FILE_LINES && { hunks }),
  }
}

/** A line as a diff and a file on disk both read it, past a carriage return git's eol conversion may strip from one. */
const bare = (line: string) => (line.endsWith('\r') ? line.slice(0, -1) : line)

/** A hunk's lines on its new side, past their marks: its context and what it adds. */
const ownLines = (h: Hunk) => h.lines.filter((l) => l[0] === ' ' || l[0] === '+').map((l) => l.slice(1))

/** Where each hunk's own lines start in the new side, counted from 0: a hunk adding nothing starts after its `new` line, not at it. */
const startOf = (h: Hunk, own: number) => (own ? h.new - 1 : h.new)

/** How many lines `withBefore` cuts before a file's hunks, told by their headers alone: what reading the file would buy. */
export function beforeCount(file: DiffFile): number {
  let at = 0
  let n = 0
  for (const h of file.hunks ?? []) {
    const own = ownLines(h).length
    n += startOf(h, own) - at
    at = startOf(h, own) + own
  }
  return n
}

/**
 * A modified or renamed file's hunks, each with the unchanged lines before it, cut from `text`, the file as its new
 * side reads; as they were when `text` isn't what git diffed (a clean filter that changes lines, an edit since the
 * diff), told by the hunks' own lines not standing where they say in `text`, or by hunks with no own line to tell.
 */
export function withBefore(file: DiffFile, text: string): DiffFile {
  if (!file.hunks?.length) return file
  const lines = text.split('\n')
  let at = 0
  let told = false
  let fits = true
  const hunks = file.hunks.map((h) => {
    const own = ownLines(h)
    const start = startOf(h, own.length)
    const before = lines.slice(at, start)
    told ||= own.length > 0
    fits &&= own.every((l, i) => bare(l) === bare(lines[start + i] ?? ''))
    at = start + own.length
    return { ...h, before }
  })
  return told && fits ? { ...file, hunks } : file
}

/** The files of a `git diff` output, in its order. */
export const parseDiff = (out: string): DiffFile[] => {
  const blocks: string[][] = []
  for (const line of out.split('\n')) {
    if (line.startsWith('diff --git ')) blocks.push([line])
    else blocks.at(-1)?.push(line)
  }
  return blocks.map((b) => parseFile(b.at(-1) === '' ? b.slice(0, -1) : b))
}
