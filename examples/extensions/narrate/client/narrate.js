/**
 * Narration's commands, run by renderers that import client modules: `speak` is offered on every markdown or text item
 * and file a worker showed, on each section of a markdown document and each prompt and answer of a brief, and `stop`
 * in the palette. Each reads through `window.tower`, as any renderer does, and speaks
 * through `voice.js`: the voice command when narrate's settings set one, else the browser's own speech.
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
export async function speak({ tower, target, kit }) {
  const [text, { command }] = await Promise.all([textOf(tower, target), tower.get('narrate/voice')])
  return command ? voice.speakCommand(tower, spoken(text), kit.toast) : voice.speakBrowser(spoken(text))
}

/** Stops reading. */
export function stop() {
  voice.stop()
}
