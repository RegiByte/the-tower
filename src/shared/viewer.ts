/**
 * What a viewer keeps in `tower.store` that every renderer of theirs reads alike, as one record: the waits and offers
 * they dismissed, how often a wait rings, how the brief draws prompts and answers, how Changes draws a diff, the
 * gone-home crews they unfolded and the Stats panel's range. `readViewer(tower.store.get)` reads it whole, each field
 * under its key in `VIEWER_KEYS` and `VIEWER_DEFAULT`'s where nothing is kept; a renderer writes a field with
 * `tower.store.set(VIEWER_KEYS[field], value)`. `tower.store` has no change event: a renderer reads the record again on
 * every board, and when a page it frames writes to the store, to pick up what another renderer of theirs chose.
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
  /** The hirers whose gone-home crew is unfolded, by card id. */
  crewsUnfolded: string[]
  statsRange: StatsRange
}

export const VIEWER_KEYS = {
  dismissed: 'waits.dismissed',
  ring: 'waits.ring',
  briefMarkdown: 'brief.markdown',
  diffLayout: 'changes.layout',
  crewsUnfolded: 'crews.unfolded',
  statsRange: 'stats.range',
} as const satisfies { [K in keyof Viewer]: string }

export const VIEWER_DEFAULT: Viewer = { dismissed: [], ring: 'once', briefMarkdown: 'rendered', diffLayout: 'unified', crewsUnfolded: [], statsRange: 'week' }

/** The viewer's record as `get` (`tower.store.get`) answers each key: `null` or `undefined` for one never kept. */
export async function readViewer(get: (key: string) => Promise<unknown>): Promise<Viewer> {
  const fields = Object.keys(VIEWER_KEYS) as (keyof Viewer)[]
  const kept = await Promise.all(fields.map((field) => get(VIEWER_KEYS[field])))
  return Object.fromEntries(fields.map((field, i) => [field, kept[i] ?? VIEWER_DEFAULT[field]])) as Viewer
}
