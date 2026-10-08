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
 * seen is worked out from who wrote what. Imports nothing, so every renderer can load it (`/reviews.js`).
 */
import type { RepoChanges } from '../changes.ts'

/** The collection the threads are kept in, declared in the config like any other. */
export const REVIEWS = 'reviews'

/** Who a renderer's Send names to the worker: the person running the tower, whose notes are signed with `board.user.name`. */
export const THE_USER = 'the user'

/** The lines quoted under an anchor. A quote holding removed lines is a `diff`, each line keeping git's mark. */
export type Quote = { lang: string; lines: string[] }

/** `repo` is named as the Changes pane names it: the main checkout's folder. `from`–`to` count the file's lines from 1. */
export type Anchor = { repo: string; path: string; from: number; to: number; quote?: Quote }

/** `at`: local time as written, `YYYY-MM-DD HH:MM`. `re`: the number of the message it answers. */
export type Message = { author: string; at: string; n: number; re?: number; anchors: Anchor[]; body: string }

export type ReviewThread = { checkout: string; messages: Message[] }

/** The mod's skill a reviewer starts with, on the callsign of the worker whose work it reviews. */
export const REVIEW_SKILL = '/tower:review'

/** A reviewer's first prompt. With `tell`, the reviewer submits a pointer to its notes into the author when done. */
export const reviewPrompt = (callsign: string, tell: boolean) => `${REVIEW_SKILL} ${callsign}${tell ? ' tell' : ''}`

/** The callsign a reviewer's first prompt names; `undefined` for any other prompt. */
export const reviewedIn = (prompt: string | undefined): string | undefined =>
  prompt?.startsWith(`${REVIEW_SKILL} `) ? /^[A-Z][A-Z0-9]*-\d+\b/.exec(prompt.slice(REVIEW_SKILL.length).trim())?.[0] : undefined

/** A thread's file name in the collection. */
export const threadId = (checkout: string) => `${checkout}.md`

/** The checkout a live thread's file is about; a landed thread's file is none. */
export const checkoutOfId = (id: string): string | undefined => /^([^@]+)\.md$/.exec(id)?.[1]

/**
 * A landed thread's file: Tidy files a thread under its checkout and the local time it found the work landed
 * (`odin-42@2026-10-07-1530.md`), and the checkout's name is free for a thread about new work.
 */
export const landedThreadId = (checkout: string, date: Date): string => `${checkout}@${stamp(date).replace(' ', '-').replace(':', '')}.md`

/** A landed thread's checkout and when it was filed, as a message heading writes a time. */
export const landedOfId = (id: string): { checkout: string; landed: string } | undefined => {
  const [, checkout, day, hh, mm] = /^(.+)@(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)\.md$/.exec(id) ?? []
  return checkout === undefined ? undefined : { checkout, landed: `${day} ${hh}:${mm}` }
}

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

/** The local time a message heading carries. */
export const stamp = (date: Date): string => {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** What would break the thread if it were appended: a body line outside a fence that reads as a message heading. */
export const bodyProblem = (body: string): string | undefined => {
  const lines = body.split('\n')
  const heading = headingsOf(lines)[0]
  return heading === undefined ? undefined : `line ${heading + 1} of the body reads as a message heading: "${lines[heading]}"`
}

/** A message's number is one past the last. */
export const nextNumber = (thread: ReviewThread): number => (thread.messages.at(-1)?.n ?? 0) + 1

/**
 * The messages `author` hasn't seen: everything after its own last message that others wrote. A worker that never
 * wrote has seen none.
 */
export const unseenBy = (thread: ReviewThread, author: string): Message[] => {
  const own = thread.messages.findLast((m) => m.author === author)?.n ?? 0
  return thread.messages.filter((m) => m.n > own && m.author !== author)
}

/** A repo as the Changes pane and anchors name it: the folder of its main checkout, also for its worktrees. */
export const repoName = (dir: string): string => dir.split('/.worktrees/')[0].split('/').filter(Boolean).at(-1)!

const LANGS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', json: 'json', md: 'md', html: 'html', css: 'css', py: 'py',
  sh: 'sh', clj: 'clojure', cljs: 'clojure', edn: 'clojure', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', sql: 'sql', yml: 'yaml', yaml: 'yaml',
}

/** The fence language of a quote from `path`: its extension's, or none. */
export const langOf = (path: string): string => LANGS[path.split('.').at(-1)!.toLowerCase()] ?? ''

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
 * The prompt that sends a worker to a thread: who sent it (a callsign, or `THE_USER`), which notes are new to it, and how to read and answer
 * them. One line, so it lands in the composer as typed.
 */
export const sendText = (sender: string, checkout: string, notes: number[]): string =>
  `Review notes from ${sender}${notes.length ? ` (${notes.map((n) => `n${n}`).join(', ')})` : ''} on checkout ${checkout}: read the thread with \`tower thread ${checkout}\`, act on them, and answer each with \`tower note on ${checkout} re n<k>\` (the reply on stdin).`
