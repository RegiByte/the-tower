export type Note = { site: string; text: string; at: string }

const notes: Note[] = []

/** A site's notes, newest first; every note without a site. */
export const notesAt = (site: string | null): Note[] =>
  notes
    .filter((n) => site === null || n.site === site)
    .toReversed()

export function addNote(site: string, text: string): Note {
  const note = { site, text, at: new Date().toISOString() }
  notes.push(note)
  return note
}
