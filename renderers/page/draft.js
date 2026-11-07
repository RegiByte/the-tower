import { toast } from './kit.js'
import { DRAFTS, discard, draftItem, draftPath, draftTitles, openDraft as loadDraft } from './clients.js'

/**
 * @import { Board } from '/lib/board.js'
 * @import { Location } from '/lib/view.js'
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

  /**
   * The draft kept as `id` as the form opens on it, its text read as it is on disk now; nothing, said in a toast, when
   * it can't be read or is gone.
   * @param {string} project @param {string} id @returns {Promise<{ d: Draft, text: string } | undefined>}
   */
  async function sentOf(project, id) {
    const item = draftItem(board().floors, project, id)
    const d = item && (await loadDraft(draftIo, project, item).catch((err) => (toast(err.message), null)))
    if (d === null) return undefined
    if (!d) return void toast('That draft is gone')
    return { d, text: d.text }
  }

  /** The new-worker form on the draft kept as `id`. @param {string} project @param {string} id */
  async function spawnOn(project, id) {
    const sent = await sentOf(project, id)
    if (sent) openSpawn(project, sent)
  }

  /** @param {Draft} d */
  const deleteSent = (d) => discard(draftIo, d)

  return { draftIo, draftTitle, pruneDraftTitles, openDraft, sentOf, spawnOn, deleteSent }
}
