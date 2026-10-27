import type { Card, CardSubagent, Floor, HiredBy } from '../bridge/board.ts'
import { base, commandName, modelName, tokenCount } from './format.ts'
import { current, UNRESUMABLE_TITLE } from './status-words.ts'
import { subagentEnd, subagentTokens } from './subagents.ts'
import { reviewerOf } from './checkouts.ts'

/**
 * A worker's particulars: where it works, how it stands to others, what it showed, and the details its header keeps
 * folded.
 */

/** A subagent as a row of the worker's details: `fork · Read facts.txt · 79.0 k tokens · answered`. */
const subagentRow = (run: CardSubagent) => `${run.type} · ${run.description} · ${tokenCount(subagentTokens(run))} tokens · ${subagentEnd(run)}`

/** One showing of a target: showing it again is a new one, so closing one leaves the next of the same target open. */
export const shownKey = (s: Card['shown'][number]) => `${s.session}|${s.target}|${s.at}`

/** Where the showing is served: a file through the tower, by the session that showed it; a page at its own address. */
export const shownHref = (s: Card['shown'][number]) => (s.kind === 'file' ? `/shown/${s.session}${s.target.split('/').map(encodeURIComponent).join('/')}` : s.target)

/** What a worker showed, named: its own title, else the file's name or the page's host. */
export const shownTitle = (s: Card['shown'][number]) => s.title ?? (s.kind === 'file' ? base(s.target) : new URL(s.target).host)

/** The branch a worker works on, `⎇ tower/hugin-02`; `''` in a main checkout. */
export const branchLine = (c: Card) => (c.worktree ? `⎇ ${c.worktree.branch ?? `${c.worktree.name}, detached`}` : '')

/** A hirer by callsign, with its floor when it hired onto another than `project`: `PEDRINHO-33 (tower)`. */
export const hirerName = (by: HiredBy, project: string) => `${by.callsign}${by.project === project ? '' : ` (${by.project})`}`

/**
 * How a worker's work stands to others': `reviews`, the callsign whose work it reviews, else the checkout its worktree
 * was forked from; and who hired it, when that isn't whose work it reviews. @since 1.97
 */
export const pairLineOf = (c: Card, reviews: string | undefined) =>
  [reviews ? `reviews ${reviews}` : c.worktree?.from ? `fork of ${c.worktree.from}` : '', c.hiredBy && c.hiredBy.callsign !== reviews ? `hired by ${hirerName(c.hiredBy, c.project)}` : '']
    .filter(Boolean)
    .join(' · ')

/** Where a worker works, short: its floor, then its branch in a worktree or its folder off the hub, and `pairLineOf`. @since 1.97 */
export const whereLineOf = (c: Card, f: Floor | undefined, reviews: string | undefined) =>
  [f?.name ?? c.project, c.worktree ? branchLine(c) : c.cwd === f?.hub ? '' : base(c.cwd), pairLineOf(c, reviews)].filter(Boolean).join(' · ')

/** `pairLineOf`, whose work it reviews read from its card's `x.reviews.of`. @deprecated since 1.97: `pairLineOf` with `reviewerOf` of `/x/reviews/reviews.js`; goes at 2.0. */
export const pairLine = (c: Card) => pairLineOf(c, reviewerOf(c))

/** `whereLineOf`, whose work it reviews read from its card's `x.reviews.of`. @deprecated since 1.97: `whereLineOf` with `reviewerOf` of `/x/reviews/reviews.js`; goes at 2.0. */
export const whereLine = (c: Card, f: Floor | undefined) => whereLineOf(c, f, reviewerOf(c))

/**
 * The session a worker's conversation came from, as label and value, its start in `when`'s words: its own earlier
 * session when the callsign carried over; none when it resumes nothing.
 */
export const resumesRow = (c: Card, when: (ms: number) => string): [string, string] => {
  const ref = current(c)?.resumes
  if (!ref) return ['resumes', '']
  return ref.callsign === c.callsign ? ['continues', `its session of ${when(ref.startedAt)}`] : ['resumes', `${ref.callsign}, session of ${when(ref.startedAt)}`]
}

/** What a worker's header keeps out of sight until asked, as label and value: only what is known. */
export const detailsOf = (c: Card): [string, string][] =>
  ([
    ['model', [modelName(c.model), c.effort].filter(Boolean).join(' · ')],
    ['claude', c.claude ? `${c.claude}${c.claudeUntested ? ' · untested' : ''}` : ''],
    ['context', c.context !== undefined ? `${c.context}% of the window` : ''],
    ['cost', c.costUsd != null ? `$${c.costUsd.toFixed(2)}` : ''],
    ['subagents', c.subagents ? [String(c.subagents), ...c.subagentRuns.map(subagentRow)].join('\n') : ''],
    ['folder', c.cwd],
    ['resume', c.unresumable ? UNRESUMABLE_TITLE[c.unresumable] : ''],
    ['worktree', c.worktree ? `${c.worktree.name} ${branchLine(c)}` : ''],
    ['conversations', c.conversations.length > 1 ? String(c.conversations.length) : ''],
    ['left running', c.resources.map((r) => `${r.pid}${r.ports.map((p) => ` :${p}`).join('')}${r.orphan ? ' orphan' : ''} · ${commandName(r.command)}`).join('\n')],
  ] as [string, string][]).filter(([, value]) => value)
