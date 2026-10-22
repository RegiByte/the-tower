/**
 * What the tower lets a user do, as data every renderer reads alike: capabilities, one line each, and patterns, short
 * stories of what users found doing with the tower that no feature is named for. A capability may name a keymap command
 * (`/keymap.js`) that tries it, whose chords a renderer names from `board.keys`, never from the text, or a verb a floor
 * offers in its `actions`. Patterns are markdown files in the checkout's `docs/patterns/`, read at `GET /patterns`, each
 * parsed by `parsePattern`. A renderer shows them as tips: `tipsOf` lays them out, `tipAt` picks the one showing now.
 * The tower serves this module as `/capabilities.js`.
 */
import type { FloorVerb } from '../bridge/verbs.ts'
import type { CommandId } from './keymap.ts'

export type Capability = { id: string; text: string; command?: CommandId; verb?: FloorVerb }

/** A pattern's `id` is its file's name without `.md`; `story` is markdown. */
export type Pattern = { id: string; title: string; summary: string; story: string }

/** A capability or a pattern as a renderer shows it; `tipKey` names it among both, as a dismissal keeps it. */
export type Tip = ({ kind: 'capability' } & Capability) | ({ kind: 'pattern' } & Pattern)

export const CAPABILITIES: Capability[] = [
  { id: 'hire-crew', text: 'Ask a worker to split a task and hire a crew for it with `tower hire`.' },
  { id: 'changes', text: 'Changes holds all a worker changed, in every repo of its floor.', command: 'pane-changes' },
  { id: 'review-notes', text: 'Pick lines in Changes to leave a note on the worker’s review thread.', command: 'pane-changes' },
  { id: 'review-self', text: 'Tell a worker “get yourself reviewed when you’re done”: it hires its reviewer.' },
  { id: 'brief', text: 'The Brief reads a worker’s last turns as a chat, without scrolling its terminal.', command: 'pane-brief' },
  { id: 'next-waiting', text: 'Go to the next worker waiting on you: a question first, then the longest wait.', command: 'next-waiting' },
  { id: 'move', text: 'Step through the workers on duty from anywhere, a terminal included.', command: 'next-worker' },
  { id: 'show', text: 'Ask a worker to show you what it made: it opens beside its terminal.' },
  { id: 'drafts', text: 'Say “keep that as a draft”: a draft starts a worker when you are ready.' },
  { id: 'shell-here', text: 'Open a shell in the selected worker’s directory, and toggle back, from the keyboard.', command: 'shell-here' },
  { id: 'shells', text: 'Shells keep running after you close the page or restart the tower.', verb: 'shell' },
  { id: 'stats', text: 'Stats reads spend, waits and the week’s budget; The Week reads it as a yearbook.' },
  { id: 'tidy', text: 'A floor’s Tidy lists what can go, landed worktrees to old logs; nothing goes unasked.', verb: 'tidy' },
  { id: 'policies', text: 'A policy is standing work: “every weekday at 9, check the dependency updates”.' },
  { id: 'resume', text: 'A worker that ended resumes from its floor’s archive, its conversation carried on.' },
  { id: 'keys', text: 'Every key and what each status means are on one sheet; the config rebinds any key.', command: 'help' },
]

/** A pattern from its file: `# Title`, a blank line, a one-paragraph summary, a blank line, then the story. */
export const parsePattern = (id: string, markdown: string): Pattern => {
  const [head, summary, ...story] = markdown.trim().split(/\n\s*\n/)
  const title = /^# (.+)$/.exec(head ?? '')?.[1]
  if (!title || !summary || !story.length) throw new Error(`docs/patterns/${id}.md: write "# Title", a blank line, a one-paragraph summary, a blank line, then the story`)
  return { id, title: title.trim(), summary: summary.replace(/\s*\n\s*/g, ' ').trim(), story: story.join('\n\n').trim() }
}

export const tipKey = (tip: Pick<Tip, 'kind' | 'id'>) => `${tip.kind}/${tip.id}`

/** Capabilities and patterns as one list, a pattern after every three capabilities, those `dismissed` (by `tipKey`) left out. */
export const tipsOf = (capabilities: readonly Capability[], patterns: readonly Pattern[], dismissed: readonly string[]): Tip[] => {
  const caps: Tip[] = capabilities.map((c) => ({ kind: 'capability', ...c }))
  const pats: Tip[] = patterns.map((p) => ({ kind: 'pattern', ...p }))
  const laid = caps.flatMap((c, i) => ((i + 1) % 3 === 0 && pats.length ? [c, pats.shift()!] : [c]))
  return [...laid, ...pats].filter((t) => !dismissed.includes(tipKey(t)))
}

/** How long one tip shows before the next. */
export const TIP_MS = 5 * 60_000

/** The tip showing at `now` for a viewer whose page drew `seed` as it loaded: the next one every `TIP_MS`. */
export const tipAt = (tips: readonly Tip[], seed: number, now: number): Tip | undefined =>
  tips.length ? tips[(seed + Math.floor(now / TIP_MS)) % tips.length] : undefined
