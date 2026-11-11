import type { Subject } from './subjects.ts'

/**
 * Text picked in a file a renderer draws, as a renderer holds it: `of`, the key of the showing or item it is in;
 * `card`, the worker that showed it, and `file`, the file's real path, for a showing of a file; `quote`, the words
 * picked as the frame draws them; `from` and `to`, its source lines, where the file drawn says them (`linesPicked`,
 * `textLines`). @since 1.170
 */
export type Passage = {
  of: string
  project?: string
  card?: string
  file?: string
  quote: string
  from?: number
  to?: number
}

/** A short hash of a passage's words, so two picks in the same lines are two keys. */
const quoteHash = (quote: string) => [...quote].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)!) | 0, 7).toString(36).replace('-', 'n')

/**
 * Text picked in a document, a viewer subject of the showing or item it is in, never on the board: its words as its
 * `body`, typed `text/plain`, so what reads a subject's text reads them. @since 1.170
 */
export const passageSubject = (p: Passage): Subject => ({
  kind: 'passage',
  key: `passage:${p.of}#${p.from ?? 0}-${p.to ?? 0}:${quoteHash(p.quote)}`,
  ...(p.project !== undefined && { project: p.project }),
  value: { ...p, body: p.quote, type: 'text/plain' },
})
