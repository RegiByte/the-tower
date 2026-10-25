/**
 * What the reviews extension does in the core's Tidy and discard: a landed checkout's thread filed under the moment
 * (`landedThreadId`), and a discard's recovery note, each repo's branch and tip, left on the thread before it is filed.
 */
import type { FloorThread } from './threads.ts'
import type { Tip } from '../../src/bridge/worktrees.ts'
import type { TidyEntry } from '../../src/shared/extensions.ts'

/** A floor's Tidy entry per thread whose work has landed, keyed by its checkout. */
export const tidyEntries = (threads: FloorThread[]): TidyEntry[] =>
  threads
    .filter((t) => t.landed)
    .map((t) => ({
      key: t.checkout,
      label: `◇ ${t.checkout}`,
      does: 'file landed thread',
      hint: `its work has landed: filed as ${t.checkout}@<time>.md`,
      kind: { one: 'landed thread', many: 'landed threads' },
    }))

/** The note a discard leaves on the checkout's thread: what each repo held, and how to get it back while git keeps it. */
export const discardNote = (name: string, tips: Tip[]): string =>
  [
    `Discarded the worktree ${name}: its work never landed. The branches the tower cut are deleted and their tips are on no branch, kept by git until it collects them (two weeks by default). To get one back, in its repo: \`git branch <name> <tip>\`.`,
    '',
    ...tips.flatMap((t) => [
      `- \`${t.dir}\`: ${t.branch ? `branch \`${t.branch}\`${t.base === undefined ? " (kept: the tower didn't cut it)" : ''}` : 'a detached HEAD'}, tip \`${t.tip}\`${t.dirty ? ` (${t.dirty} uncommitted ${t.dirty === 1 ? 'file' : 'files'} committed on top of \`${t.head}\`)` : ''}`,
      ...t.unpushed.map((c) => `  - ${c}`),
    ]),
  ].join('\n')
