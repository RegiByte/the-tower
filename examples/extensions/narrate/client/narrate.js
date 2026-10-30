/**
 * Narration's commands, run by renderers that import client modules: `speak` is offered on every markdown or text item
 * and file a worker showed, on each section of a markdown document and each prompt and answer of a brief, and `stop`
 * in the palette. Each reads through `window.tower`, as any renderer does, and speaks
 * through `voice.js`.
 */
import { textOf } from '/cards.js'
import * as voice from './voice.js'

/** Markdown as it is read aloud: headings, emphasis, code fences and link targets left out. */
export const spoken = (markdown) =>
  markdown
    .replace(/^```.*$/gm, '')
    .replace(/^\s{0,3}(#+|[-*+]|\d+\.)\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim()

/** Reads the subject aloud: its text, wherever the subject says it is. */
export async function speak({ tower, target }) {
  voice.speak(spoken(await textOf(tower, target)))
}

/** Stops reading. */
export function stop() {
  voice.stop()
}
