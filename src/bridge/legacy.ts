/**
 * What `LEGACY`'s moves do beyond a name, keyed by the old name: an old verb's input as the new one takes it and the
 * new reply as the old one answered; an old read's params and query, and its reply; an old board field's value, copied
 * from the part it moved to as it stood at the move, so a renderer reading the old field reads what it always did; and
 * an old stream code's facts as the readings the core folds. Everything here goes at 2.0 but the streams'.
 */
import { apiError, type ApiError, type Replies } from '../shared/api.ts'
import { legacyOf, type LegacyEntry } from '../shared/extensions.ts'
import { ConfigError, type Config, type ProbeConfig } from '../shared/model.ts'
import { usageReading, type RateLimitsReading } from '../shared/rate-limits.ts'
import { POLICIES, type CardRun, type Offer, type OfferFields, type PolicyFields, type PolicyView } from '../shared/policies-legacy.ts'
import { REVIEWS } from '../shared/reviews.ts'
import type { FloorThread, ReviewsCardPart, ReviewsFloorPart } from '../shared/reviews-legacy.ts'
import type { Board, Card, Floor } from './board.ts'
import { checkoutsOn, landedByRecord, type CheckoutState } from './checkouts.ts'
import { noteActions, offered, probeOffers, type NoteCalls, type NoteVerb, type ProbeAction, type ProbeCalls, type ProbeVerb } from './verbs.ts'

/** An old verb: its input as the new one takes it, or why it can't be; the new verb's reply as the old one answered. */
export type LegacyVerb = { input(old: unknown): unknown; reply(now: unknown): unknown }

/** An old read: its params and query as the new one takes them, or why it can't; the new read's reply, with the board, as the old one answered. */
export type LegacyRead = {
  request(params: Record<string, string | undefined>, query: Record<string, unknown>): { params: Record<string, string>; query: Record<string, string> } | ApiError
  reply(now: unknown, board: Board): unknown
}

/** An old board field's value, from its subject (the board, a floor or a card) on the folded board: for a name below a field (`card.checkoutState.filed`), that field's whole value. */
export type LegacyField = (subject: unknown, board: Board) => unknown

/** An old stream code's fact as a reading of a kind the core folds, or `undefined` when it is none (a failed read). */
export type LegacyReading = (fact: unknown) => RateLimitsReading | undefined

/** The probes the core ran before 1.90: their readers, a closed set. */
type Reader = 'claude.usage'

/** A probe's state as `board.probes` says it; the field holds none while the quota extension doesn't run, `off` among it. */
export type ProbeState = 'new' | 'ok' | 'failing' | 'backoff' | 'unavailable'

/** A probe as `board.probes` shows it, as it stood at 1.89. Times in epoch ms. */
export type ProbeStatus = {
  name: string
  reads: Reader
  /** How often it reads while nothing else holds it, ms. */
  every: number
  state: ProbeState
  /** When it last read, answered or not. */
  lastAt?: number
  /** Why its last read has no answer. */
  error?: string
  /** When a read last answered. */
  answeredAt?: number
  failsInRow: number
  /** How long it waits after its last read, ms: `every`, longer while backing off or unavailable. */
  wait: number
  /** When it reads next: a moment past (0 before its first read) means at the tower's next tick. */
  nextAt: number
  /** `nextAt` is set by what the sessions read: a session's turn read every limit it reads, and it reads no sooner than `every` after. */
  held: boolean
}

