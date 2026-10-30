import type { Board, Card, CardConversation, CardShown, Floor, FloorCollection, FloorItem } from '../bridge/board.ts'
import type { ExtensionSubject } from './extensions.ts'
import { mediaTypeOf } from './media.ts'
import type { ShelfEntry } from './model.ts'
import type { Tower } from './shelf-page.ts'
import { shownHref } from './worker-details.ts'

/**
 * A subject of the board, anything extensions fold and contribute to and commands run on (decision `extensions`): its
 * `kind`, its `key` on `board.adds`, the floor it is on, and `value`, what a fold is handed. Every renderer and the fold
 * pass name subjects through these, so a key is spelled one way. A subject whose content is text or a file says where:
 * `value.text`, the path its text is read at (`tower.text`), or `value.body`, the text itself; and `value.type`, its
 * media type, which a command's `accepts` is matched against. `textOf` reads either.
 */
export type Subject = { kind: string; key: string; project?: string; value: unknown }

/** Where a subject's content is and what it is: a read path, or the text itself; its media type. */
export type Text = { text?: string; body?: string; type?: string }

/** A worker's card. */
export const cardSubject = (c: Card): Subject => ({ kind: 'card', key: `card:${c.id}`, project: c.project, value: c })

/** One of a card's conversations, handed with the card it is on and its floor. */
export const conversationSubject = (c: Card, v: CardConversation): Subject => ({
  kind: 'conversation',
  key: `conversation:${v.id}`,
  project: c.project,
  value: { ...v, card: c.id, project: c.project },
})

/** The media type of an address a worker showed, a url or a link: its body is the address. @since 1.115 */
export const ADDRESS_TYPE = 'text/uri-list'

/**
 * Something a worker showed, by the moment it showed it, handed with its card and floor: a file with its text's read
 * path and its type by its name, an address (a url or a link) with itself as its body and `ADDRESS_TYPE` (@since 1.115). @since 1.98
 */
export const shownSubject = (c: Card, s: CardShown): Subject => ({
  kind: 'shown',
  key: `shown:${c.id}/${s.at}`,
  project: c.project,
  value: { ...s, card: c.id, project: c.project, ...(s.kind === 'file' ? { text: shownHref(s).slice(1), type: mediaTypeOf(s.target) } : { body: s.target, type: ADDRESS_TYPE }) },
})

/** Lines of a file a worker changed, as a renderer holds them: a viewer subject of the card. @since 1.111 */
export type Lines = { card: string; project: string; repo: string; path: string; from: number; to: number; quote?: { lang: string; lines: string[] } }

/** Lines of a worker's changes, handed with its card and floor: a viewer subject, never on the board. @since 1.111 */
export const linesSubject = (lines: Lines): Subject => ({
  kind: 'lines',
  key: `lines:${lines.card}/${lines.repo}/${lines.path}#${lines.from}-${lines.to}`,
  project: lines.project,
  value: lines,
})

/**
 * A file in a worker's checkout, as a renderer holds it: its repo (named as an anchor names it, `repoName` of
 * `/reviews.js`), its path in the repo, its absolute path where it has one (`file`, for Finder and the editor), where its content is read
 * (`text`, a read path) and its media type. @since 1.114; `file` @since 1.117
 */
export type CheckoutFile = { card: string; project: string; repo: string; path: string; file?: string; text: string; type: string }

/** A file of a worker's checkout, handed with its card and floor: a viewer subject, never on the board. @since 1.114 */
export const fileSubject = (file: CheckoutFile): Subject => ({
  kind: 'file',
  key: `file:${file.card}/${file.repo}/${file.path}`,
  project: file.project,
  value: file,
})

/** The key of a floor's collection's item. */
export const itemKey = (project: string, collection: string, id: string) => `item.${collection}:${project}/${id}`

/** An item of a floor's collection, handed with its floor and collection, its text's read path and its type. */
export const itemSubject = (project: string, collection: string, item: FloorItem): Subject => ({
  kind: `item.${collection}`,
  key: itemKey(project, collection, item.id),
  project,
  value: { ...item, project, collection, text: `collection/${project}/${collection}/${encodeURIComponent(item.id)}`, type: mediaTypeOf(item.id) },
})

