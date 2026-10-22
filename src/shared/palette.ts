/**
 * The command palette as data every renderer draws alike: `paletteEntries` lists what a viewer can go to, do or learn
 * from where they stand, `rankPalette` orders them for what they typed. An entry's `does` is a tagged message the
 * renderer runs through the same handlers as its buttons and keys; nothing here runs anything. The tower serves this
 * module as `/palette.js`.
 */
import type { Board, Card, Floor, FloorItem } from '../bridge/board.ts'
import type { CardVerb, ConversationVerb, FloorVerb, ResourceVerb } from '../bridge/verbs.ts'
import type { Capability } from './capabilities.ts'
import { commandName, gistLine, heededWaits, type Heed } from './cards.ts'
import { DRAFTS } from './drafts.ts'
import { COMMANDS, type CommandId } from './keymap.ts'
import { VERB_WORDS, verbId, type VerbId } from './verb-words.ts'

export type GoTarget =
  | { t: 'worker'; id: string }
  | { t: 'floor'; project: string }
  | { t: 'shelf'; project: string; n: number }
  | { t: 'draft'; project: string; id: string }

export type ActionPick =
  | { t: 'action'; subject: 'card'; verb: CardVerb; id: string }
  | { t: 'action'; subject: 'floor'; verb: FloorVerb; project: string }
  | { t: 'action'; subject: 'conversation'; verb: ConversationVerb; id: string; conversation: string }
  | { t: 'action'; subject: 'resource'; verb: ResourceVerb; id: string; pid: number }

/** What picking an entry does: a keymap command, a verb a thing on the board offers, going somewhere, the patterns sheet, or a capability shown. */
export type Pick = { t: 'command'; id: CommandId } | ActionPick | { t: 'go'; target: GoTarget } | { t: 'patterns' } | { t: 'learn'; id: string }

/**
 * One line of the palette. `chords`: the keymap's chords that do the same, as `board.keys` writes them. `card` and
 * `project`: the worker and the floor it is about, which ranking favours when they are the viewer's.
 */
export type Entry = {
  id: string
  group: string
  label: string
  hint?: string
  keywords: string[]
  chords?: string[]
  destructive?: true
  learn?: true
  card?: string
  project?: string
  does: Pick
}

/**
 * What the palette is drawn from: the board, the worker selected, the capabilities, the entry ids the viewer picked,
 * the latest first, the waits the viewer dismissed, and a draft's title as the renderer has read it.
 */
export type PaletteContext = {
  board: Board
  selected: string | undefined
  capabilities: readonly Capability[]
  recent: readonly string[]
  heed: { dismissed: Heed['dismissed'] }
  draftTitle: (project: string, item: FloorItem) => string
}

/** What ranking favours: the worker selected and its floor, the ids picked lately, and who waits on the viewer, in the order to go to them. */
export type Ranking = { selected: string | undefined; floor: string | undefined; recent: readonly string[]; waiting: readonly string[] }

/**
 * The scorer's weights. A match on the label scores its tier; on a keyword, its tier times `keyword`. Each tier is
 * more than the next plus every boost an entry can get, so a better label match always ranks first. A keyword counts
 * for less: its prefix, with every boost, stays below a word start on a label. A query matching nothing as typed is
 * tried again without a trailing "s", at its tier times `plural`. A Learn entry scores its match times `learn`, so
 * what can be gone to or done comes first.
 */
export const WEIGHTS = {
  prefix: 100,
  wordStart: 70,
  substring: 40,
  subsequence: 10,
  keyword: 0.45,
  plural: 0.9,
  learn: 0.5,
  selected: 12,
  floor: 6,
  recent: 8,
  groupCap: 5,
  learnCap: 2,
}

export const PATTERNS_ENTRY = 'patterns'

/** Verbs the palette leaves out: a prompt is typed in the worker's terminal, a worker is ended by sending it home, a worktree is chosen in the new-worker form. */
const UNLISTED: ReadonlySet<VerbId> = new Set(['card/submit', 'card/kill', 'floor/cut'])

/** Commands only a terminal or a text field runs, and the palette's own, are not listed in it. */
const listedCommand = (id: string, scope: string) => scope === 'global' && id !== 'palette'

const PANE_COMMANDS: ReadonlySet<string> = new Set(['pane-terminal', 'pane-brief', 'pane-changes', 'pane-reviews', 'shell-here'])

const capitalized = (text: string) => text.replace(/^./, (c) => c.toUpperCase())

/** A command's hint: the capabilities that name it, else `otherwise`. */
const commandHint = (capabilities: readonly Capability[], id: string, otherwise: string) =>
  capabilities.filter((c) => c.command === id).map((c) => c.text).join(' ') || otherwise

const cardOf = (board: Board, id: string | undefined): Card | undefined => (id === undefined ? undefined : board.floors.flatMap((f) => f.cards).find((c) => c.id === id))

