/**
 * The Reviews panel's reading of a thread as it stood at 1.92, before review threads moved into the reviews extension:
 * kept for the deprecated copy of the panel `/panels.js` serves until 2.0, and the shapes the board's old fields hold.
 * Renderers read the extension's client, `/x/reviews/reviews.js` and `/x/reviews/panel.js`.
 */
import type { RepoChanges } from '../changes.ts'
import type { CheckoutState, FiledThread } from '../bridge/checkouts.ts'
import type { NoteAction, NoteCalls, NoteVerb } from '../bridge/verbs.ts'
import { repoName, type Anchor, type Message, type Quote, type ReviewThread } from './reviews.ts'

/**
 * A checkout's thread as `floor.threads` holds it: `messages` it holds and the `last` one, `landed` once Tidy files it,
 * where its work stands, and `note` while it is live.
 */
export type FloorThread = {
  checkout: string; id: string; tag: string; messages: number; last?: Pick<Message, 'author' | 'at' | 'n'>; landed: boolean
  /** Where its checkout's work stands: a note is offered only while it is live. */
  state: CheckoutState
  verbs: NoteVerb[]
  calls: NoteCalls
  actions: NoteAction[]
}

const HEADING = /^## (.+?) · (\d{4}-\d\d-\d\d \d\d:\d\d) · n(\d+)(?: · re n(\d+))?\s*$/
const ANCHOR = /^`([^`:\s]+):([^`]+):(\d+)(?:-(\d+))?`\s*$/
const FENCE = /^(`{3,})(\S*)\s*$/

/** The closing line of a fence opened by `ticks`. */
const closes = (line: string, ticks: string) => /^`{3,}\s*$/.test(line) && line.trim().length >= ticks.length

/** Where the message headings are in `lines`: a heading-shaped line inside a code fence belongs to a body. */
const headingsOf = (lines: string[]): number[] => {
  const at: number[] = []
  let fence: string | undefined
  lines.forEach((line, i) => {
    if (fence) {
      if (closes(line, fence)) fence = undefined
      return
    }
    const opens = FENCE.exec(line)
    if (opens) fence = opens[1]
    else if (HEADING.test(line)) at.push(i)
  })
  return at
}

const parseMessage = (lines: string[]): Message => {
  const [, author, at, n, re] = HEADING.exec(lines[0])!
  const anchors: Anchor[] = []
  let i = 1
  for (;;) {
    const anchor = ANCHOR.exec(lines[i] ?? '')
    if (!anchor) break
    const [, repo, path, from, to] = anchor
    const fence = FENCE.exec(lines[i + 1] ?? '')
    i++
    let quote: Quote | undefined
    if (fence) {
      const end = lines.findIndex((line, j) => j > i && closes(line, fence[1]))
      const stop = end === -1 ? lines.length : end
      quote = { lang: fence[2], lines: lines.slice(i + 1, stop) }
      i = stop + 1
    }
    anchors.push({ repo, path, from: Number(from), to: Number(to ?? from), quote })
  }
  return { author, at, n: Number(n), re: re === undefined ? undefined : Number(re), anchors, body: lines.slice(i).join('\n').trim() }
}

/** Total: anything before the first message heading but the title is ignored, and a body takes whatever follows. */
export const parseThread = (text: string): ReviewThread => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const title = lines.find((line) => line.startsWith('# '))
  const starts = headingsOf(lines)
  return {
    checkout: title ? title.slice(2).trim() : '',
    messages: starts.map((start, k) => parseMessage(lines.slice(start, starts[k + 1] ?? lines.length))),
  }
}

/**
 * The messages `author` hasn't seen: everything after its own last message that others wrote. A worker that never
 * wrote has seen none.
 */
export const unseenBy = (thread: ReviewThread, author: string): Message[] => {
  const own = thread.messages.findLast((m) => m.author === author)?.n ?? 0
  return thread.messages.filter((m) => m.n > own && m.author !== author)
}

/**
 * Whether an anchor's quote can still be read in the diff: `same` where its lines appear in the file's changes as they
 * were (moved or not), `changed` where the file changed and they don't, `gone` where the file has no changes left
 * (reverted, or landed upstream). A `diff` quote is looked for with its marks, any other in the file as it is now.
 */
export type AnchorState = 'same' | 'changed' | 'gone'

const holds = (lines: string[], quote: string[]) =>
  quote.length > 0 && lines.some((_, i) => quote.every((q, k) => lines[i + k] === q))

export const anchorState = (anchor: Anchor, repos: RepoChanges[]): AnchorState => {
  const file = repos.filter((r) => repoName(r.dir) === anchor.repo).flatMap((r) => r.files).find((f) => f.path === anchor.path)
  if (!file) return 'gone'
  if (!anchor.quote || !file.hunks) return 'changed'
  const marked = file.hunks.flatMap((h) => h.lines)
  const now = marked.filter((l) => l[0] === ' ' || l[0] === '+').map((l) => l.slice(1))
  return holds(anchor.quote.lang === 'diff' ? marked : now, anchor.quote.lines) ? 'same' : 'changed'
}

/** A note's call as the reviews extension's part names it. */
type NoteCall = [verb: string, input: { project: string; checkout: string }]

/** The reviews extension's part of a card, as it stood at the move. */
export type { FiledThread }

export type ReviewsCardPart = { thread: string; threadState: CheckoutState; unseen?: number; filed?: FiledThread; note?: NoteCall }

/** The reviews extension's part of a floor, as LEGACY reads it: as it stood at the move, its calls naming `reviews/append`, and its notes `resolved` since 1.94. */
export type ReviewsFloorPart = {
  threads: (Omit<FloorThread, 'calls' | 'actions'> & { key: string; resolved: number[]; calls: { note?: NoteCall }; actions: { verb: 'note'; call: NoteCall }[] })[]
}

/** A reviewer's verdict in its closing note. */
export type Verdict = 'ship' | 'fix first' | 'rethink'

/** A thread as history: `landed`, when Tidy filed it (a message heading's time); none while its work is unlanded. */
export type ReviewRecord = { id: string; checkout: string; landed?: string; messages: (Message & { verdict?: Verdict })[] }

/** What one author wrote across the threads: notes, replies (`re` another), each verdict, and the checkouts written on. */
export type AuthorTally = { notes: number; replies: number; verdicts: Partial<Record<Verdict, number>>; checkouts: string[] }

export type ReviewHistory = { threads: ReviewRecord[]; authors: Record<string, AuthorTally> }
