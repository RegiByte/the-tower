/**
 * What the core knows of review threads, the reviews extension's store (decision `review-threads`): the collection's
 * name, a thread's file and a filed thread's, a reviewer's first prompt, and the shapes a note's anchors take. Each
 * thread is one append-only markdown file per checkout, `collections/<project>/reviews/<checkout>.md`; its format is the
 * extension's (`extensions/reviews/client/reviews.ts`, served at `/x/reviews/reviews.js`).
 */

/** The collection the threads are kept in: the reviews extension's, owned. */
export const REVIEWS = 'reviews'

/** The lines quoted under an anchor. A quote holding removed lines is a `diff`, each line keeping git's mark. */
export type Quote = { lang: string; lines: string[] }

/** `repo` is named as the Changes pane names it: the main checkout's folder. `from`–`to` count the file's lines from 1. */
export type Anchor = { repo: string; path: string; from: number; to: number; quote?: Quote }

/** `at`: local time as written, `YYYY-MM-DD HH:MM`. `re`: the number of the message it answers. */
export type Message = { author: string; at: string; n: number; re?: number; anchors: Anchor[]; body: string }

export type ReviewThread = { checkout: string; messages: Message[] }

/**
 * The mod's skill a reviewer starts with, on the callsign of the worker whose work it reviews.
 * @deprecated since 1.95: a reviewer is hired with `reviews/hire`, and is known by its card's `x.reviews.of`. Goes at 2.0.
 */
export const REVIEW_SKILL = '/tower:review'

/**
 * A reviewer's first prompt. With `tell`, the reviewer submits a pointer to its notes into the author when done.
 * @deprecated since 1.95: hire a reviewer with `reviews/hire`. Goes at 2.0.
 */
export const reviewPrompt = (callsign: string, tell: boolean) => `${REVIEW_SKILL} ${callsign}${tell ? ' tell' : ''}`

/**
 * The callsign a reviewer's first prompt names; `undefined` for any other prompt.
 * @deprecated since 1.95: read the card's `x.reviews.of` (`reviewerOf`). Goes at 2.0.
 */
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

/** The local time a message heading carries. */
export const stamp = (date: Date): string => {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** A repo as the Changes pane and anchors name it: the folder of its main checkout, also for its worktrees. */
export const repoName = (dir: string): string => dir.split('/.worktrees/')[0].split('/').filter(Boolean).at(-1)!

const LANGS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', json: 'json', md: 'md', html: 'html', css: 'css', py: 'py',
  sh: 'sh', clj: 'clojure', cljs: 'clojure', edn: 'clojure', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', sql: 'sql', yml: 'yaml', yaml: 'yaml',
}

/** The fence language of a quote from `path`: its extension's, or none. */
export const langOf = (path: string): string => LANGS[path.split('.').at(-1)!.toLowerCase()] ?? ''