/** The selected worker's verbs: those a keymap command does run as that command, with its chords. */
const cardEntries = (board: Board, capabilities: readonly Capability[], c: Card): Entry[] => {
  const verbs = c.actions.filter((a) => !UNLISTED.has(verbId('card', a.verb))).map((a): Entry => {
    const words = VERB_WORDS[verbId('card', a.verb)]
    return {
      id: verbId('card', a.verb),
      group: c.callsign,
      label: words.label,
      hint: words.command ? commandHint(capabilities, words.command, words.hint) : words.hint,
      keywords: [c.callsign, a.verb],
      chords: words.command && board.keys[words.command],
      destructive: words.destructive,
      card: c.id,
      project: c.project,
      does: words.command ? { t: 'command', id: words.command } : { t: 'action', subject: 'card', verb: a.verb, id: c.id },
    }
  })
  const latest = c.conversations.at(-1)
  const earlier = c.conversations.filter((v) => v !== latest).flatMap((v) => v.actions.map((a): Entry => ({
    id: `${verbId('conversation', a.verb)}@${v.id}`,
    group: c.callsign,
    label: `${VERB_WORDS[verbId('conversation', a.verb)].label}: an earlier conversation`,
    hint: v.prompt ?? VERB_WORDS[verbId('conversation', a.verb)].hint,
    keywords: [c.callsign, a.verb, v.prompt ?? ''],
    card: c.id,
    project: c.project,
    does: { t: 'action', subject: 'conversation', verb: a.verb, id: c.id, conversation: v.id },
  })))
  const processes = c.resources.flatMap((r) => r.actions.map((a): Entry => ({
    id: `${verbId('resource', a.verb)}@${r.pid}`,
    group: c.callsign,
    label: `${VERB_WORDS[verbId('resource', a.verb)].label} ${r.pid} ${commandName(r.command)}`,
    hint: r.command,
    keywords: [c.callsign, String(r.pid), ...r.ports.map(String)],
    card: c.id,
    project: c.project,
    does: { t: 'action', subject: 'resource', verb: a.verb, id: c.id, pid: r.pid },
  })))
  return [...verbs, ...earlier, ...processes]
}

const floorEntries = (f: Floor): Entry[] =>
  f.actions.filter((a) => !UNLISTED.has(verbId('floor', a.verb))).map((a) => {
    const words = VERB_WORDS[verbId('floor', a.verb)]
    return { id: `${verbId('floor', a.verb)}@${f.id}`, group: f.name, label: words.label, hint: words.hint, keywords: [f.name, a.verb], destructive: words.destructive, project: f.id, does: { t: 'action', subject: 'floor', verb: a.verb, project: f.id } }
  })

const placeEntries = (f: Floor, draftTitle: PaletteContext['draftTitle']): Entry[] => [
  { id: `floor:${f.id}`, group: 'Floors', label: f.name, hint: `${f.cards.filter((c) => c.onDuty).length} on duty`, keywords: [f.id], project: f.id, does: { t: 'go', target: { t: 'floor', project: f.id } } },
  ...(f.shelf ?? []).map((entry, n): Entry => ({ id: `shelf:${f.id}/${n}`, group: 'Shelf', label: entry.label, hint: f.name, keywords: [f.name], project: f.id, does: { t: 'go', target: { t: 'shelf', project: f.id, n } } })),
  ...(f.collections.find((c) => c.id === DRAFTS)?.items ?? []).map((item): Entry => ({
    id: `draft:${f.id}/${item.id}`,
    group: 'Drafts',
    label: draftTitle(f.id, item),
    hint: `${f.name} · ${item.tag}`,
    keywords: [item.tag, f.name],
    project: f.id,
    does: { t: 'go', target: { t: 'draft', project: f.id, id: item.id } },
  })),
]

const workerEntry = (f: Floor, c: Card): Entry => ({
  id: `worker:${c.id}`,
  group: 'Workers',
  label: c.callsign,
  hint: [f.name, gistLine(c)].filter(Boolean).join(' · '),
  keywords: [gistLine(c), f.name, c.worktree?.name ?? ''].filter(Boolean),
  card: c.id,
  project: f.id,
  does: { t: 'go', target: { t: 'worker', id: c.id } },
})

/** Every entry the palette can show from where the viewer stands, before ranking. */
export const paletteEntries = (ctx: PaletteContext): Entry[] => {
  const { board, capabilities } = ctx
  const c = cardOf(board, ctx.selected)
  const actions = c ? cardEntries(board, capabilities, c) : []
  const ranAsCommand = new Set(actions.flatMap((e) => (e.does.t === 'command' ? [e.does.id] : [])))
  const commands = COMMANDS.filter((k) => listedCommand(k.id, k.scope) && !ranAsCommand.has(k.id) && (c || !PANE_COMMANDS.has(k.id))).map((k): Entry => ({
    id: `command:${k.id}`,
    group: 'Commands',
    label: k.label,
    hint: commandHint(capabilities, k.id, `${capitalized(k.does)}.`),
    keywords: [k.does],
    chords: board.keys[k.id],
    does: { t: 'command', id: k.id },
  }))
  const learn: Entry[] = [
    ...capabilities.filter((k) => !k.command).map((k): Entry => ({ id: `learn:${k.id}`, group: 'Learn', label: k.text, keywords: [k.id], learn: true, does: { t: 'learn', id: k.id } })),
    { id: PATTERNS_ENTRY, group: 'Learn', label: 'Patterns users are discovering', hint: 'What users found doing with the tower, as short stories.', keywords: ['stories', 'tips'], learn: true, does: { t: 'patterns' } },
  ]
  return [
    ...actions,
    ...board.floors.flatMap(floorEntries),
    ...commands,
    ...board.floors.flatMap((f) => f.cards.filter((w) => w.onDuty).map((w) => workerEntry(f, w))),
    ...board.floors.flatMap((f) => placeEntries(f, ctx.draftTitle)),
    ...learn,
  ]
}

