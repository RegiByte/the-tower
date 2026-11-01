/**
 * What a viewer keeps in `tower.store` that every renderer of theirs reads alike, as one record: the waits and offers
 * they dismissed, how often a wait rings, how the brief draws prompts and answers, how Changes draws a diff and whether
 * it shows its file tree, the gone-home crews they unfolded, the Stats panel's range, whether tips show and those
 * dismissed for good (`/capabilities.js`), and the actions they have seen. `readViewer(tower.store.get)`
 * reads it whole, each field under its key in `VIEWER_KEYS` and `VIEWER_DEFAULT`'s where nothing of its kind is kept; a
 * renderer writes a field with `tower.store.set(VIEWER_KEYS[field], value)`. `tower.store` has no change event: a
 * renderer reads the record again on every board, and when a page it frames writes to the store, to pick up what another
 * renderer of theirs chose.
 *
 * The tower serves this module as `/viewer.js`.
 */
import type { BriefMarkdown } from './brief.ts'
import type { Ring } from './cards.ts'
import type { DiffLayout, StatsRange } from './panels.ts'

export type Viewer = {
  /** The keys of the waits and offers dismissed (`dismissing`). */
  dismissed: string[]
  ring: Ring
  briefMarkdown: BriefMarkdown
  diffLayout: DiffLayout
  /** Whether Changes draws the changed files as a tree beside the diffs. */
  changesTree: boolean
  /** The hirers whose gone-home crew is unfolded, by card id. */
  crewsUnfolded: string[]
  statsRange: StatsRange
  /** Whether tips show at all. */
  tips: boolean
  /** The tips dismissed for good, by `tipKey`. */
  tipsDismissed: string[]
  /**
   * The actions the viewer has seen, by `actionId`, across every head and renderer of theirs: one an extension offers
   * that isn't here is new to them (`isFresh`, decision `region-overflow`). `null` while nothing was ever kept: `seenOf`.
   * @since 1.138
   */
  seen: string[] | null
}

export const VIEWER_KEYS = {
  dismissed: 'waits.dismissed',
  ring: 'waits.ring',
  briefMarkdown: 'brief.markdown',
  diffLayout: 'changes.layout',
  changesTree: 'changes.tree',
  crewsUnfolded: 'crews.unfolded',
  statsRange: 'stats.range',
  tips: 'tips.on',
  tipsDismissed: 'tips.dismissed',
  seen: 'actions.seen',
} as const satisfies { [K in keyof Viewer]: string }

export const VIEWER_DEFAULT: Viewer = { dismissed: [], ring: 'once', briefMarkdown: 'rendered', diffLayout: 'unified', changesTree: false, crewsUnfolded: [], statsRange: 'week', tips: true, tipsDismissed: [], seen: null }

const isStrings = (kept: unknown) => Array.isArray(kept) && kept.every((x) => typeof x === 'string')

/**
 * Whether `kept` is of the kind of `like`, a field's default: a list of strings, a value of the same `typeof`, or for a
 * default of `null`, a list of strings or nothing kept.
 */
const sameKind = (kept: unknown, like: unknown) => (like === null ? kept === null || isStrings(kept) : Array.isArray(like) ? isStrings(kept) : typeof kept === typeof like)

/**
 * What the viewer has seen: `kept`, their record's `seen`, or everything `offered` (`offeredIds(board)`) while nothing
 * was ever kept, so a fresh tower, or a window whose store keeps nothing, shows nothing as new. A renderer writes this
 * once when nothing was kept. @since 1.138
 */
export const seenOf = (kept: string[] | null, offered: readonly string[]): string[] => kept ?? [...offered]

/** `seen` with `ids` added, or `undefined` when it holds them all already, so a renderer writes only on a change. @since 1.138 */
export const sawAll = (seen: readonly string[], ids: readonly string[]): string[] | undefined => {
  const added = ids.filter((id, n) => !seen.includes(id) && ids.indexOf(id) === n)
  return added.length ? [...seen, ...added] : undefined
}

/**
 * The viewer's record as `get` (`tower.store.get`) answers each key: `null` or `undefined` for one never kept. A framed
 * page can write the store, so a value not of its field's kind reads as the default.
 */
export async function readViewer(get: (key: string) => Promise<unknown>): Promise<Viewer> {
  const fields = Object.keys(VIEWER_KEYS) as (keyof Viewer)[]
  const kept = await Promise.all(fields.map((field) => get(VIEWER_KEYS[field])))
  return Object.fromEntries(fields.map((field, i) => [field, sameKind(kept[i], VIEWER_DEFAULT[field]) ? kept[i] : VIEWER_DEFAULT[field]])) as Viewer
}
