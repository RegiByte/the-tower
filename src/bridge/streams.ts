/**
 * Streams: logs of facts the tower observes that belong to no session, one file per UTC month
 * (`streams/<scope>/<stream>/YYYY-MM.jsonl`), each a header line then `[t, code, fact]` events. Every stream is read
 * the same way: each fact stands alone.
 */

/** A stream's first line: each event's `t` is seconds since `startedAt` (epoch ms), the start of the file's UTC month. */
export type StreamHeader = { stream: string; startedAt: number; version: 1 }

export type StreamEvent<C extends string = string, F = unknown> = [t: number, code: C, fact: F]

/** A fact at its moment, epoch ms, with its code. */
export type StreamFact<C extends string = string, F = unknown> = [at: number, code: C, fact: F]

/** The start of `at`'s UTC month: a stream's file is named by it, and its events counted from it. */
export const monthStart = (at: number): number => {
  const d = new Date(at)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export const monthFile = (at: number): string => `${new Date(at).toISOString().slice(0, 7)}.jsonl`

/** The line a fact is appended as, to the file of its month. */
export const eventLine = (at: number, code: string, fact: unknown): string => JSON.stringify([Math.round(at - monthStart(at)) / 1000, code, fact] satisfies StreamEvent)

const parsed = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/** A stream file's facts, and how many of its lines are no JSON. */
export type StreamText = { facts: StreamFact[]; unreadable: number }

/**
 * A stream file's facts; the text after the last newline is a line still being written. Each fact stands alone, so a
 * line that is no JSON (an append torn by a crash, a hand edit) costs that fact only: it is counted and passed over.
 * A header that is no JSON leaves no fact to place in time.
 */
export const streamFacts = (text: string): StreamText => {
  const [header, ...events] = text.split('\n').slice(0, -1).map(parsed) as [StreamHeader | undefined, ...(StreamEvent | undefined)[]]
  const facts = header ? events.flatMap((e): StreamFact[] => (e ? [[header.startedAt + e[0] * 1000, e[1], e[2]]] : [])) : []
  return { facts, unreadable: events.length + 1 - facts.length - (header ? 1 : 0) }
}
