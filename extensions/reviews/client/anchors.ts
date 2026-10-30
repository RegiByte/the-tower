/**
 * A note's anchors: how one reads, the anchor a renderer was clicked on, the marks a thread's anchors put on a worker's
 * changed lines, and the anchor of lines picked in its Changes. The reviews extension's client, served at
 * `/x/reviews/anchors.js` (and, as they stood at 1.113, in `/panels.js` until 2.0).
 */
import type { Mark } from '../../../src/shared/extensions.ts'
import type { Lines } from '../../../src/shared/subjects.ts'
import type { Anchor, ReviewThread } from './reviews.ts'

/** Where an anchor is, as a note heading writes it: `repo:path:from-to`. */
export const anchorWhere = (a: Pick<Anchor, 'repo' | 'path' | 'from' | 'to'>) => `${a.repo}:${a.path}:${a.from === a.to ? a.from : `${a.from}-${a.to}`}`

/** An anchor of a thread's note, by the `data-anchor` value its renderer was clicked on, `<n>|<i>`. */
export function anchorOf(thread: ReviewThread, value: string): Anchor | undefined {
  const [n, i] = value.split('|').map(Number)
  return thread.messages.find((m) => m.n === n)?.anchors[i]
}

/** The anchor of lines picked in a worker's Changes. */
export const linesAnchor = ({ repo, path, from, to, quote }: Lines): Anchor => ({ repo, path, from, to, ...(quote && { quote }) })

/**
 * The marks a thread's notes put on the lines they anchor to, as they read now: one per anchor, `n3`, said "noted in
 * n3". A quote of removed lines marks none, since those lines aren't in the file any more.
 */
export const threadMarks = (thread: ReviewThread): Mark[] =>
  thread.messages.flatMap((m) =>
    m.anchors.flatMap((a): Mark[] =>
      a.quote?.lang === 'diff' ? [] : [{ repo: a.repo, path: a.path, line: a.from, ...(a.to !== a.from && { to: a.to }), label: `n${m.n}`, hint: `noted in n${m.n}` }],
    ),
  )
