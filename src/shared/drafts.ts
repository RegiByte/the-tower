import type { FloorCollection } from '../bridge/board.ts'
import type { Replies, Verbs } from './api.ts'
import { itemTitles } from './titles.ts'

/**
 * Drafts: prompts kept for later in a project's `drafts` collection, edited in a renderer, then sent to a new
 * session or typed into a worker and deleted. The editing itself, shared by every renderer that edits them: each
 * keeps its own text field and autosave timer, and hands the draft's text over with `edit`. The tower serves this
 * module as `/drafts.js`; nothing in the core imports it.
 */

export const DRAFTS = 'drafts'

type Item = FloorCollection['items'][number]
type Floor = { id: string; collections: FloorCollection[] }

/**
 * The collection calls drafts make and the reads of their text. Both reject with an `Error` whose `code` is the API's:
 * `not_found` once an item is gone, `refused` when a write finds the item moved on. `failed` says why to the viewer.
 */
export type DraftIo = {
  call<K extends 'collection/create' | 'collection/write' | 'collection/delete'>(verb: K, body: Verbs[K]): Promise<Replies[K]>
  read(project: string, id: string): Promise<string>
  failed(err: Error): void
}

type CodedError = Error & { code?: string }

/** A draft's text; `undefined` once it is gone. Any other failure rejects. */
export const readDraft = (io: Pick<DraftIo, 'read'>, project: string, id: string) =>
  io.read(project, id).catch((err: CodedError) => (err.code === 'not_found' ? undefined : Promise.reject(err)))

export const draftsOf = (f: Floor) => f.collections.find((c) => c.id === DRAFTS)
export function draftItem(floors: Floor[], project: string, id: string) {
  const f = floors.find((f) => f.id === project)
  return f && draftsOf(f)?.items.find((i) => i.id === id)
}

/** Where a draft's text is read from. */
export const draftPath = (project: string, id: string) => `collection/${project}/${DRAFTS}/${encodeURIComponent(id)}`

/** A draft is named by its first line with words on it, a markdown heading's marks left out. */
export const titleOf = (text: string) => text.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? 'empty draft'

/** Each draft's title as of its `modifiedAt`, `…` until its text arrives (`itemTitles`). */
export const draftTitles = (read: DraftIo['read'], onText: () => void) => itemTitles(DRAFTS, read, (_, text) => titleOf(text), onText)

/**
 * A draft open in an editor. `id` is none until its first save. `text` is the editor's, `saved` its text on disk as
 * far as the editor knows, `writing` a text on its way there, `modifiedAt` the version of `saved` (a write names it,
 * and is refused once the file has moved on), and
 * `conflict` the text found on disk while the editor held edits of its own. Saves run one after another on `queue`.
 */
export type Draft = {
  project: string
  id: string | undefined
  text: string
  saved: string
  writing: string | undefined
  modifiedAt: number | undefined
  conflict: string | undefined
  queue: Promise<boolean>
}

export const newDraft = (project: string): Draft =>
  ({ project, id: undefined, text: '', saved: '', writing: undefined, modifiedAt: undefined, conflict: undefined, queue: Promise.resolve(true) })

/** An existing draft with its text; `undefined` when it is gone. */
export async function openDraft(io: DraftIo, project: string, item: Item): Promise<Draft | undefined> {
  const text = await readDraft(io, project, item.id)
  return text === undefined ? undefined : { ...newDraft(project), id: item.id, text, saved: text, modifiedAt: item.modifiedAt }
}

export const isEdited = (d: Draft) => d.text !== d.saved

export const draftState = (d: Draft) => (d.conflict !== undefined ? 'conflict' : !d.id ? 'new' : isEdited(d) ? 'editing' : 'saved')

export const edit = (d: Draft, text: string) => void (d.text = text)

