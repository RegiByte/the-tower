import { palettes } from '/lib/design.js'
import { findCard } from '/lib/board.js'
import { gistLine, tidyRows } from '/lib/cards.js'
import { plain } from '/lib/words.js'
import type { Board, Card, Floor, GalleryShowing } from './api.ts'

export * from '/lib/board.js'
export * from '/lib/cards.js'
export * from '/lib/layout.js'
export * from '/lib/spawn.js'
export * from '/lib/words.js'

/** A status as one glyph over a worker: a question (a screen's, too), a failure, an outcome nobody has looked at, or a doze; none while at work or stranded. */
export const bubbleOf = (c: Card) => (c.broken ? '×' : c.stranded ? '' : c.status === 'needs_input' || c.status === 'blocked' ? '?' : c.waiting && c.status === 'failed' ? '×' : c.waiting ? '!' : c.status === 'idle' ? 'z' : '')

/** What a worker says over its head while it works: once the turn ends, its gist speaks. */
export const speechOf = (c: Card): string[] => (c.status === 'working' && !c.broken ? c.says.map(plain) : [])

/** The Tidy row that kills the hire `id`, its work landed: its call applies only that. */
export const landedRow = (f: Floor, id: string, now: number) =>
  tidyRows(f, now).find(({ call: [, { plan }] }) => plan?.prune.some((p) => p.t === 'kill' && p.id === id))

/**
 * The building's own colours: lamps, tags, bubbles and signs are things in the world, painted once, so they keep the
 * light palette whatever scheme the viewer's panels follow.
 */
export const WORLD = palettes.light

/** A card's attention colour in the world. Panels colour by the `attention` class instead, in the viewer's scheme. */
export const statusColor = (c: Card) => WORLD[c.attention]
/** Text on a card's attention colour in the world. */
export const onStatusColor = (c: Card) => WORLD[`on${c.attention[0].toUpperCase()}${c.attention.slice(1)}` as `on${Capitalize<Card['attention']>}`]

/** A picture among `galleries` (every floor's, `galleryOf`) by its worker and target, with the worker's card while the board carries it. */
export const pictureOf = (galleries: GalleryShowing[], board: Board, id: string, target: string) => {
  const showing = galleries.find((g) => g.worker.id === id && g.shown.target === target)
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
