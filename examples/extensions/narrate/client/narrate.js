/**
 * Narration's commands, run by renderers that import client modules: `speak` is offered on every draft, `stop` in the
 * palette. Each reads through `window.tower`, as any renderer does, and speaks through `voice.js`.
 */
import * as voice from './voice.js'

/** A draft's markdown as it is read aloud: headings, emphasis, code fences and link targets left out. */
export const spoken = (markdown) =>
  markdown
    .replace(/^```.*$/gm, '')
    .replace(/^\s{0,3}(#+|[-*+]|\d+\.)\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim()

/** Reads the draft aloud: its text through the drafts collection's generic read. */
export async function speak({ tower, subject }) {
  voice.speak(spoken(await tower.text(`collection/${subject.project}/drafts/${encodeURIComponent(subject.id)}`)))
}

/** Stops reading. */
export function stop() {
  voice.stop()
}
