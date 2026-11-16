import type { Tower } from './api.ts'
import type { Clients } from './clients.ts'

/**
 * The drafts pinned as notes, read through the drafts extension's client: a draft's text, rejecting as the API does
 * (`not_found` once it is gone), and each note's title, `…` until its draft's text has arrived (`arrived`), pruned
 * with each board.
 */
export function notesTitled(tower: Tower, { draftPath, draftTitles }: Pick<Clients, 'draftPath' | 'draftTitles'>, arrived: () => void) {
  const noteText = (project: string, id: string): Promise<string> => tower.text(draftPath(project, id))
  const { title: noteTitle, prune: pruneNoteTitles } = draftTitles(noteText, arrived)
  return { noteText, noteTitle, pruneNoteTitles }
}