/** One of a floor's collections, handed with its floor. @since 1.98 */
export const collectionSubject = (project: string, c: FloorCollection): Subject => ({
  kind: 'collection',
  key: `collection:${project}/${c.id}`,
  project,
  value: { ...c, project },
})

/** The `n`th entry of a floor's shelf, handed with its place and floor. @since 1.98 */
export const shelfSubject = (project: string, entry: ShelfEntry, n: number): Subject => ({
  kind: 'shelf',
  key: `shelf:${project}/${n}`,
  project,
  value: { ...entry, n, project },
})

export const floorSubject = (f: Floor): Subject => ({ kind: 'floor', key: `floor:${f.id}`, project: f.id, value: f })

export const boardSubject = (b: Board): Subject => ({ kind: 'board', key: 'board', value: b })

/**
 * An entry of an extension's own subject kind, `<cap>.<kind>`, keyed by the subject it was found in (`instance`, where
 * its owner's part holds it) and its `key`, whose own needn't be unique across floors.
 */
export const ownSubject = (kind: string, entry: { key: string }, instance: Subject): Subject => ({
  kind,
  key: `${kind}:${instance.key}/${entry.key}`,
  ...(instance.project !== undefined && { project: instance.project }),
  value: entry,
})

/** An own kind's entry's key before 1.98, `<cap>.<kind>:<key>`, under which `board.adds` copies its contributions until 2.0. */
export const ownLegacyKey = (kind: string, entry: { key: string }) => `${kind}:${entry.key}`

/** Whether `kind` is an extension's own, `<cap>.<kind>`: dotted, and no collection's item. @since 1.98 */
export const isOwnKind = (kind: string) => kind.includes('.') && !kind.startsWith('item.')

/** Whether a command's `on` offers it on `kind`: the kind itself, or `item.*`, every collection's item. @since 1.98 */
export const onKind = (on: readonly string[], kind: string) => on.includes(kind) || (kind.startsWith('item.') && on.includes('item.*'))

/** The kind and the rest of a key: `card:<id>` is `card` and `<id>`; `board` is `board` and nothing. */
const split = (key: string): { kind: string; rest: string } => {
  const at = key.indexOf(':')
  return at < 0 ? { kind: key, rest: '' } : { kind: key.slice(0, at), rest: key.slice(at + 1) }
}

/** An own kind's key as its instance's key and its entry's: `reviews.thread:floor:p/p/main` is `floor:p` and `p/main`. */
const ownParts = (rest: string): { instance: string; entry: string } => {
  const slash = rest.indexOf('/')
  return { instance: rest.slice(0, slash), entry: rest.slice(slash + 1) }
}

/**
 * The key of the subject `subject` belongs to: a floor's the board, a card's, a collection's and a shelf entry's its
 * floor, a conversation's, a showing's and lines' its card, an item's its collection, an own kind's the subject it was found
 * in. The board belongs to none. @since 1.98
 */
export const parentOf = (subject: Subject): string | undefined => {
  const { kind, key, project } = subject
  const value = subject.value as { card?: string; collection?: string }
  if (kind === 'board') return undefined
  if (kind === 'floor') return 'board'
  if (kind === 'card' || kind === 'collection' || kind === 'shelf') return `floor:${project}`
  if (kind === 'conversation' || kind === 'shown' || kind === 'lines' || kind === 'file') return `card:${value.card}`
  if (kind.startsWith('item.')) return `collection:${project}/${value.collection}`
  return ownParts(split(key).rest).instance
}

/**
 * A subject key as an ask names one: `board`, or a core kind and what it names. An extension's own kinds aren't
 * named by asks.
 */
export const SUBJECT_KEY = /^(board|(card|conversation|shown|floor|collection|shelf|item\.[a-z][a-z0-9.-]*):.+)$/

