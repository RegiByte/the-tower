import { onAttention, palettes } from '../../../src/shared/design.ts'
import { base, findCard, gistLine, modelName, pairLine } from '../../../src/shared/cards.ts'
import type { Board, Card } from './api.ts'

export * from '../../../src/shared/cards.ts'

/**
 * The building's own colours: lamps, tags, bubbles and signs are things in the world, painted once, so they keep the
 * light palette whatever scheme the viewer's panels follow.
 */
export const WORLD = palettes.light

/** A card's attention colour in the world. Panels colour by the `attention` class instead, in the viewer's scheme. */
export const statusColor = (c: Card) => WORLD[c.attention]
/** Text on a card's attention colour in the world. */
export const onStatusColor = (c: Card) => (onAttention[c.attention] === 'white' ? '#fff' : WORLD.enamel)

/** A gallery's picture by its worker and target, with the worker's card while the board carries it. */
export const pictureOf = (board: Board, id: string, target: string) => {
  const showing = board.floors.flatMap((f) => f.gallery).find((g) => g.worker.id === id && g.shown.target === target)
  return showing && { ...showing, card: findCard(board, id) }
}

export const onDuty = (cards: Card[]) => cards.filter((c) => c.onDuty).sort((a, b) => a.startedAt - b.startedAt)

const GLANCE_CHARS = 56

/** The gist as one short line, for a label read from across the floor. */
export const glanceOf = (c: Card) => {
  const line = gistLine(c).replace(/\s+/g, ' ').trim()
  return line.length > GLANCE_CHARS ? `${line.slice(0, GLANCE_CHARS - 1)}…` : line
}

const SPEECH_CHARS = 36
const SPEECH_LINES = 2

/** A message as a speech bubble's lines: wrapped between words, cut with … past the last line. */
export function speechLines(text: string): string[] {
  const lines = text.replace(/\s+/g, ' ').trim().split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)
    return last !== undefined && `${last} ${word}`.length <= SPEECH_CHARS ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])
  const kept = lines.slice(0, SPEECH_LINES).map((l) => (l.length > SPEECH_CHARS ? `${l.slice(0, SPEECH_CHARS - 1)}…` : l))
  return lines.length > SPEECH_LINES ? [...kept.slice(0, -1), `${kept.at(-1)!.slice(0, SPEECH_CHARS - 1)}…`] : kept
}

export const metaOf = (c: Card) =>
  [modelName(c.model), c.effort, c.context !== undefined && `ctx ${c.context}%`, c.costUsd !== undefined && `$${c.costUsd.toFixed(2)}`, base(c.cwd), pairLine(c)]
    .filter(Boolean)
    .join(' · ')
