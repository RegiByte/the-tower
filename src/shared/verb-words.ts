/**
 * The words for every verb the board offers, its human facet: what a button or a palette entry calls it (`label`), what
 * it does and when (`hint`), and whether it asks first because it can't be taken back (`destructive`). A verb is named
 * by its subject and its name, `<subject>/<verb>` (`card/send-home`, `worktree/recut`): one name means different
 * things on different subjects. `api` is the renderer API's verb its call makes, whose description and input schema in
 * `VERBS` (`/schema`, `tower api`) are its agent facet; moves within a renderer have none. `command` is the keymap
 * command (`/keymap.js`) that does the same for the selected worker. The tower serves this module as `/verb-words.js`.
 */
import type { BranchVerb, CardVerb, ConversationVerb, FloorVerb, NoteVerb, ResourceVerb, WorktreeVerb } from '../bridge/verbs.ts'
import type { Verb } from './api.ts'
import type { CommandId } from './keymap.ts'

/** What each subject on the board offers, by the name its `actions` carry. */
export type SubjectVerbs = {
  card: CardVerb
  floor: FloorVerb
  conversation: ConversationVerb
  resource: ResourceVerb
  worktree: WorktreeVerb
  branch: BranchVerb
  note: NoteVerb
}

export type Subject = keyof SubjectVerbs

/** A verb as `<subject>/<verb>`, for every verb any subject offers. */
export type VerbId = { [S in Subject]: `${S}/${SubjectVerbs[S]}` }[Subject]

export type VerbWords = { label: string; hint: string; destructive?: true; api?: Verb; command?: CommandId }

export const verbId = <S extends Subject>(subject: S, verb: SubjectVerbs[S]) => `${subject}/${verb}` as VerbId

export const VERB_WORDS: Record<VerbId, VerbWords> = {
  'card/drive': { label: 'Open terminal', hint: 'Answer in its terminal, as you would in Claude.', command: 'pane-terminal' },
  'card/submit': { label: 'Send a prompt', hint: 'Type a prompt into its composer from outside its terminal, and submit it.', api: 'submit' },
  'card/resume': { label: 'Resume', hint: 'Continue its latest conversation as a new session.', api: 'resume' },
  'card/carry-on': { label: 'Carry on', hint: 'Resume it on a prompt telling it it was cut off mid-turn, so it takes the turn up again.', api: 'resume' },
  'card/goto': { label: 'Go to its resume', hint: 'Go to the worker that carries on its conversation.' },
  'card/brief': { label: 'Brief', hint: 'Its last prompts and answers, read as a chat.', command: 'pane-brief' },
  'card/review': { label: 'Review', hint: 'Hire a reviewer: it works in a fork of its checkout, reviews once and leaves notes on its thread.', api: 'spawn' },
  'card/reap': { label: 'End all', hint: 'End every process it left running.', destructive: true, api: 'reap' },
  'card/kill': { label: 'Kill', hint: 'End its session; its conversation can be resumed.', destructive: true, api: 'kill' },
  'card/let-go': { label: 'Let go', hint: 'Take it off duty without resuming it; its conversation stays in the archive.', destructive: true, api: 'let-go' },
  'card/send-home': { label: 'Send home', hint: 'End it and every worker under it that runs; each can be resumed.', destructive: true, api: 'kill' },
  'card/note': { label: 'Note', hint: 'Add a note to the review thread about its work.', api: 'review/append', command: 'pane-reviews' },
  'floor/spawn': { label: 'New worker', hint: 'Start a worker on this floor, from the new-worker form.', api: 'spawn' },
  'floor/cut': { label: 'New worker in a worktree', hint: 'Start a worker in a new worktree of every repo of the floor.', api: 'spawn' },
  'floor/shell': { label: 'New shell', hint: "A login shell in the floor's hub; it keeps running after the page closes.", api: 'shell/spawn' },
  'floor/editor': { label: 'Open in editor', hint: "The floor's hub in a new window of your editor.", api: 'open' },
  'floor/tidy': { label: 'Tidy all', hint: 'Do everything the floor’s Tidy lists: landed worktrees, idle hires, old logs.', destructive: true, api: 'tidy' },
  'conversation/resume': { label: 'Resume', hint: 'Continue this conversation as a new session.', api: 'resume' },
  'conversation/goto': { label: 'Go to its resume', hint: 'Go to the worker that carries this conversation on.' },
  'resource/reap': { label: 'End', hint: 'End this process.', api: 'reap/process' },
  'worktree/recut': { label: 'Recut', hint: 'Restore its lost folders from its branch, then resume its workers.', api: 'worktree/recut' },
  'worktree/prune': { label: 'Forget', hint: 'Forget the lost worktree, deleting its branch where it is absorbed into its base.', destructive: true, api: 'worktree/prune' },
  'worktree/remove': { label: 'Remove', hint: 'Remove the worktree in every repo; nothing would be lost.', destructive: true, api: 'worktree/remove' },
  'worktree/discard': { label: 'Discard', hint: 'Throw its work away, each tip noted on its review thread first.', destructive: true, api: 'worktree/discard' },
  'branch/recut': { label: 'Recut', hint: 'A worktree again on the kept branch.', api: 'branch/recut' },
  'branch/delete': { label: 'Delete', hint: 'Delete the kept branch where it is absorbed into its base.', destructive: true, api: 'branch/delete' },
  'note/note': { label: 'Note', hint: "Add a note to the checkout's review thread.", api: 'review/append' },
}

/** A verb's label, as a button says it. */
export const verbLabel = <S extends Subject>(subject: S, verb: SubjectVerbs[S]) => VERB_WORDS[verbId(subject, verb)].label
