import type { Board, Card, CardConversation, Floor, FloorItem } from '../bridge/board.ts'

/**
 * A subject of the board, anything extensions fold and contribute to (decision `extensions`): its `kind`, its `key`
 * on `board.adds`, the floor it is on, and `value`, what a fold or a command is handed. Every renderer and the fold
 * pass name subjects through these, so a key is spelled one way.
 */
export type Subject = { kind: string; key: string; project?: string; value: unknown }

/** A worker's card. */
export const cardSubject = (c: Card): Subject => ({ kind: 'card', key: `card:${c.id}`, project: c.project, value: c })

/** One of a card's conversations, handed with the card it is on and its floor. */
export const conversationSubject = (c: Card, v: CardConversation): Subject => ({
  kind: 'conversation',
  key: `conversation:${v.id}`,
  project: c.project,
  value: { ...v, card: c.id, project: c.project },
})

/** The key of a floor's collection's item. */
export const itemKey = (project: string, collection: string, id: string) => `item.${collection}:${project}/${id}`

/** An item of a floor's collection, handed with its floor and collection. */
export const itemSubject = (project: string, collection: string, item: FloorItem): Subject => ({
  kind: `item.${collection}`,
  key: itemKey(project, collection, item.id),
  project,
  value: { ...item, project, collection },
})

export const floorSubject = (f: Floor): Subject => ({ kind: 'floor', key: `floor:${f.id}`, project: f.id, value: f })

export const boardSubject = (b: Board): Subject => ({ kind: 'board', key: 'board', value: b })

/** An entry of an extension's own subject kind, `<cap>.<kind>`, keyed by its `key`, on the floor its part sits on. */
export const ownSubject = (kind: string, entry: { key: string }, project: string | undefined): Subject => ({
  kind,
  key: `${kind}:${entry.key}`,
  ...(project !== undefined && { project }),
  value: entry,
})

/**
 * A subject key as an ask names one: `board`, or a core kind and what it names. An extension's own kinds sit in its
 * part, where `subjectAt` doesn't find them, so an ask is never about one.
 */
export const SUBJECT_KEY = /^(board|(card|conversation|floor|item\.[a-z][a-z0-9.-]*):.+)$/

/** The floor a subject key is on, as the board holds it now; none for the board's and one the board no longer holds. */
export const projectOfKey = (board: Board, key: string): string | undefined => {
  const at = key.indexOf(':')
  const kind = key.slice(0, at)
  const rest = key.slice(at + 1)
  if (kind === 'floor') return rest
  if (kind === 'card') return board.floors.find((f) => f.cards.some((c) => c.id === rest))?.id
  if (kind === 'conversation') return board.floors.find((f) => f.cards.some((c) => c.conversations.some((v) => v.id === rest)))?.id
  if (kind.startsWith('item.')) return rest.slice(0, rest.indexOf('/'))
  return undefined
}

/**
 * The subject `key` names on the board now, as its constructor names it: a card, a conversation, an item, a floor or
 * the board. An extension's own kinds sit in its part, where only a renderer that knows it finds them: `undefined`.
 */
export const subjectAt = (board: Board, key: string): Subject | undefined => {
  if (key === 'board') return boardSubject(board)
  const at = key.indexOf(':')
  const kind = key.slice(0, at)
  const rest = key.slice(at + 1)
  const cards = board.floors.flatMap((f) => f.cards)
  if (kind === 'card') {
    const c = cards.find((c) => c.id === rest)
    return c && cardSubject(c)
  }
  if (kind === 'conversation') {
    const c = cards.find((c) => c.conversations.some((v) => v.id === rest))
    return c && conversationSubject(c, c.conversations.find((v) => v.id === rest)!)
  }
  if (kind === 'floor') {
    const f = board.floors.find((f) => f.id === rest)
    return f && floorSubject(f)
  }
  if (!kind.startsWith('item.')) return undefined
  const collection = kind.slice('item.'.length)
  const project = rest.slice(0, rest.indexOf('/'))
  const item = board.floors.find((f) => f.id === project)?.collections.find((c) => c.id === collection)?.items.find((i) => i.id === rest.slice(project.length + 1))
  return item && itemSubject(project, collection, item)
}