/** A write refused because the file moved on holds the text now on disk as a conflict. */
async function write(io: DraftIo, d: Draft, text: string) {
  if (d.conflict !== undefined) return false
  if (text === d.saved || (!d.id && !text.trim())) return true
  d.writing = text
  try {
    const reply = d.id
      ? await io.call('collection/write', { project: d.project, collection: DRAFTS, id: d.id, content: text, modifiedAt: d.modifiedAt! })
      : await io.call('collection/create', { project: d.project, collection: DRAFTS, ext: 'md', content: text })
    if (reply.t === 'created') d.id = reply.id
    d.modifiedAt = reply.modifiedAt
    d.saved = text
    return true
  } catch (err) {
    if ((err as CodedError).code !== 'refused') return (io.failed(err as Error), false)
    await io.read(d.project, d.id!).then((theirs) => void (d.conflict = theirs), io.failed)
    return false
  } finally {
    d.writing = undefined
  }
}

/**
 * Queues a write of the editor's text as it is now. Resolves to whether it is on disk: an empty new draft is never
 * created, and a conflict holds every save until the editor settles it.
 */
export const save = (io: DraftIo, d: Draft) => (d.queue = d.queue.then(() => write(io, d, d.text)))

/**
 * The board shows a version of the draft (`undefined`: none). A board from before the editor's own save changes
 * nothing, a change made elsewhere replaces an unedited text, and one made under the editor's edits is held as a
 * conflict. A draft the board doesn't show yet is gone only once reading it says so; a text that could not be read
 * is read again on the next board.
 */
export async function follow(io: DraftIo, d: Draft, item: Item | undefined): Promise<'same' | 'gone' | 'replaced' | 'conflict'> {
  if (!d.id) return 'same'
  if (!item) return (await readDraft(io, d.project, d.id).catch(() => '')) === undefined ? 'gone' : 'same'
  if (d.modifiedAt !== undefined && item.modifiedAt <= d.modifiedAt) return 'same'
  const text = await io.read(d.project, d.id).catch(() => undefined)
  if (text === undefined) return 'same'
  d.modifiedAt = item.modifiedAt
  if (text === d.saved || text === d.writing) return 'same'
  if (isEdited(d)) return (d.conflict = text, 'conflict')
  d.saved = d.text = text
  return 'replaced'
}

/** Edits held under a conflict that differ from the text on disk: leaving keeps them as a draft of their own. */
export const keepsApart = (d: Draft) => d.conflict !== undefined && d.text !== d.conflict && d.text.trim() !== ''

/**
 * Saves the editor's text as the editor closes. Under a conflict the text on disk stays as it is, and edits that
 * differ from it become a new draft beside it.
 */
export const leave = (io: DraftIo, d: Draft) =>
  d.conflict === undefined ? save(io, d) : keepsApart(d) ? (d.queue = d.queue.then(() => write(io, newDraft(d.project), d.text))) : d.queue

/** Takes the text found on disk, or keeps the editor's: either way the draft saves again. */
export function settle(io: DraftIo, d: Draft, take: boolean) {
  if (take) d.text = d.conflict!
  d.saved = d.conflict!
  d.conflict = undefined
  return save(io, d)
}

/**
 * The draft as it will be sent: saved first, so a failed send leaves it on disk as it was sent. `undefined` when it
 * is empty or could not be saved.
 */
export async function sendable(io: DraftIo, d: Draft): Promise<string | undefined> {
  const text = d.text
  if (!text.trim() || !(await save(io, d))) return undefined
  return text
}

/** Deletes a draft by id, open or not: one sent, or thrown away. */
export const discardItem = (io: DraftIo, project: string, id: string) =>
  io.call('collection/delete', { project, collection: DRAFTS, id }).catch(io.failed)

/** Deletes an open draft once its pending saves are done; a draft never saved has nothing to delete. */
export async function discard(io: DraftIo, d: Draft) {
  await d.queue
  if (d.id) await discardItem(io, d.project, d.id)
}

/**
 * A prompt typed into the new-worker form that closed without starting a worker is kept, never lost: as a new draft,
 * or, when the form was opened on a draft (`from`), as that draft's new text. Resolves to the draft it is in once on
 * disk; `undefined` when there was nothing new to keep or it could not be saved. A blank prompt is never kept.
 */
export async function keepUnsent(io: DraftIo, project: string, from: Draft | undefined, text: string): Promise<Draft | undefined> {
  if (!text.trim() || text === from?.text) return undefined
  const d = from ?? newDraft(project)
  edit(d, text)
  return (await save(io, d)) ? d : undefined
}
