/**
 * What `LEGACY`'s moves do beyond a name, keyed by the old name: an old verb's input as the new one takes it and the
 * new reply as the old one answered; an old read's params and query, and its reply; and an old board field's value, copied
 * from the part it moved to as it stood at the move, so a renderer reading the old field reads what it always did.
 */
import type { ApiError } from '../shared/api.ts'
import { legacyOf, type LegacyEntry } from '../shared/extensions.ts'
import type { Board } from './board.ts'

/** An old verb: its input as the new one takes it, or why it can't be; the new verb's reply as the old one answered. */
export type LegacyVerb = { input(old: unknown): unknown; reply(now: unknown): unknown }

/** An old read: its params and query as the new one takes them, or why it can't; the new read's reply, with the board, as the old one answered. */
export type LegacyRead = {
  request(params: Record<string, string | undefined>, query: Record<string, unknown>): { params: Record<string, string>; query: Record<string, string> } | ApiError
  reply(now: unknown, board: Board): unknown
}

/** An old board field's value, from its subject (the board, a floor or a card) on the folded board: for a name below a field, that field's whole value. */
export type LegacyField = (subject: unknown, board: Board) => unknown

export const LEGACY_VERBS: Record<string, LegacyVerb> = {}

export const LEGACY_READS: Record<string, LegacyRead> = {}

export const LEGACY_FIELDS: Record<string, LegacyField> = {}

/** The entry of `kind` named `old`, when there is one. */
export const legacyNamed = (kind: LegacyEntry['kind'], old: string): LegacyEntry | undefined => legacyOf(kind).find((e) => e.old === old)

/** A subject's field set to what `LEGACY_FIELDS` makes of it. */
const projected = <T extends object>(subject: T, field: string, board: Board, old: string): T => ({ ...subject, [field]: LEGACY_FIELDS[old](subject, board) })

/**
 * The folded board with every moved part copied back to its old field: the board's own fields, then each floor's and
 * each of its cards'.
 */
export const projectLegacy = (board: Board): Board => {
  const at = (subject: string) => legacyOf('board').flatMap((e) => (e.old.startsWith(`${subject}.`) ? [{ old: e.old, field: e.old.slice(subject.length + 1).split('.')[0] }] : []))
  const onBoard = at('board').reduce((b, { old, field }) => projected(b, field, board, old), board)
  const onFloor = at('floor')
  const onCard = at('card')
  if (!onFloor.length && !onCard.length) return onBoard
  return {
    ...onBoard,
    floors: onBoard.floors.map((floor) => {
      const cards = floor.cards.map((card) => onCard.reduce((c, { old, field }) => projected(c, field, board, old), card))
      return onFloor.reduce((f, { old, field }) => projected(f, field, board, old), { ...floor, cards })
    }),
  }
}
