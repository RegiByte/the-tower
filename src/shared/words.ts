/**
 * What changed within an edited line: a removed line and the added line drawn beside it (a pair `splitRows` makes)
 * diffed by token, as GitHub marks the words it changed. `wordRanges` finds each side's changed characters with jsdiff,
 * `markRanges` lays them over a line's highlighted html. Bundled into whatever imports it, so nothing is fetched.
 */
import { diffArrays } from 'diff'

/** A run of a line's characters, `[from, to)`. */
export type CharRange = [number, number]

/** The least share of a pair's characters left as they were for its words to be marked: below it the line was rewritten. */
export const WORDS_ALIKE = 0.5
/** The longest line whose words are marked: longer ones are data or minified code, where marks only add noise. */
export const WORDS_LONGEST = 1000
/**
 * The most tokens a pair may change for its words to be marked. The diff's cost grows with it: unbounded, 200 rewritten
 * lines of 1000 characters took 5 s; at 100, 150 ms. In this repo's last 300 commits an edited line changed a median
 * of 9 tokens, 62 at the 99th percentile, and 2 of 2419 more than 100.
 */
export const WORDS_EDITS = 100

/**
 * Code's tokens: a word (letters with their combining marks, digits, `_` and `$`), a run of whitespace, or any other
 * single character.
 */
const TOKEN = /[\p{L}\p{M}\p{N}_$]+|\s+|[^]/gu

/**
 * Each side's changed characters, `old`'s and `now`'s, after diffing them by token; none when the two share less than
 * `WORDS_ALIKE` of their characters (whitespace aside) or either is longer than `WORDS_LONGEST`. Changed tokens apart
 * only by whitespace make one range. The diff gives up past half the pair's tokens changed (the threshold's own
 * measure, in tokens) or past `WORDS_EDITS`, so a rewritten pair costs little.
 */
export function wordRanges(old: string, now: string): { old: CharRange[]; now: CharRange[] } | undefined {
  if (old.length > WORDS_LONGEST || now.length > WORDS_LONGEST) return undefined
  const ranges = { old: [] as CharRange[], now: [] as CharRange[] }
  const at = { old: 0, now: 0 }
  let kept = 0
  const [a, b] = [old.match(TOKEN) ?? [], now.match(TOKEN) ?? []]
  const parts = diffArrays(a, b, { maxEditLength: Math.min(WORDS_EDITS, Math.ceil((a.length + b.length) * (1 - WORDS_ALIKE))) })
  if (!parts) return undefined
  for (const part of parts) {
    const text = part.value.join('')
    const sides = part.added ? (['now'] as const) : part.removed ? (['old'] as const) : (['old', 'now'] as const)
    if (!part.added && !part.removed) kept += 2 * text.replace(/\s/g, '').length
    for (const side of sides) {
      const from = at[side]
      at[side] += text.length
      if (sides.length === 2) continue
      const last = ranges[side].at(-1)
      if (last && !/\S/.test((side === 'old' ? old : now).slice(last[1], from))) last[1] = at[side]
      else ranges[side].push([from, at[side]])
    }
  }
  const size = (old + now).replace(/\s/g, '').length
  return size && kept / size >= WORDS_ALIKE ? ranges : undefined
}

/** A tag, an entity (one character of text), or a run of plain text. */
const PIECE = /<[^>]*>|&[#\w]+;|[^<&]+|[^]/g

/**
 * `html`, a line's text with tags in it (highlighted code), with each range of its text's characters in a `<mark>`
 * of class `cls`. A mark never holds a tag: it closes before one and opens again after it, so it lives inside the
 * syntax spans and both colours show.
 */
export function markRanges(html: string, ranges: CharRange[], cls: string): string {
  if (!ranges.length) return html
  const open = `<mark class="${cls}">`
  let out = ''
  let at = 0
  let k = 0
  let marking = false
  const mark = (on: boolean) => {
    if (on !== marking) out += on ? open : '</mark>'
    marking = on
  }
  for (const [piece] of html.matchAll(PIECE)) {
    if (piece[0] === '<' && piece.length > 1) {
      mark(false)
      out += piece
      continue
    }
    const entity = piece[0] === '&' && piece.length > 1
    for (const c of entity ? [piece] : [...piece]) {
      while (k < ranges.length && at >= ranges[k][1]) k++
      mark(k < ranges.length && at >= ranges[k][0])
      out += c
      at += entity ? 1 : c.length
    }
  }
  mark(false)
  return out
}
