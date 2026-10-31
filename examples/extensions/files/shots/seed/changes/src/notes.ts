export type Note = { site: string; text: string; at: string; tags: string[] }

const notes: Note[] = []

/** A site's notes, newest first; every note without a site. */
export const notesAt = (site: string | null): Note[] =>
  notes
    .filter((n) => site === null || n.site === site)
    .toReversed()

/** The tags a note's text names, each as #word. */
const tagsOf = (text: string) =>
  [...text.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase())

export function addNote(site: string, text: string): Note {
  const at = new Date().toISOString()
  const note = { site, text, at, tags: tagsOf(text) }
  notes.push(note)
  return note
}
