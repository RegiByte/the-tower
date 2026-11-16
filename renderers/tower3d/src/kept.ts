import { itemPath, keptTitles } from '/lib/view.js'
import type { Tower } from './api.ts'

/**
 * Any collection's items as the floor panel's trays list them: an item's text, rejecting as the API does, and each
 * item's title from its text where its type names itself, `…` until its text has arrived (`arrived`), pruned with each
 * board.
 */
export function keptTitled(tower: Tower, arrived: () => void) {
  const keptText = (project: string, collection: string, id: string): Promise<string> => tower.text(itemPath(project, collection, id))
  const { title: keptTitle, prune: pruneKeptTitles } = keptTitles(keptText, arrived)
  return { keptText, keptTitle, pruneKeptTitles }
}
