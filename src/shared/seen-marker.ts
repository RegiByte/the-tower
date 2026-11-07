import { isFresh } from './adds.ts'
import { readViewer, sawAll, seenOf } from './viewer.ts'

/**
 * What marks actions seen by the viewer for a renderer: `keep`, told the whole `seen` when any of them was new to them.
 * `seen` is read from the store just before it is written, since another window of theirs may have added to it since
 * this one last read it, and the writes of a window go one after another.
 */
export const seenMarker = (get: (key: string) => Promise<unknown>, offered: () => readonly string[], keep: (seen: string[]) => void) => {
  let seeing = Promise.resolve()
  return (ids: string[]) => {
    if (!ids.length) return
    seeing = seeing.then(async () => {
      const declared = offered()
      const had = seenOf((await readViewer(get)).seen, declared)
      const next = sawAll(had, ids.filter((id) => isFresh(declared, had, id)))
      if (next) keep(next)
    })
  }
}
