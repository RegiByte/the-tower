import { draftPath, draftTitles } from '../../../src/shared/drafts.ts'
import { tower } from './api.ts'
import { FIXTURE, FIXTURE_DRAFTS } from './fixtures.ts'

/**
 * A draft's text, rejecting as the API does (`not_found` once it is gone). A fixture board reads its own drafts, the
 * same on every load.
 */
export const noteText = (project: string, id: string): Promise<string> => {
  if (FIXTURE === undefined) return tower.text(draftPath(project, id))
  const text = FIXTURE_DRAFTS[`${project}/${id}`]
  return text === undefined ? Promise.reject(Object.assign(new Error(`No draft "${id}"`), { code: 'not_found' })) : Promise.resolve(text)
}

let titlesArrived = () => {}
/** Runs `fn` whenever a note's text arrives, to draw its title. */
export const onTitles = (fn: () => void) => void (titlesArrived = fn)

/** Each note's title, `…` until its draft's text has arrived; `pruneNoteTitles` with each board. */
export const { title: noteTitle, prune: pruneNoteTitles } = draftTitles(noteText, () => titlesArrived())
