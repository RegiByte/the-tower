/**
 * Every core verb as a named sequence of stages, the answer to "where can I take part": served as `/schema`'s `flows`
 * and printed by `tower flows`. A stage is `open` (extensions answer it, its answers combined by its rule), `wrapped`
 * (the links around the verb run there) or `sealed` (the core's alone, with why). Who wraps each verb and answers each
 * hook on a floor is `GET /extensions`' `chains`, `answers` and `launchers`. Describes what the dispatch does; changes
 * nothing it does.
 */
import { COMPOSITES, HOOK_DEADLINE, HOOKS, type Combine, type HookName, type Verb } from './api.ts'
import type { Words } from './extensions.ts'

/**
 * A stage extensions answer. `hook`: what an answerer lists in its manifest's `answers`; `how`: how it takes part where
 * there is no hook to list. `core`: what the core answers there itself, first. `deadline`: the seconds each answer to a
 * raised hook is waited for, a failed answer past them. `planned`: listed where it will be raised, and nothing raises it
 * yet, so no extension can answer it.
 */
export type OpenStage = {
  name: string
  kind: 'open'
  combine: Combine
  required?: true
  absent?: Words
  field?: string
  hook?: string
  how?: string
  core?: string
  deadline?: number
  planned?: true
}

export type Stage = OpenStage | { name: string; kind: 'wrapped' } | { name: string; kind: 'sealed'; why: string }

/** `composes`: the core verbs it calls through the dispatch, each wrapped on its own (`COMPOSITES`). */
export type Flow = { verb: string; words: Words; stages: Stage[]; composes?: string[] }

const sealed = (name: string, why: string): Stage => ({ name, kind: 'sealed', why })

/** The open stage a core hook is, its combine rule read from `HOOKS`. */
const hooked = (name: string, hook: HookName): OpenStage => {
  const { combine, required, absent, field, core, deadline } = HOOKS[hook]
  return { name, kind: 'open', hook: `tower/${hook}`, combine, ...(required && { required }), ...(absent && { absent }), ...(field && { field }), ...(core && { core }), deadline: deadline ?? HOOK_DEADLINE }
}

/** A verb's flow: its stages between the links around it, then what is observed of it once it answered. */
type FlowOf = (verb: string) => Flow

const flow =
  (label: string, hint: string, inner: Stage[]): FlowOf =>
  (verb) => ({
    verb,
    words: { label, hint },
    stages: [
      { name: 'around', kind: 'wrapped' },
      ...inner,
      { name: 'reply', kind: 'wrapped' },
      sealed('board', 'observed after the reply, never inside it: folds and board triggers read what the verb left'),
    ],
    ...(COMPOSITES[`tower/${verb}`] && { composes: COMPOSITES[`tower/${verb}`] }),
  })

/** A verb that does one act on one daemon, file or repo: nothing is decided inside that a link can't decide at the edge. */
const single = (label: string, hint: string, act: string): FlowOf => flow(label, hint, [sealed(act, 'a single act on one daemon, file or repo: a link decides at the edges')])

/** A core verb that moved into an extension: called through the dispatch as the new one, so what wraps that wraps this. */
const moved = (label: string, now: string): FlowOf => flow(label, `Kept until 2.0: calls ${now}.`, [sealed(`calls ${now}`, `a name kept until 2.0: links around ${now} see the call too`)])

const LOGGED_BY = 'the log says who prompted'
const HOST_SPAWN = sealed('host spawn', 'one writer per log: the host owns every PTY')

/** The launch contributors' stage: `failed`, what a contributor that throws or returns what the runtime can't place does to the verb. */
const launch = (failed: string): OpenStage => ({
  name: 'launch',
  kind: 'open',
  combine: 'merge',
  how: `the extension's \`launch\` export, with \`spawn.launch: true\` in its manifest; ${failed}`,
})

