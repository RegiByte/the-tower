import type { Floor } from '../bridge/board.ts'
import type { Exposure, FloorWorktree, LandingRead, WorktreeState } from '../bridge/worktrees.ts'
import type { Call, Replies } from './api.ts'
import { base, esc } from './format.ts'
import { callOf } from './offered.ts'
import { VERB_WORDS } from './verb-words.ts'

/**
 * Worktrees and kept branches in words: their states, the verbs on them and what each asks, and work landed as copies.
 */

/** How many worktrees a floor holds that would lose work if removed, or whose folder is gone. */
export const risky = (f: Floor) => f.worktrees.filter((w) => w.state === 'at-risk' || w.state === 'lost').length

export const WORKTREE_STATE_NAME: Record<WorktreeState, string> = { live: 'in use', lost: 'folder gone', 'at-risk': 'unsaved work', carried: 'landed, edited', removable: 'removable' }

/** The verbs on worktrees and kept branches, as the sidebar's small buttons say them: their labels (`/verb-words.js`), lowercased. */
export const WORKTREE_VERB_NAME = {
  recut: VERB_WORDS['worktree/recut'].label.toLowerCase(),
  prune: VERB_WORDS['worktree/prune'].label.toLowerCase(),
  remove: VERB_WORDS['worktree/remove'].label.toLowerCase(),
  delete: VERB_WORDS['branch/delete'].label.toLowerCase(),
  discard: VERB_WORDS['worktree/discard'].label.toLowerCase(),
}

/** What a worktree verb asks before it runs, by the name of the worktree or kept branch; a verb absent asks nothing. */
export const WORKTREE_ASK: Partial<Record<keyof typeof WORKTREE_VERB_NAME, (name: string) => string>> = {
  remove: (name) => `Remove the worktree ${name} in every repo?\n\nIts branch is deleted where it is absorbed into its base, or landed there as copies; refused when work would be lost.`,
  prune: (name) => `Forget the lost worktree ${name}?\n\nIts branch is deleted where it is absorbed into its base.`,
  delete: (name) => `Delete the kept branch ${name} in every repo where it is absorbed into its base?`,
}

/** What a worktree verb did, said before the name of the worktree or kept branch. */
export const WORKTREE_DONE = { recut: 'recut', prune: 'forgot', remove: 'removed', delete: 'deleted' } as const

/** The branch of a worktree, as its hub repo (or its first) has it checked out. */
export const worktreeBranch = (w: FloorWorktree) => w.repos[0].branch ?? 'detached'

/** What only a worktree holds, per repo at risk: its uncommitted files and unpushed commits, a few of each named. */
export const worktreeRisk = (w: FloorWorktree): string[] =>
  w.repos.filter((r) => r.atRisk).map((r) => `${base(r.dir)}: ${r.dirty} uncommitted, ${r.unpushed} unpushed${r.risk.length ? ` (${r.risk.join('; ')})` : ''}`)

/**
 * How work landed as copies, summed over the repos that carry it: `3 on origin/main, 1 edited when it landed`. Each
 * edited copy is a different patch from the branch's commit (`tower.landing` shows how).
 */
export const carriedLine = (repos: Pick<Exposure, 'absorbed' | 'carried' | 'against'>[]) => {
  const carried = repos.filter((r) => !r.absorbed && r.carried)
  const commits = carried.reduce((n, r) => n + r.carried!.commits, 0)
  const edited = carried.reduce((n, r) => n + r.carried!.edited, 0)
  const on = [...new Set(carried.map((r) => r.against))].join(', ')
  return `${commits} on ${on}, ${edited} edited when ${edited === 1 ? 'it' : 'they'} landed`
}

/**
 * A worktree or kept branch whose work landed as copies, some edited: what it is, how it landed, the `landing` read
 * that shows what landing changed, and the call that removes it. Never in Tidy's plan: each goes by its own press.
 */
export type EditedRow = { what: string; does: string; title: string; landing: { project: string; branch: string }; call: Call<'worktree/remove'> | Call<'branch/delete'> }

