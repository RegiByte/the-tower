import { toast } from './kit.js'
import { DRAFTS, discard, draftItem, draftPath, draftTitles, openDraft as loadDraft } from '/x/drafts/drafts.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { Location } from '../../src/shared/views.ts'
 * @import { Draft } from '../../extensions/drafts/client/drafts.ts'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   board: () => Board,
 *   goTo: (location: Location) => void,
 *   openSpawn: (project: string, sent?: { d: Draft; text: string; }) => void,
 * }} DraftDeps
 */

/** The drafts editor, the drafts extension's view of a draft (`drafts/editor`). */
const EDITOR = 'drafts/editor'

/**
 * The page's part in drafts (`/x/drafts/drafts.js`), whose editor is the drafts extension's view: their titles in the
 * sidebar, a new one or one kept opened in the editor, and the new-worker form opened on one, which deletes it once a
 * worker starts on it.
 * @param {DraftDeps} deps
 */
export function draft(deps) {
  const { render, board, goTo, openSpawn } = deps
  /** The drafts collection's reads and writes, over the page's routes. */
  const draftIo = {
    call: tower.call,
    /** @param {string} project @param {string} id */
    read: (project, id) => tower.text(draftPath(project, id)),
    /** @param {Error} err */
    failed: (err) => toast(err.message),
  }

  const { title: draftTitle, prune: pruneDraftTitles } = draftTitles(draftIo.read, () => render())

  /** A new draft in the editor, or the one kept as `id`. @param {string} project @param {string} [id] */
  const openDraft = (project, id) => goTo({ view: EDITOR, subject: id === undefined ? `collection:${project}/${DRAFTS}` : `item.${DRAFTS}:${project}/${id}` })

  /** The new-worker form on the draft kept as `id`, its text read as it is on disk now. @param {string} project @param {string} id */
  async function spawnOn(project, id) {
    const item = draftItem(board().floors, project, id)
    const d = item && (await loadDraft(draftIo, project, item).catch((err) => (toast(err.message), null)))
    if (d === null) return
    if (!d) return toast('That draft is gone')
    openSpawn(project, { d, text: d.text })
  }

  /** @param {Draft} d */
  const deleteSent = (d) => discard(draftIo, d)

  return { draftIo, draftTitle, pruneDraftTitles, openDraft, spawnOn, deleteSent }
}
