/**
 * The fold pass (decision `extensions`): the core's board, built and frozen, with each extension's part and
 * contributions folded on. Extensions fold in resolved order, each in a fixed order of subject kinds (card, its
 * conversations, what it showed, items, collections, shelf entries, floor, its own kinds and those it contributes to,
 * board), each fold seeing the subject with
 * only the parts of the capabilities it declares. A fold that throws or returns what its manifest doesn't declare
 * costs that extension's part on that subject, and its dependents' there: a problem, never a failed board.
 */
import { z } from 'zod'
import { ADDS, BADGE_TONES, qualifiedOf, WhenShape, WordsShape, type Action, type Added, type Adds, type BoardAsk, type ExtensionProblem, type Fold, type FoldCtx, type Part } from '../shared/extensions.ts'
import {
  boardSubject,
  cardSubject,
  collectionSubject,
  conversationSubject,
  floorSubject,
  itemKey,
  itemSubject,
  ownLegacyKey,
  ownSubject,
  shelfSubject,
  shownSubject,
  SUBJECT_KEY,
  type Subject,
} from '../shared/subjects.ts'
import type { Board, Floor } from './board.ts'
import { ownKindOf, type CompiledFold } from './extensions.ts'
import { withAddedTidy } from './verbs.ts'
import { frozen } from './frozen.ts'

/** A build's folds of one extension over this many ms is `slow`. */
export const SLOW_MS = 50

/** Where a fold's own stores are read: the subject's floor (none for the board) and, on a card, its worker's lineage. */
export type OwnAt = { project?: string; lineage?: string[] }

/**
 * A running extension as the fold pass reads it. `off`: its floors off. `verbs`: each capability it may offer verbs of
 * (its own, its requires and wants), with their names. `subjects`: the own kinds of every running extension, by kind.
 */
export type Folder = {
  id: string
  cap: string
  requires: string[]
  wants: string[]
  off: readonly string[]
  specs: Map<string, CompiledFold>
  folds: Record<string, Fold>
  commands: string[]
  verbs: Map<string, Set<string>>
  settings(project: string | undefined): unknown
  own(at: OwnAt): FoldCtx['own']
}

/** Where an own kind's subjects sit: `in` its owner's part at a card, a floor or the board, `list` the array there. */
export type SubjectDecl = { in: 'board' | 'floor' | 'card'; list: string }

/** A problem a fold found, by the id of the extension it counts against. */
export type FoldProblem = { id: string; problem: Omit<ExtensionProblem, 'at' | 'count'> }

export type FoldInput = { board: Board; callsignOf: FoldCtx['callsignOf']; folders: Folder[]; subjects: Map<string, SubjectDecl>; now: number; clock: () => number }

const ActionShape = z.union([
  z.strictObject({ verb: z.string(), call: z.unknown(), words: WordsShape.optional() }).refine((a) => 'call' in a, { message: 'a verb action holds its call, the verb\'s input' }),
  z.strictObject({ command: z.string(), args: z.unknown().optional(), words: WordsShape.optional() }),
])
const PartShape = z.strictObject({
  x: z.unknown().optional(),
  actions: z.array(ActionShape).optional(),
  badges: z.array(z.strictObject({ label: z.string().min(1), tone: z.enum(BADGE_TONES).optional(), hint: z.string().optional(), href: z.string().optional() })).optional(),
  tidy: z
    .array(z.strictObject({ key: z.string().min(1), label: z.string().min(1), hint: z.string().optional(), does: z.string().min(1).optional(), kind: z.strictObject({ one: z.string().min(1), many: z.string().min(1) }).optional(), checkout: z.string().min(1).optional() }))
    .optional(),
  lines: z.array(z.string()).optional(),
  asks: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        subject: z
          .string()
          .regex(SUBJECT_KEY, 'a subject key of the core: card:<id>, conversation:<id>, shown:<card>/<at>, floor:<project>, collection:<project>/<collection>, shelf:<project>/<n>, item.<collection>:<project>/<id> or board'),
        title: z.string().min(1),
        since: z.number(),
        until: z.number().optional(),
        sound: z.enum(['wait', 'offer']),
        actions: z.array(ActionShape),
      }),
    )
    .optional(),
  slots: z.array(z.strictObject({ key: z.string().min(1), when: WhenShape })).optional(),
  marks: z
    .array(
      z
        .strictObject({
          repo: z.string().min(1),
          path: z.string().min(1),
          line: z.number().int().min(1),
          to: z.number().int().min(1).optional(),
          label: z.string().min(1),
          tone: z.enum(BADGE_TONES).optional(),
          hint: z.string().optional(),
          display: z.string().min(1).optional(),
        })
        .refine((m) => m.to === undefined || m.to >= m.line, { message: 'a mark ends at or after the line it starts on' }),
    )
    .optional(),
})

