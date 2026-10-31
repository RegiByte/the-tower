import type { Note } from './notes.ts'

/** The notes holding every word of the query, in their text or their tags. */
export const search = (notes: Note[], query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return notes.filter((n) => words.every((w) => n.text.toLowerCase().includes(w) || n.tags.includes(w)))
}
