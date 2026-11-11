/**
 * Where text picked in a drawn file is in its source (decision `passage-picks`): `sectionsHtml` writes a mark before
 * each top-level block naming the lines it was written on, and a pick reads its lines from the marks; a file drawn as
 * written reads them from its own text.
 */

/** The lines of the source a top-level block was written on, first and last, from 1, as a mark before its html says them. */
export type SourceLines = { from: number; to: number }

/** The comment written before a block's html, naming its source lines: `<!--src:12-15-->`. */
export const sourceMark = ({ from, to }: SourceLines) => `<!--src:${from}-${to}-->`

/** A source mark's text, as read back from the comment `sourceMark` wrote: `src:12-15`. */
export const SOURCE_MARK = /^src:(\d+)-(\d+)$/

/**
 * The source lines a pick spans, from the marks before and in it, in document order: from the first line of the block
 * it starts in (the last mark before it, else the first in it) to the last line of the block it ends in (the last mark
 * before its end). None when no mark is at or before it.
 */
export function linesPicked(before: SourceLines[], within: SourceLines[]): SourceLines | undefined {
  const start = before.at(-1) ?? within[0]
  const end = within.at(-1) ?? before.at(-1)
  return start && end && { from: start.from, to: end.to }
}

/**
 * The lines of `text` a pick from character `start` to `end` spans, from 1: a pick that ends just past a line's break
 * ends on that line, not on the next. For a file drawn as written, whose drawn text is its source.
 */
export function textLines(text: string, start: number, end: number): SourceLines {
  const lineAt = (offset: number) => text.slice(0, offset).split('\n').length
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end
  return { from: lineAt(start), to: lineAt(last) }
}