/** A read as `GET /probe/<name>` answers it. */
export type ProbeRead = { reads: Reader; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

/** `GET /probe/<name>`: a probe's status and its latest reads, newest first. */
export type ProbeView = { status: Board['probes'][number]; reads: ({ at: number } & ProbeRead)[] }

const QUOTA_ONLY = (name: string | undefined) => apiError('not_found', `No probe "${name}": the tower runs quota, the quota extension's (tower x quota)`)

/** An old verb whose input and reply are the new one's. */
const same: LegacyVerb = { input: (old) => old, reply: (now) => now }

export const LEGACY_VERBS: Record<string, LegacyVerb> = {
  'policy/run': same,
  'policy/pass': same,
  'policy/approve': same,
  'review/append': same,
  'probe/run': {
    input: (old) => ((old as { name: string }).name === 'quota' ? {} : QUOTA_ONLY((old as { name: string }).name)),
    reply: (now) => ({ t: 'probed', ...(now as Omit<Replies['probe/run'], 't'>) }),
  },
}

export const LEGACY_READS: Record<string, LegacyRead> = {
  'reviews/<project>': { request: ({ project }) => ({ params: { project: project! }, query: {} }), reply: (now) => now },
  'runs/<project>': {
    request: ({ project }, { policy, limit }) => ({ params: { project: project! }, query: { policy: String(policy), limit: String(limit) } }),
    reply: (now) => now,
  },
  'probe/<name>': {
    request: ({ name }, { last }) => (name === 'quota' ? { params: {}, query: { last: String(last) } } : QUOTA_ONLY(name)),
    reply: (now, board) => {
      const status = board.probes.find((p) => p.name === 'quota')
      if (!status) return apiError('unavailable', 'The quota extension folds no status now: tower extensions says why')
      const reads = (now as { reads: ({ at: number; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string }))[] }).reads
      return { status, reads: reads.map((read) => ({ ...read, reads: 'claude.usage' })) } satisfies ProbeView
    },
  },
}

/** The quota extension's part, as `board.x.quota` holds it. */
type QuotaPart = Omit<ProbeStatus, 'name' | 'reads'>

/** A call as the policies extension's part names it: its verb, and its input. */
type MovedCall = [verb: string, input: unknown]

/** The policies extension's part of a floor, as it stood at the move: its calls naming `policies/run` and `policies/approve`. */
type PoliciesPart = {
  policies: (PolicyFields & { calls: Record<string, MovedCall>; actions: { verb: string; call?: MovedCall }[] })[]
  offers: (OfferFields & { calls: Record<string, MovedCall>; actions: { verb: string; call?: MovedCall }[] })[]
}

/** The core's verbs the moved calls named before the move. */
const OLD_VERB: Record<string, string> = { 'policies/run': 'policy/run', 'policies/approve': 'policy/approve' }

const oldCall = ([verb, input]: MovedCall): MovedCall => [OLD_VERB[verb] ?? verb, input]

/** What a view or an offer calls, named as the core named it. */
const oldCalls = <T extends { calls: Record<string, MovedCall>; actions: { verb: string; call?: MovedCall }[] }>(thing: T): T => ({
  ...thing,
  calls: Object.fromEntries(Object.entries(thing.calls).map(([verb, call]) => [verb, oldCall(call)])),
  actions: thing.actions.map((a) => (a.call ? { ...a, call: oldCall(a.call) } : a)),
})

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

/** A floor thread with its calls named as the core named them. */
const oldThread = ({ key: _, ...thread }: ReviewsFloorPart['threads'][number]): FloorThread => {
  const note = thread.calls.note && (['review/append', thread.calls.note[1]] as const)
  return { ...thread, calls: note ? { note: [...note] } : {}, actions: note ? [{ verb: 'note', call: [...note] }] : [] }
}

const policiesPart = (subject: { x?: Record<string, unknown> }) => subject.x?.[POLICIES] as PoliciesPart | undefined

export const LEGACY_FIELDS: Record<string, LegacyField> = {
  'floor.policies': (floor): PolicyView[] => (policiesPart(floor as Floor)?.policies ?? []).map(oldCalls) as PolicyView[],
  'floor.tidy.threads': (floor, board): Floor['tidy'] => ({
    ...(floor as Floor).tidy,
    threads: (board.adds[`floor:${(floor as Floor).id}`]?.tidy ?? []).flatMap((e) => (e.cap === 'reviews' ? [e.key] : [])),
  }),
  'card.run': (card): CardRun | undefined => (policiesPart(card as Card) as { run?: CardRun } | undefined)?.run,
  'board.offers': (board): Offer[] =>
    ((board as Board).floors.flatMap((f) => (policiesPart(f)?.offers ?? []).map(oldCalls)) as Offer[]).sort((a, b) => a.since - b.since),
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
  'board.probes': (board) => {
    const quota = (board as Board).x?.quota as QuotaPart | undefined
    if (!quota) return []
    const offers: { verbs: ProbeVerb[]; calls: ProbeCalls; actions: ProbeAction[] } = probeOffers('quota', false)
    return [{ name: 'quota', reads: 'claude.usage', ...quota, ...offers }]
  },
}

