import type { Floor } from './api.ts'

/**
 * Games: single html files kept in a project's `games` collection, each played in a sandboxed frame. What a game is
 * means something only to this renderer: the core keeps the files.
 */
export const GAMES = 'games'

export const gamesOf = (f: Pick<Floor, 'collections'>) => f.collections.find((c) => c.id === GAMES)

export function gameItem(floors: Floor[], project: string, id: string) {
  const f = floors.find((f) => f.id === project)
  return f && gamesOf(f)?.items.find((i) => i.id === id)
}

/** Where a game is read and played from. */
export const gamePath = (project: string, id: string) => `collection/${project}/${GAMES}/${encodeURIComponent(id)}`