const issuesLine = (issues: z.core.$ZodIssue[]) => issues.map((i) => `${i.path.join('.') || 'part'}: ${i.message}`).join('; ')

/** Why an action can't be offered: a verb of a capability it doesn't declare, or one its provider doesn't have; a command it doesn't have. */
const actionProblem = (folder: Folder, action: Action): string | undefined => {
  if ('command' in action) return folder.commands.includes(action.command) ? undefined : `${action.command} is no command of ${folder.cap}'s manifest`
  const q = qualifiedOf(action.verb)
  if (!q || !folder.verbs.has(q.cap)) return `${action.verb} is no verb of ${folder.cap} or of a capability it requires or wants: a verb action is qualified, <capability>/<verb>`
  return folder.verbs.get(q.cap)!.has(q.name) ? undefined : `${q.cap} has no verb ${q.name}`
}

/** A fold's part checked against its manifest: what it may hold, each piece's shape, its x by its schema. */
const checkPart = (folder: Folder, kind: string, spec: CompiledFold, part: unknown): { ok: true; part: Part } | { ok: false; why: string } => {
  const parsed = PartShape.safeParse(part)
  if (!parsed.success) return { ok: false, why: issuesLine(parsed.error.issues) }
  const held = Object.keys(parsed.data).filter((key) => parsed.data[key as keyof Part] !== undefined)
  const undeclared = held.filter((key) => (key === 'x' ? !spec.x : !spec.adds.includes(key as (typeof ADDS)[number])))
  if (undeclared.length) return { ok: false, why: `it returned ${undeclared.join(', ')}, which folds.${kind} doesn't declare` }
  const actions = [...(parsed.data.actions ?? []), ...(parsed.data.asks ?? []).flatMap((a) => a.actions)]
  const wrong = actions.map((a) => actionProblem(folder, a)).find(Boolean)
  if (wrong) return { ok: false, why: wrong }
  if (!spec.x || parsed.data.x === undefined) return { ok: true, part: parsed.data }
  const x = spec.x.safeParse(parsed.data.x)
  return x.success ? { ok: true, part: { ...parsed.data, x: frozen(x.data) } } : { ok: false, why: `x: ${issuesLine(x.error.issues)}` }
}

