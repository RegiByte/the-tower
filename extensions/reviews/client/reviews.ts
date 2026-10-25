/**
 * Review threads: one append-only markdown file per checkout, `collections/<project>/reviews/<checkout>.md`, where
 * the user, the workers in the checkout and reviewers talk about its unlanded work. A checkout is a tower worktree
 * across every repo of its project, by name, or `main` for the main checkouts.
 *
 *   # odin-42
 *
 *   ## Ana · 2026-10-06 14:32 · n1
 *   `acme-api:src/routes/ticket.ts:31-34`
 *   ```ts
 *   for (const file of untracked.slice(0, 300)) {
 *   ```
 *   Why one by one?
 *
 *   ## ODIN-42 · 2026-10-06 14:40 · n2 · re n1
 *   git diff never shows untracked files.
 *
 * Each message is a heading (author, local time, number, the message it answers), then its anchors, each a
 * `repo:path:lines` followed by the lines as they were, then its body. Nothing else is stored: what a worker hasn't
 * seen is worked out from who wrote what. The reviews extension's client, served at `/x/reviews/reviews.js` (and at
 * `/reviews.js` through `LEGACY` until 2.0); the names the core shares with it come from `src/shared/reviews.ts`.
 */
import type { RepoChanges } from '../../../src/changes.ts'
import { repoName, type Anchor, type Message, type Quote, type ReviewThread } from '../../../src/shared/reviews.ts'

export {
  REVIEWS, REVIEW_SKILL, reviewPrompt, reviewedIn, threadId, checkoutOfId, landedThreadId, stamp, repoName, langOf,
  type Quote, type Anchor, type Message, type ReviewThread,
} from '../../../src/shared/reviews.ts'

/** Who a renderer's Send names to the worker: the person running the tower, whose notes are signed with `board.user.name`. */
export const THE_USER = 'the user'

/** A landed thread's checkout and when it was filed, as a message heading writes a time. */
export const landedOfId = (id: string): { checkout: string; landed: string } | undefined => {
  const [, checkout, day, hh, mm] = /^(.+)@(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)\.md$/.exec(id) ?? []
  return checkout === undefined ? undefined : { checkout, landed: `${day} ${hh}:${mm}` }
}

/** The threads Tidy filed in a floor's `reviews` items, the one filed last first, each with its item's tag. */
export const landedThreads = (items: { id: string; tag: string }[]) =>
  items
    .flatMap((item) => {
      const filed = landedOfId(item.id)
      return filed ? [{ ...filed, id: item.id, tag: item.tag }] : []
    })
    .sort((a, b) => b.landed.localeCompare(a.landed))

/** A reviewer's closing note says what to do with the work in bold (the mod's `review` skill), `**ship**` or `**Verdict: ship**`. */
export type Verdict = 'ship' | 'fix first' | 'rethink'

export const verdictOf = (m: Message): Verdict | undefined =>
  m.anchors.length ? undefined : (/\*\*(?:verdict:\s*)?(ship|fix first|rethink)\b/i.exec(m.body)?.[1].toLowerCase() as Verdict | undefined)

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