const VERB_FLOWS: Record<Verb, FlowOf> = {
  spawn: flow('Start a worker', 'A new session on a floor, in its hub or a worktree cut for it.', [
    sealed('input parsed', 'the schema is the contract'),
    sealed('fields parsed', "each field's schema is its extension's contract"),
    sealed('hirer and floor', "a hire is a worker's, on a floor that exists"),
    sealed("hirer's turn", "a worker's hires are weighed one at a time"),
    sealed('host can log facts', "a hire that can't be logged can't be counted"),
    sealed('prompt from a worker', LOGGED_BY),
    sealed('who', 'a callsign is unique among workers on duty'),
    { name: 'where', kind: 'open', combine: 'place', hook: 'tower/spawn.where', core: "the hub, or its cut's path", planned: true },
    launch("a failed contributor's parts are dropped with a problem, and refuse when the request carries its fields"),
    hooked('gate', 'spawn.gate'),
    sealed('crew edge', 'crews are core facts the board builds from'),
    { name: 'cut', kind: 'open', combine: 'gate', required: true, hook: 'tower/spawn.cut', core: 'the worktree cut, raised to the claimant of where alone', planned: true },
    HOST_SPAWN,
    { name: 'unplace', kind: 'open', combine: 'report', hook: 'tower/spawn.unplace', core: 'the cut rolled back on a host failure, raised to the claimant of where alone', planned: true },
    sealed('prompted-by logged', LOGGED_BY),
    sealed('hire logged and counted', 'crews read tower.hired'),
  ]),
  resume: flow('Resume', 'Continue a saved conversation as a new session: a resume, or a fork when another carries it on.', [
    sealed('one resume at a time', 'two resumes of a conversation would race'),
    sealed('the conversation saved and free', "Claude's own rule"),
    sealed('the worktree is there', 'a worker resumes where it ran'),
    launch("asked with kind resume or fork, which carry no fields: a failed contributor's parts are dropped with a problem"),
    hooked('gate', 'spawn.gate'),
    sealed('fork facts copied', 'a fork is a new worker'),
    HOST_SPAWN,
  ]),
  kill: flow('End a worker', 'Kill its PTY: it can be resumed.', [sealed('named, then killed', 'the log says who ended it')]),
  'let-go': flow('Let go', 'Take a worker stranded by the host off duty, still resumable.', [sealed('only a stranded card', "the board's rule")]),
  fact: flow('Log a fact', "A fact about the caller's own session: show, keep or leave.", [
    sealed('a running worker, about itself', 'a worker names only its own session'),
    sealed("the fact's schema", 'the board reads it'),
    sealed('host appends', 'one writer per log: the host'),
  ]),
  'worktree/discard': flow('Discard', 'Throw away a worktree whose work never landed, recorded first.', [
    sealed('tips read', 'what is thrown away is read before anyone answers'),
    hooked('record', 'discard.record'),
    sealed('the removal', 'after a record, nothing may stop halfway'),
    hooked('done', 'discard.done'),
  ]),
  tidy: flow('Tidy', "Apply a floor's Tidy list as it was listed.", [
    sealed('the list must not have moved on', 'the user confirmed that list'),
    sealed("the core's parts", 'each done through the verb that does it (composes), wrapped there'),
    sealed('archiving', 'logs and stream months, in place'),
    hooked('apply', 'tidy.apply'),
  ]),
  submit: single('Send a prompt', 'Type a prompt into a worker and submit it.', 'named, then typed'),
  keys: single('Type keys', "Write keys to a worker's terminal.", 'named, then written'),
  resize: single('Resize', "Resize a worker's terminal.", 'resized'),
  reap: single('Reap', 'End what a session left running.', 'reaped'),
  'reap/process': single('End a process', 'End one process a session left running.', 'reaped'),
  open: single('Open', 'Open a project directory in the editor.', 'opened'),
  reveal: single('Reveal', 'Show a file or folder in Finder.', 'revealed'),
  edit: single('Edit', 'Open a file in the editor.', 'opened'),
  'shell/spawn': single('Open a shell', "A shell in a project's directory.", 'started'),
  'shell/keys': single('Type in a shell', 'Write keys to a shell.', 'written'),
  'shell/resize': single('Resize a shell', 'Resize a shell.', 'resized'),
  'shell/kill': single('Close a shell', 'End a shell.', 'killed'),
  'collection/create': single('Keep', 'A new item in a collection.', 'written'),
  'collection/write': single('Save', "Replace an item's contents.", 'written'),
  'collection/restore': single('Restore', 'Put a deleted item back.', 'written'),
  'collection/delete': single('Delete', 'Remove an item.', 'removed'),
  'worktree/recut': single('Recut', "Restore a lost worktree's folders from its branch.", 'restored'),
  'worktree/prune': single('Prune', 'Forget a lost worktree.', 'forgotten'),
  'worktree/remove': single('Remove', 'Remove a worktree in every repo.', 'removed'),
  'branch/recut': single('Recut', 'Check a kept branch out again as a worktree.', 'checked out'),
  'branch/delete': single('Delete', 'Delete a kept branch absorbed into its base.', 'deleted'),
  'extension/restart': single('Restart', "Read an extension's folder again and restart it.", 'restarted'),
  'probe/run': moved('Read quota', 'quota/read-now'),
  'review/append': moved('Note', 'reviews/append'),
  'policy/run': moved('Run a policy', 'policies/run'),
  'policy/pass': moved('Pass', 'policies/pass'),
  'policy/approve': moved('Approve', 'policies/approve'),
}

/** Every core verb's flow. */
export const FLOWS: Flow[] = Object.entries(VERB_FLOWS).map(([verb, of]) => of(verb))