/** An edited landing in a few words: `remove · 1 of 2 edited`. */
const editedDoes = (repos: Pick<Exposure, 'absorbed' | 'carried'>[]) => {
  const carried = repos.filter((r) => !r.absorbed && r.carried).map((r) => r.carried!)
  return `remove · ${carried.reduce((n, c) => n + c.edited, 0)} of ${carried.reduce((n, c) => n + c.commits, 0)} edited`
}

export const editedRows = (f: Floor): EditedRow[] => [
  ...f.worktrees.flatMap((w) => {
    const call = w.state === 'carried' && callOf(w, 'remove')
    return call ? [{
      what: `⎇ ${w.name}`,
      does: editedDoes(w.repos),
      title: `${carriedLine(w.repos)}: what landing changed is lost from the branch once the worktree is removed`,
      landing: { project: f.id, branch: worktreeBranch(w) },
      call,
    }] : []
  }),
  ...f.branches.flatMap((b) => {
    const call = b.carried && callOf(b, 'delete')
    return call ? [{
      what: `⎇ ${b.name}`,
      does: editedDoes(b.repos),
      title: `a kept branch, ${carriedLine(b.repos)}: what landing changed is lost once it is deleted`,
      landing: { project: f.id, branch: b.name },
      call,
    }] : []
  }),
]

/** What landing changed, as html: per repo, each commit landed edited with its copy, and `git range-diff` between them. */
export const landingHtml = (l: LandingRead) =>
  l.repos
    .map(
      (r) => `<section class="landing-repo"><h3>${esc(base(r.dir))} <small>on ${esc(r.against)}</small></h3>${
        r.edits.map((e) => `<div class="landing-edit"><div><b>${esc(e.subject)}</b> <code>${e.commit.slice(0, 7)}</code> → <code>${e.copy.slice(0, 7)}</code></div><pre>${esc(e.rangeDiff)}</pre></div>`).join('') || '<p>nothing edited</p>'
      }</section>`,
    )
    .join('')

/** What a discard asks before it runs: what it throws away, and that its tips are noted. */
export const discardAsk = (w: FloorWorktree) =>
  `Discard ${w.name}? Its work never landed:\n\n${worktreeRisk(w).join('\n')}\n\nIts worktrees are removed with force and its branches deleted. Each tip, uncommitted files included, is recorded first (on its review thread, with reviews on), recoverable with git branch until git collects it.`

/** Where a record of a discard is now: the item its done answer names (a filed thread), else its record's, else its extension. */
const recordAt = (r: Replies['worktree/discard'], cap: string, recorded: { item?: { id: string } }) => {
  const done = r.done?.[cap]
  return (done && 'item' in done ? done.item?.id : undefined) ?? recorded.item?.id ?? `${cap}'s record`
}

/** What a discard did, in a line: `discarded tower/x at a4cf18c: tips noted on x@2026-10-07-1530.md`, each record where it is now. */
export const discardedLine = (r: Replies['worktree/discard']) =>
  `discarded ${r.tips.map((t) => `${t.branch ?? base(t.dir)} at ${t.tip.slice(0, 7)}`).join(', ')}: tips noted on ${Object.entries(r.x ?? {}).map(([cap, a]) => recordAt(r, cap, a)).join(', ')}${keptLine(r)}`

/** The branches a worktree or branch verb kept, each with why, to follow its line: `; tower/x in /repo: kept, …`. */
export const keptLine = (r: { t: string; kept?: string[] }) => (r.kept?.length ? `; ${r.kept.join('; ')}` : '')

/** Per repo whose recorded base is gone on origin: what its absorbed check ran against instead. */
export const goneBases = (repos: { dir: string; base?: string; against?: string }[]): string[] =>
  repos.filter((r) => r.base && r.against !== r.base).map((r) => `${base(r.dir)}: ${r.base} is gone on origin, checked against ${r.against ?? 'nothing: origin has no default'}`)

/** A kept branch's repos, one line each: its base, what only it holds, and whether its work is in. */
export const keptBranchLines = (b: Floor['branches'][number]): string[] => [
  ...b.repos.map((r) => `${base(r.dir)}: from ${r.base}, ${r.unpushed} unpushed${r.absorbed ? ', absorbed' : r.carried ? `, ${carriedLine([r])}` : ''}`),
  ...goneBases(b.repos),
]