/** By an old stream's folder, then code: what the core folds of its facts. */
export const LEGACY_READINGS: Record<string, Record<string, LegacyReading>> = {
  'probe.quota': {
    p: (fact) => {
      const read = fact as ProbeRead
      if (!read.ok) return undefined
      const { unavailable: _, ...reading } = usageReading(read.answer)
      return reading
    },
  },
}

/** The entry of `kind` named `old`, when there is one. */
export const legacyNamed = (kind: LegacyEntry['kind'], old: string): LegacyEntry | undefined => legacyOf(kind).find((e) => e.old === old)

/** A subject's field set to what `LEGACY_FIELDS` makes of it. */
const projected = <T extends object>(subject: T, field: string, board: Board, old: string): T => ({ ...subject, [field]: LEGACY_FIELDS[old](subject, board) })

/**
 * The folded board with every moved part copied back to its old field: the board's own fields, then each floor's and
 * each of its cards'.
 */
export const projectLegacy = (board: Board): Board => {
  const at = (subject: string) => legacyOf('board').flatMap((e) => (e.old.startsWith(`${subject}.`) ? [{ old: e.old, field: e.old.slice(subject.length + 1).split('.')[0] }] : []))
  const onBoard = at('board').reduce((b, { old, field }) => projected(b, field, board, old), board)
  const onFloor = at('floor')
  const onCard = at('card')
  if (!onFloor.length && !onCard.length) return onBoard
  return {
    ...onBoard,
    floors: onBoard.floors.map((floor) => {
      const cards = floor.cards.map((card) => onCard.reduce((c, { old, field }) => projected(c, field, board, old), card))
      return onFloor.reduce((f, { old, field }) => projected(f, field, board, old), { ...floor, cards })
    }),
  }
}

/** The config read with its old spellings moved to where they are now, and what each says. */
export type Respelled = {
  config: Config
  /** Each old spelling honoured, by its key, with the line to write instead. */
  old: { key: string; use: string }[]
  /** Each old spelling set beside its new one: the tower takes neither. */
  both: { key: string; now: string }[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The config as the tower reads it: `probes.quota.off`, the quota probe's before it moved into the quota extension,
 * read as `extensions.quota.off`, and `probes.quota.every` as `extensions.quota.settings.every`, until 2.0. A field set
 * in both spellings is `both`; any other probe or field reads nothing, which `tower config check` says.
 */
export const respelled = (config: Config): Respelled => {
  const quota = isObject(config.probes) && isObject(config.probes.quota) ? (config.probes.quota as ProbeConfig) : undefined
  if (!quota || (config.extensions !== undefined && !isObject(config.extensions))) return { config, old: [], both: [] }
  const entry = isObject(config.extensions?.quota) ? config.extensions.quota : {}
  const settings = isObject(entry.settings) ? entry.settings : {}
  const moves = [
    ...(quota.off === undefined ? [] : [{ key: 'probes.quota.off', now: 'extensions.quota.off', set: entry.off !== undefined, use: `"extensions": { "quota": { "off": ${JSON.stringify(quota.off)} } }` }]),
    ...(quota.every === undefined
      ? []
      : [{ key: 'probes.quota.every', now: 'extensions.quota.settings.every', set: settings.every !== undefined, use: `"extensions": { "quota": { "settings": { "every": ${JSON.stringify(quota.every)} } } }` }]),
  ]
  const both = moves.filter((m) => m.set).map(({ key, now }) => ({ key, now }))
  const quotaNow = {
    ...entry,
    ...(quota.off !== undefined && entry.off === undefined && { off: quota.off }),
    ...(quota.every !== undefined && settings.every === undefined && { settings: { ...settings, every: quota.every } }),
  }
  return {
    config: moves.length ? { ...config, extensions: { ...config.extensions, quota: quotaNow } } : config,
    old: moves.filter((m) => !m.set).map(({ key, use }) => ({ key, use })),
    both,
  }
}

/** The config as the tower reads it (`respelled`); a field set in both spellings is a config error naming both. */
export const configNow = (config: Config): Config => {
  const { config: now, both } = respelled(config)
  if (both.length) throw new ConfigError(both.map((b) => `${b.key} and ${b.now} are both set: ${b.key} is the old spelling, so keep ${b.now} and remove ${b.key}`).join('; '))
  return now
}
