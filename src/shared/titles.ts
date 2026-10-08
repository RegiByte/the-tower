import type { FloorCollection } from '../bridge/board.ts'

/**
 * An item's title, derived from its own text wherever it is shown: nothing about an item is stored beside it. The
 * tower page reads it through `/drafts.js`; `tower kept` and Tower 3D import it.
 */

/** What an item's title is derived from: its id names its type, its tag stands in, `modifiedAt` says when to read it again. */
export type Titled = Pick<FloorCollection['items'][number], 'id' | 'tag' | 'modifiedAt'>
type Floor = { id: string; collections: FloorCollection[] }

const TEXT_TITLE = /\.(md|markdown|txt)$/i
const HTML_TITLE = /\.html?$/i

/** Whether an item's type names itself in its text. */
export const titled = (id: string) => TEXT_TITLE.test(id) || HTML_TITLE.test(id)

/** A markdown or text item's first line, an html item's `<title>`: what the user would call it. */
export const titleIn = (id: string, text: string): string | undefined =>
  TEXT_TITLE.test(id)
    ? text.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean)
    : HTML_TITLE.test(id)
      ? text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim()
      : undefined

/**
 * Each of a collection's items' titles as of its `modifiedAt`, its text read again when that changes: the board
 * carries no content. `…` until the text arrives; `onText` runs when one does. A text that could not be read is asked
 * for again the next time its title is. `prune` forgets the items a board no longer shows.
 */
export function itemTitles(collection: string, read: (project: string, id: string) => Promise<string>, titleOf: (item: Titled, text: string) => string, onText: () => void) {
  const texts = new Map<string, { modifiedAt: number; text?: string }>()
  const prune = (floors: Floor[]) => {
    const shown = new Set(floors.flatMap((f) => (f.collections.find((c) => c.id === collection)?.items ?? []).map((i) => `${f.id}/${i.id}`)))
    for (const key of texts.keys()) if (!shown.has(key)) texts.delete(key)
  }
  const title = (project: string, item: Titled) => {
    const key = `${project}/${item.id}`
    const known = texts.get(key)
    if (known?.modifiedAt !== item.modifiedAt) {
      const version = { modifiedAt: item.modifiedAt, text: known?.text }
      texts.set(key, version)
      read(project, item.id).then(
        (text) => texts.get(key) === version && ((version.text = text), onText()),
        () => texts.get(key) === version && texts.delete(key),
      )
    }
    const text = texts.get(key)!.text
    return text === undefined ? '…' : titleOf(item, text)
  }
  return { title, prune }
}