/** The floor a subject key is on, as the board holds it now; none for the board's and one the board no longer holds. */
export const projectOfKey = (board: Board, key: string): string | undefined => {
  const { kind, rest } = split(key)
  if (kind === 'floor') return rest
  if (kind === 'card' || kind === 'shown') {
    const id = kind === 'card' ? rest : rest.slice(0, rest.indexOf('/'))
    return board.floors.find((f) => f.cards.some((c) => c.id === id))?.id
  }
  if (kind === 'conversation') return board.floors.find((f) => f.cards.some((c) => c.conversations.some((v) => v.id === rest)))?.id
  if (kind === 'collection' || kind === 'shelf' || kind.startsWith('item.')) return rest.slice(0, rest.indexOf('/'))
  if (isOwnKind(kind)) return projectOfKey(board, ownParts(rest).instance)
  return undefined
}

/** The subject of a running extension's own kind `key` names: its entry in its owner's part of the subject it was found in. */
const ownAt = (board: Board, kind: string, rest: string): Subject | undefined => {
  const cap = kind.slice(0, kind.indexOf('.'))
  const declared: ExtensionSubject | undefined = board.extensions.find((e) => e.provides === cap && e.state === 'started')?.subjects.find((s) => s.kind === kind)
  if (!declared) return undefined
  const { instance: instanceKey, entry: entryKey } = ownParts(rest)
  const instance = subjectAt(board, instanceKey)
  if (instance?.kind !== declared.in) return undefined
  const entries = ((instance.value as { x?: Record<string, Record<string, unknown>> }).x?.[cap]?.[declared.list] ?? []) as { key: string }[]
  const entry = entries.find((e) => e.key === entryKey)
  return entry && ownSubject(kind, entry, instance)
}

/**
 * The subject `key` names on the board now, as its constructor names it: a card, a conversation, a showing, an item, a
 * collection, a shelf entry, a floor, the board, or an entry of a running extension's own kind.
 */
export const subjectAt = (board: Board, key: string): Subject | undefined => {
  if (key === 'board') return boardSubject(board)
  const { kind, rest } = split(key)
  const cards = board.floors.flatMap((f) => f.cards)
  if (kind === 'card') {
    const c = cards.find((c) => c.id === rest)
    return c && cardSubject(c)
  }
  if (kind === 'conversation') {
    const c = cards.find((c) => c.conversations.some((v) => v.id === rest))
    return c && conversationSubject(c, c.conversations.find((v) => v.id === rest)!)
  }
  if (kind === 'shown') {
    const slash = rest.indexOf('/')
    const c = cards.find((c) => c.id === rest.slice(0, slash))
    const s = c?.shown.find((s) => String(s.at) === rest.slice(slash + 1))
    return s && shownSubject(c!, s)
  }
  if (kind === 'floor') {
    const f = board.floors.find((f) => f.id === rest)
    return f && floorSubject(f)
  }
  if (isOwnKind(kind)) return ownAt(board, kind, rest)
  const slash = rest.indexOf('/')
  const floor = board.floors.find((f) => f.id === rest.slice(0, slash))
  const name = rest.slice(slash + 1)
  if (!floor) return undefined
  if (kind === 'collection') {
    const c = floor.collections.find((c) => c.id === name)
    return c && collectionSubject(floor.id, c)
  }
  if (kind === 'shelf') {
    const entry = floor.shelf?.[Number(name)]
    return entry && shelfSubject(floor.id, entry, Number(name))
  }
  if (!kind.startsWith('item.')) return undefined
  const collection = kind.slice('item.'.length)
  const item = floor.collections.find((c) => c.id === collection)?.items.find((i) => i.id === name)
  return item && itemSubject(floor.id, collection, item)
}

/** A subject's text: its `body`, or what its read path `text` reads. A subject that bears neither has none to read. @since 1.98 */
export const textOf = async (tower: Tower, subject: Subject): Promise<string> => {
  const { text, body } = subject.value as Text
  if (body !== undefined) return body
  if (text === undefined) throw new Error(`${subject.key} bears no text: a command that reads it accepts the types of subjects that do`)
  return tower.text(text)
}
