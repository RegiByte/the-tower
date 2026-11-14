/**
 * What `LEGACY`'s moves do beyond a name, keyed by the old name: an old verb's input as the new one takes it and the
 * new reply as the old one answered; an old read's params and query, and its reply; and an old board field's value, copied
 * from the part it moved to as it stood at the move, so a renderer reading the old field reads what it always did.
 */
import type { ApiError } from '../shared/api.ts'
import { legacyOf, type LegacyEntry } from '../shared/extensions.ts'
import { REVIEWS, reviewedIn, reviewPrompt } from '../shared/reviews.ts'
import type { VerbAction } from '../shared/extensions.ts'
import type { FloorThread, ReviewsCardPart, ReviewsFloorPart } from '../shared/reviews-legacy.ts'
import type { Board, Card, Floor } from './board.ts'
import type { CrewEdge, Exemption } from './facts.ts'
import { checkoutsOn, landedByRecord, type CheckoutState } from './checkouts.ts'
import { noteActions, offered, type CardAction, type NoteCalls, type NoteVerb } from './verbs.ts'

/** An old verb: its input as the new one takes it, or why it can't be; the new verb's reply as the old one answered. */
export type LegacyVerb = { input(old: unknown): unknown; reply(now: unknown): unknown }

/** An old read: its params and query as the new one takes them, or why it can't; the new read's reply, with the board, as the old one answered. */
export type LegacyRead = {
  request(params: Record<string, string | undefined>, query: Record<string, unknown>): { params: Record<string, string>; query: Record<string, string> } | ApiError
  reply(now: unknown, board: Board): unknown
}

/** An old board field's value, from its subject (the board, a floor or a card) on the folded board: for a name below a field (`card.checkoutState.filed`), that field's whole value. */
export type LegacyField = (subject: unknown, board: Board) => unknown

/** An old card verb's action, from its card and the extension's action on the card it moved to. */
export type LegacyAction = (card: Card, now: VerbAction) => CardAction


/** An old verb whose input and reply are the new one's. */
const same: LegacyVerb = { input: (old) => old, reply: (now) => now }

export const LEGACY_VERBS: Record<string, LegacyVerb> = {
  'review/append': same,
}

export const LEGACY_READS: Record<string, LegacyRead> = {
  'reviews/<project>': { request: ({ project }) => ({ params: { project: project! }, query: {} }), reply: (now) => now },
}

const reviewsPart = <T>(subject: { x?: Record<string, unknown> }) => subject.x?.[REVIEWS] as T | undefined

/** A card's note on its thread as the core offered it before the move, calling `review/append`: while the thread's work is live. */
const cardNote = (card: Card) => {
  const note = reviewsPart<ReviewsCardPart>(card)?.note
  return offered<NoteVerb, NoteCalls>(note ? noteActions(note[1].project, note[1].checkout, true) : [])
}

/** `list` with `note` where the core offered it: before `send-home`, which crews add last. */
const beforeSendHome = <T>(list: T[], note: T[], verb: (item: T) => string): T[] => {
  const at = list.findIndex((item) => verb(item) === 'send-home')
  return at === -1 ? [...list, ...note] : [...list.slice(0, at), ...note, ...list.slice(at)]
}

/** A floor thread as the core gave it: its calls named as the core named them, and none of what came after the move. */
const oldThread = ({ key: _, resolved: __, ...thread }: ReviewsFloorPart['threads'][number]): FloorThread => {
  const note = thread.calls.note && (['review/append', thread.calls.note[1]] as const)
  return { ...thread, calls: note ? { note: [...note] } : {}, actions: note ? [{ verb: 'note', call: [...note] }] : [] }
}

export const LEGACY_FIELDS: Record<string, LegacyField> = {
  'floor.tidy.threads': (floor, board): Floor['tidy'] => ({
    ...(floor as Floor).tidy,
    threads: (board.adds[`floor:${(floor as Floor).id}`]?.tidy ?? []).flatMap((e) => (e.cap === 'reviews' ? [e.key] : [])),
  }),
  'floor.threads': (floor): FloorThread[] => (reviewsPart<ReviewsFloorPart>(floor as Floor)?.threads ?? []).map(oldThread),
  'card.threadState': (card) => reviewsPart<ReviewsCardPart>(card as Card)?.threadState,
  'card.unseen': (card) => reviewsPart<ReviewsCardPart>(card as Card)?.unseen,
  'card.checkoutState.filed': (subject, board): CheckoutState => {
    const card = subject as Card
    const filed = reviewsPart<ReviewsCardPart>(card)?.filed
    if (!filed) return card.checkoutState
    const floor = board.floors.find((f) => f.id === card.project)!
    const landed = landedByRecord(card.checkout, card.checkoutState, checkoutsOn(floor))
    return landed.is === 'landed' ? { ...landed, filed } : landed
  },
  'card.verbs.note': (card) => beforeSendHome((card as Card).verbs, cardNote(card as Card).verbs, (v) => v),
  'card.calls.note': (card) => ({ ...(card as Card).calls, ...cardNote(card as Card).calls }),
  'card.actions.note': (card) => beforeSendHome((card as Card).actions, cardNote(card as Card).actions, (a) => a.verb),
  'card.reviews': (card) => ((card as Card).x?.reviews as { of?: string } | undefined)?.of ?? (card as Card).reviews,
}