/** The kinds an extension folds, in the order it folds them. */
const kindOrder = (kinds: string[]): string[] => {
  const ranks = ['card', 'conversation', 'shown', 'item.', 'collection', 'shelf', 'floor']
  const rank = (kind: string) => (kind === 'board' ? ranks.length + 1 : ((i) => (i < 0 ? ranks.length : i))(ranks.findIndex((r) => (r === 'item.' ? kind.startsWith(r) : kind === r))))
  return [...kinds].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/**
 * The board with every running extension's folds on it, the problems they found, and the ms each extension's folds
 * took (`spent`, by id). With no folder, the core's board as it was built.
 */
export const foldBoard = ({ board: built, callsignOf, folders, subjects, now, clock }: FoldInput): { board: Board; problems: FoldProblem[]; spent: Map<string, number> } => {
  if (!folders.length) return { board: built, problems: [], spent: new Map() }
  const core = frozen(structuredClone(built))
  /** Each subject's parts, by key, then capability. */
  const parts = new Map<string, Map<string, unknown>>()
  /** The capabilities whose part on a subject was dropped this build, by key. */
  const dropped = new Map<string, Set<string>>()
  const adds: Record<string, Adds> = Object.fromEntries(Object.entries(core.adds).map(([key, a]) => [key, { ...a }]))
  const asks: BoardAsk[] = []
  const problems: FoldProblem[] = []
  const spentBy = new Map<string, number>()

  /** `value` with the parts of `allowed` (every capability's when none) at `x`, as `key`'s subject holds them. */
  const withX = <T extends object>(value: T, key: string, allowed?: ReadonlySet<string>): T => {
    const held = [...(parts.get(key) ?? [])].filter(([cap]) => !allowed || allowed.has(cap))
    return held.length ? Object.freeze({ ...value, x: Object.freeze(Object.fromEntries(held)) }) : value
  }
  const floorView = (f: Floor, allowed?: ReadonlySet<string>): Floor =>
    withX(
      {
        ...f,
        cards: f.cards.map((c) => withX(c, cardSubject(c).key, allowed)),
        collections: f.collections.map((c) => ({ ...c, items: c.items.map((i) => withX(i, itemKey(f.id, c.id, i.id), allowed)) })),
      },
      floorSubject(f).key,
      allowed,
    )
  const boardView = (allowed?: ReadonlySet<string>): Board => withX({ ...core, floors: core.floors.map((f) => floorView(f, allowed)) }, 'board', allowed)

  const tagged = <T extends object>(cap: string, list: T[] | undefined): Added<T>[] => (list ?? []).map((item) => ({ ...item, cap }))
  const drop = (key: string, cap: string) => {
    if (!dropped.has(key)) dropped.set(key, new Set())
    dropped.get(key)!.add(cap)
  }
  /** `part`'s contributions at `key`, and its asks; an own kind's contributions copied to its key before 1.98 until 2.0. */
  const contribute = (cap: string, subject: Subject, legacyKey: string | undefined, part: Part) => {
    addAt(cap, subject.key, part)
    if (legacyKey) addAt(cap, legacyKey, part)
    for (const ask of part.asks ?? []) {
      if (ask.until !== undefined && ask.until <= now) continue
      asks.push({ ...ask, key: `${cap}:${ask.key}`, cap, actions: tagged<Action>(cap, ask.actions) })
    }
  }
  const addAt = (cap: string, key: string, part: Part) => {
    const into = (adds[key] ??= {})
    if (part.actions?.length) into.actions = [...(into.actions ?? []), ...tagged<Action>(cap, part.actions)]
    if (part.badges?.length) into.badges = [...(into.badges ?? []), ...tagged(cap, part.badges)]
    if (part.tidy?.length) into.tidy = [...(into.tidy ?? []), ...tagged(cap, part.tidy)]
    if (part.lines?.length) into.lines = [...(into.lines ?? []), ...part.lines.map((text) => ({ text, cap }))]
    if (part.slots?.length) into.slots = [...(into.slots ?? []), ...tagged(cap, part.slots)]
    if (part.marks?.length) into.marks = [...(into.marks ?? []), ...tagged(cap, part.marks)]
    if (!Object.keys(into).length) delete adds[key]
  }

  for (const folder of folders) {
    const allowed = new Set([folder.cap, ...folder.requires, ...folder.wants])
    const on = (project: string | undefined) => project === undefined || !folder.off.includes(project)
    let spent = 0

    /** Folds `subject` (`value` as `folder` sees it) with its fold of `kind`, at the floor `at.project`; an own kind's entry with its `legacyKey`. */
    const foldOne = (kind: string, subject: Subject, value: unknown, at: OwnAt, legacyKey?: string) => {
      const { key } = subject
      if (folder.requires.some((cap) => dropped.get(key)?.has(cap))) return drop(key, folder.cap)
      const failed = (code: 'threw' | 'shape', message: string) => {
        drop(key, folder.cap)
        problems.push({ id: folder.id, problem: { lane: 'fold', level: 'error', code, message, path: `folds.${kind}`, subject: key } })
      }
      const ctx: FoldCtx = { now, settings: folder.settings(at.project), board: core, callsignOf, own: folder.own(at) }
      const started = clock()
      let part: unknown
      try {
        part = folder.folds[kind](value, ctx)
      } catch (err) {
        return failed('threw', (err as Error)?.message ?? String(err))
      } finally {
        spent += clock() - started
      }
      const checked = checkPart(folder, kind, folder.specs.get(kind)!, part)
      if (!checked.ok) return failed('shape', checked.why)
      if (checked.part.x !== undefined) {
        if (!parts.has(key)) parts.set(key, new Map())
        parts.get(key)!.set(folder.cap, checked.part.x)
      }
      contribute(folder.cap, subject, legacyKey, checked.part)
    }

    for (const kind of kindOrder(Object.keys(folder.folds))) {
      const own = ownKindOf(kind)
      if (kind === 'board') {
        foldOne(kind, boardSubject(core), boardView(allowed), {})
        continue
      }
      for (const f of core.floors.filter((f) => on(f.id))) {
        if (kind === 'card') for (const c of f.cards) foldOne(kind, cardSubject(c), withX(c, cardSubject(c).key, allowed), { project: f.id, lineage: c.lineage.map((s) => s.id) })
        else if (kind === 'conversation') {
          for (const c of f.cards) for (const v of c.conversations) foldOne(kind, conversationSubject(c, v), Object.freeze(conversationSubject(c, v).value), { project: f.id })
        } else if (kind === 'shown') {
          for (const c of f.cards) for (const s of c.shown) foldOne(kind, shownSubject(c, s), Object.freeze(shownSubject(c, s).value), { project: f.id })
        } else if (kind === 'collection') {
          for (const c of floorView(f, allowed).collections) foldOne(kind, collectionSubject(f.id, c), Object.freeze(collectionSubject(f.id, c).value), { project: f.id })
        } else if (kind === 'shelf') {
          for (const [n, entry] of (f.shelf ?? []).entries()) foldOne(kind, shelfSubject(f.id, entry, n), Object.freeze(shelfSubject(f.id, entry, n).value), { project: f.id })
        } else if (kind.startsWith('item.')) {
          const collection = kind.slice('item.'.length)
          for (const item of f.collections.find((c) => c.id === collection)?.items ?? []) {
            const key = itemKey(f.id, collection, item.id)
            foldOne(kind, itemSubject(f.id, collection, item), Object.freeze(itemSubject(f.id, collection, withX(item, key, allowed)).value), { project: f.id })
          }
        } else if (kind === 'floor') foldOne(kind, floorSubject(f), floorView(f, allowed), { project: f.id })
        else if (own) {
          const decl = subjects.get(kind)
          if (!decl || decl.in === 'board') continue
          const holders = decl.in === 'floor' ? [floorSubject(f)] : f.cards.map(cardSubject)
          for (const holder of holders) {
            for (const entry of entriesOf(parts.get(holder.key)?.get(own.cap), decl.list)) foldOne(kind, ownSubject(kind, entry, holder), entry, { project: f.id }, ownLegacyKey(kind, entry))
          }
        }
      }
      const decl = own && subjects.get(kind)
      if (own && decl && decl.in === 'board') {
        for (const entry of entriesOf(parts.get('board')?.get(own.cap), decl.list)) foldOne(kind, ownSubject(kind, entry, boardSubject(core)), entry, {}, ownLegacyKey(kind, entry))
      }
    }
    spentBy.set(folder.id, spent)
    if (spent > SLOW_MS) problems.push({ id: folder.id, problem: { lane: 'fold', level: 'warn', code: 'slow', message: `its folds took ${Math.round(spent)} ms of one board, over ${SLOW_MS} ms: the tower can't stop a fold, so every board waits on it`, path: 'folds' } })
  }

  const all = boardView()
  const floors = all.floors.map((f) => {
    const tidy = adds[floorSubject(f).key]?.tidy
    return tidy ? withAddedTidy(f, tidy) : f
  })
  return { board: { ...all, floors, adds, asks: asks.sort((a, b) => a.since - b.since) }, problems, spent: spentBy }
}

/** The keyed entries at `list` of an owner's part, where its own kind's subjects sit. */
const entriesOf = (part: unknown, list: string): { key: string }[] => {
  const entries = (part as Record<string, unknown> | undefined)?.[list]
  return Array.isArray(entries) ? entries.filter((e): e is { key: string } => typeof e?.key === 'string') : []
}
