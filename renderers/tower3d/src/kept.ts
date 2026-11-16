import { itemPath, keptTitles } from '/lib/view.js'
import type { Tower } from './api.ts'
import { FIXTURE, FIXTURE_DRAFTS, FIXTURE_GAMES } from './fixtures.ts'
import { GAMES } from './games.ts'

/**
 * Any collection's items as the floor panel's trays list them: an item's text, rejecting as the API does, and each
 * item's title from its text where its type names itself, `…` until its text has arrived (`arrived`), pruned with each
 * board. A fixture board reads its own drafts (the collection `drafts` names) and games, the same on every load.
 */
export function keptTitled(tower: Tower, drafts: string, arrived: () => void) {
  const fixtureTexts: Record<string, Record<string, string>> = { [drafts]: FIXTURE_DRAFTS, [GAMES]: FIXTURE_GAMES }
  const keptText = (project: string, collection: string, id: string): Promise<string> => {
    if (FIXTURE === undefined) return tower.text(itemPath(project, collection, id))
    const text = fixtureTexts[collection]?.[`${project}/${id}`]
    return text === undefined ? Promise.reject(Object.assign(new Error(`No item "${id}"`), { code: 'not_found' })) : Promise.resolve(text)
  }
  const { title: keptTitle, prune: pruneKeptTitles } = keptTitles(keptText, arrived)
  return { keptText, keptTitle, pruneKeptTitles }
}