export const LEGACY_ACTIONS: Record<string, LegacyAction> = {
  'card.review': (card, { call }) => ({ verb: 'review', call: ['spawn', { project: card.project, cut: { from: card.checkout }, prompt: reviewPrompt((call as { of: string }).of, false) }] }),
}

/** The core's card verbs that close a card's actions, the ones an old verb is placed before. */
const CLOSING = new Set(['reap', 'kill', 'let-go', 'send-home', 'note'])

/** A card with each old verb whose action an extension offers on it, placed where the core offered it. */
const withOldActions = (card: Card, board: Board): Card => {
  const moved = legacyOf('action').flatMap((e) => {
    const now = board.adds[`card:${card.id}`]?.actions?.find((a): a is VerbAction & { cap: string } => 'verb' in a && a.verb === e.now)
    return now ? [LEGACY_ACTIONS[e.old](card, now)] : []
  })
  if (!moved.length) return card
  const at = card.actions.findIndex((a) => CLOSING.has(a.verb))
  const actions = at === -1 ? [...card.actions, ...moved] : [...card.actions.slice(0, at), ...moved, ...card.actions.slice(at)]
  return { ...card, ...offered(actions) }
}

/** What a spawn logged about its hire: its exemptions (`tower.exempt`) and its crew edge (`tower.reports-to`). */
export type Launched = { exempt: Exemption[]; reportsTo?: Pick<CrewEdge, 'callsign' | 'by'> }

/** The capability a reviewer spawned before 1.95 reads as exempted and put in its author's crew by. */
const REVIEWER_BY = 'reviews'

/**
 * The reviewer a worker was spawned as before the reviews extension logged its facts at spawn: a launch that logged
 * neither an exemption nor a crew edge, whose first prompt is `/tower:review <CALLSIGN>`, reviews that callsign and is
 * exempt from hiring by reviews (its crew edge is `legacyCrew`). A launch that logged either is read by its facts
 * alone. Goes at 2.0.
 */
export const legacyReviewer = (launched: Launched, prompt: string | undefined): { reviews: string; exempt: Exemption[] } | undefined => {
  const reviews = launched.exempt.length || launched.reportsTo ? undefined : reviewedIn(prompt)
  return reviews === undefined ? undefined : { reviews, exempt: [{ from: 'hiring', by: REVIEWER_BY }] }
}

/** A `legacyReviewer`'s crew edge: its author's card as the board names workers by callsign now. Goes at 2.0. */
export const legacyCrew = (reviews: string, author: string): CrewEdge => ({ callsign: reviews, session: author, by: REVIEWER_BY })

/** The entry of `kind` named `old`, when there is one. */
export const legacyNamed = (kind: LegacyEntry['kind'], old: string): LegacyEntry | undefined => legacyOf(kind).find((e) => e.old === old)

/** A subject's field set to what `LEGACY_FIELDS` makes of it. */
const projected = <T extends object>(subject: T, field: string, board: Board, old: string): T => ({ ...subject, [field]: LEGACY_FIELDS[old](subject, board) })

/**
 * The folded board with every moved part copied back to its old field: the board's own fields, then each floor's and
 * each of its cards', each card with the old verbs whose actions moved.
 */
export const projectLegacy = (board: Board): Board => {
  const at = (subject: string) => legacyOf('board').flatMap((e) => (e.old.startsWith(`${subject}.`) ? [{ old: e.old, field: e.old.slice(subject.length + 1).split('.')[0] }] : []))
  const onBoard = at('board').reduce((b, { old, field }) => projected(b, field, board, old), board)
  const onFloor = at('floor')
  const onCard = at('card')
  if (!onFloor.length && !onCard.length && !legacyOf('action').length) return onBoard
  return {
    ...onBoard,
    floors: onBoard.floors.map((floor) => {
      const cards = floor.cards.map((card) => withOldActions(onCard.reduce((c, { old, field }) => projected(c, field, board, old), card), board))
      return onFloor.reduce((f, { old, field }) => projected(f, field, board, old), { ...floor, cards })
    }),
  }
}
