import { DRAFTS } from '../../../src/shared/drafts.ts'
import { itemPath, keptTitles } from '../../../src/shared/items.ts'
import { tower } from './api.ts'
import { FIXTURE, FIXTURE_DRAFTS, FIXTURE_GAMES } from './fixtures.ts'
import { GAMES } from './games.ts'

/**
 * Any collection's items as the floor panel's trays list them, titled from their text where their type names itself.
 * A fixture board reads its own drafts and games, the same on every load.
 */

const FIXTURE_TEXTS: Record<string, Record<string, string>> = { [DRAFTS]: FIXTURE_DRAFTS, [GAMES]: FIXTURE_GAMES }

/** An item's text, rejecting as the API does. */
export const keptText = (project: string, collection: string, id: string): Promise<string> => {
  if (FIXTURE === undefined) return tower.text(itemPath(project, collection, id))
  const text = FIXTURE_TEXTS[collection]?.[`${project}/${id}`]
  return text === undefined ? Promise.reject(Object.assign(new Error(`No item "${id}"`), { code: 'not_found' })) : Promise.resolve(text)
}

let titlesArrived = () => {}
/** Runs `fn` whenever an item's text arrives, to draw its title. */
export const onKeptTitles = (fn: () => void) => void (titlesArrived = fn)

/** Each item's title, `…` until its text has arrived; `pruneKeptTitles` with each board. */
export const { title: keptTitle, prune: pruneKeptTitles } = keptTitles(keptText, () => titlesArrived())