/** A fence longer than any run of backticks in what it holds. */
const fenceFor = (lines: string[]) => '`'.repeat(Math.max(3, ...lines.map((l) => Math.max(0, ...(l.match(/`+/g) ?? []).map((run) => run.length + 1)))))

const anchorLines = ({ repo, path, from, to, quote }: Anchor): string[] => {
  const head = `\`${repo}:${path}:${from === to ? from : `${from}-${to}`}\``
  if (!quote) return [head]
  const fence = fenceFor(quote.lines)
  return [head, `${fence}${quote.lang}`, ...quote.lines, fence]
}

export const printMessage = (m: Message): string =>
  [`## ${m.author} · ${m.at} · n${m.n}${m.re === undefined ? '' : ` · re n${m.re}`}`, ...m.anchors.flatMap(anchorLines), ...(m.body ? [m.body] : [])].join('\n') + '\n'

export const printThread = (thread: ReviewThread): string => [`# ${thread.checkout}\n`, ...thread.messages.map(printMessage)].join('\n')

/** `text` with `m` appended: a thread is only ever written by appending. */
export const appended = (text: string | undefined, checkout: string, m: Message): string =>
  `${text === undefined || !text.trim() ? `# ${checkout}\n` : text.endsWith('\n') ? text : `${text}\n`}\n${printMessage(m)}`

/** The line index where a code fence opens and is never closed, if one is. */
const openFenceAt = (lines: string[]): number | undefined => {
  let open: { ticks: string; at: number } | undefined
  lines.forEach((line, i) => {
    if (open) {
      if (closes(line, open.ticks)) open = undefined
      return
    }
    const opens = FENCE.exec(line)
    if (opens) open = { ticks: opens[1], at: i }
  })
  return open?.at
}

/**
 * What would break the thread if it were appended: a body line outside a fence that reads as a message heading, or a
 * code fence left open, which would turn every later message heading into fence content.
 */
export const bodyProblem = (body: string): string | undefined => {
  const lines = body.split('\n')
  const heading = headingsOf(lines)[0]
  if (heading !== undefined) return `line ${heading + 1} of the body reads as a message heading: "${lines[heading]}"`
  const fence = openFenceAt(lines)
  return fence === undefined ? undefined : `the code fence opened on line ${fence + 1} of the body is never closed: close it with a line of ${lines[fence].trim().match(/^`+/)![0]}`
}

/** A message's number is one past the last. */
export const nextNumber = (thread: ReviewThread): number => (thread.messages.at(-1)?.n ?? 0) + 1

const RESOLVED = /^\*\*Resolved:\*\* (n\d+(?:, n\d+)*)\s*$/

/**
 * The notes a message marks resolved: a resolution is a note like any other whose body opens with
 * `**Resolved:** n3, n4`, so a thread holding one reads as before wherever resolving is unknown.
 */
export const resolvesOf = (m: Message): number[] => {
  const marked = RESOLVED.exec(m.body.split('\n', 1)[0])
  return marked ? marked[1].split(', ').map((n) => Number(n.slice(1))) : []
}

/** A resolution's body: the mark, then what the resolver adds. */
export const resolutionBody = (notes: number[], body = ''): string =>
  [`**Resolved:** ${notes.map((n) => `n${n}`).join(', ')}`, ...(body.trim() ? ['', body.trim()] : [])].join('\n')

/** Each resolved note of the thread, by number, with the note that resolved it first. */
export const resolvedIn = (thread: ReviewThread): Map<number, number> => {
  const resolved = new Map<number, number>()
  for (const m of thread.messages) for (const n of resolvesOf(m)) if (!resolved.has(n)) resolved.set(n, m.n)
  return resolved
}

/** Why `notes` can't be resolved on `thread`, if they can't: each must be a note of it, unresolved and no resolution. */
export const resolveProblem = (thread: ReviewThread, notes: number[]): string | undefined => {
  const resolved = resolvedIn(thread)
  for (const n of notes) {
    const m = thread.messages.find((m) => m.n === n)
    if (!m) return `The thread of ${thread.checkout} holds no n${n}`
    if (resolved.has(n)) return `n${n} is resolved already, by n${resolved.get(n)}`
    if (resolvesOf(m).length) return `n${n} is a resolution: it resolves nothing further`
  }
  return undefined
}

/**
 * The messages `author` hasn't seen: everything after its own last message that others wrote, but notes resolved
 * since and resolutions saying nothing more. A worker that never wrote has seen none.
 */
export const unseenBy = (thread: ReviewThread, author: string): Message[] => {
  const own = thread.messages.findLast((m) => m.author === author)?.n ?? 0
  const resolved = resolvedIn(thread)
  return thread.messages.filter((m) => m.n > own && m.author !== author && !resolved.has(m.n) && !(resolvesOf(m).length && !m.body.includes('\n')))
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

/**
 * The prompt that sends a worker to a thread: who sent it (a callsign, or `THE_USER`), which notes are new to it, how to read and answer
 * them, and, to a hired worker, that it reports to its `hirer` once it has (the card's `hiredBy`). One line, so it lands in the composer as typed.
 */
export const sendText = (sender: string, checkout: string, notes: number[], hirer: string | undefined): string =>
  `Review notes from ${sender}${notes.length ? ` (${notes.map((n) => `n${n}`).join(', ')})` : ''} on checkout ${checkout}: read the thread with \`tower thread ${checkout}\`, act on them, and answer each with \`tower note on ${checkout} re n<k>\` (the reply on stdin).` +
  (hirer ? ` Once you have answered them, report to ${hirer}, who hired you: what changed and whether the work is ready.` : '')