/** What ranking reads from where the viewer stands. */
export const rankingOf = (ctx: PaletteContext): Ranking => ({
  selected: ctx.selected,
  floor: cardOf(ctx.board, ctx.selected)?.project,
  recent: ctx.recent,
  waiting: heededWaits(ctx.board, ctx.heed).map((w) => w.id),
})

const isWordStart = (text: string, at: number) => at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])

/** How well `query` matches `text`, ignoring case: a prefix, a word's start, anywhere, its letters in order; 0 when not at all. */
export const matchScore = (text: string, query: string): number => {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 0
  if (t.startsWith(q)) return WEIGHTS.prefix
  let at = t.indexOf(q)
  if (at >= 0) {
    for (let from = at; from >= 0; from = t.indexOf(q, from + 1)) if (isWordStart(t, from)) return WEIGHTS.wordStart
    return WEIGHTS.substring
  }
  at = 0
  for (const ch of q) {
    at = t.indexOf(ch, at) + 1
    if (!at) return 0
  }
  return WEIGHTS.subsequence
}

/** What favours an entry where the viewer stands: their worker, else its floor, and a pick of theirs lately. */
const boostOf = (e: Entry, r: Ranking) =>
  (r.selected !== undefined && e.card === r.selected ? WEIGHTS.selected : r.floor !== undefined && e.project === r.floor ? WEIGHTS.floor : 0) + (r.recent.includes(e.id) ? WEIGHTS.recent : 0)

/** A match better than letters in order: a sentence holds most short queries' letters in order. */
const closeScore = (text: string, query: string) => {
  const score = matchScore(text, query)
  return score === WEIGHTS.subsequence ? 0 : score
}

/** `score` for `query` as typed, else for it without a trailing "s" (`shells` finds `Shell here`), weighed by `plural`. */
const singularToo = (score: (text: string, query: string) => number) => (text: string, query: string) =>
  score(text, query) || (/[^s]s$/i.test(query) ? score(text, query.slice(0, -1)) * WEIGHTS.plural : 0)

const labelScore = singularToo(matchScore)
const sentenceScore = singularToo(closeScore)

/**
 * An entry's score for `query`: its best match on the label or a keyword, plus its boost; 0 when nothing matches.
 * Letters in order count only on the label of an entry that isn't a Learn sentence; a Learn entry's match counts for
 * less (`WEIGHTS.learn`).
 */
export const entryScore = (e: Entry, query: string, r: Ranking): number => {
  const match = Math.max((e.learn ? sentenceScore : labelScore)(e.label, query), ...e.keywords.map((k) => sentenceScore(k, query) * WEIGHTS.keyword))
  return match && match * (e.learn ? WEIGHTS.learn : 1) + boostOf(e, r)
}

export type PaletteGroup = { group: string; entries: Entry[] }

/** The palette before anything is typed: the selected worker's verbs, primary first, who waits on the viewer, and their picks lately (Learn's left out), each group short. */
const opening = (entries: Entry[], r: Ranking): PaletteGroup[] => {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const own = entries.filter((e) => r.selected !== undefined && e.card === r.selected && e.does.t !== 'go')
  const waiting = r.waiting.flatMap((id) => byId.get(`worker:${id}`) ?? [])
  const shown = new Set([...own, ...waiting].map((e) => e.id))
  const recent = r.recent.flatMap((id) => (shown.has(id) ? [] : byId.get(id) ?? [])).filter((e) => !e.learn)
  return [
    { group: own[0]?.group ?? '', entries: own },
    { group: 'Waiting on you', entries: waiting },
    { group: 'Recent', entries: recent },
  ]
    .map((g) => ({ ...g, entries: g.entries.slice(0, WEIGHTS.groupCap) }))
    .filter((g) => g.entries.length)
}

/**
 * The entries in groups for `query`: with nothing typed, the opening groups; else each entry that matches, by score
 * within its group, the groups by their best entry, Learn's capped.
 */
export const rankPalette = (entries: Entry[], query: string, r: Ranking): PaletteGroup[] => {
  const q = query.trim()
  if (!q) return opening(entries, r)
  const scored = entries.map((e) => ({ e, score: entryScore(e, q, r) })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const groups = new Map<string, Entry[]>()
  for (const { e } of scored) groups.set(e.group, [...(groups.get(e.group) ?? []), e])
  return [...groups].map(([group, list]) => ({ group, entries: list[0].learn ? list.slice(0, WEIGHTS.learnCap) : list }))
}
