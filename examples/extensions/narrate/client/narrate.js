/**
 * Narration's commands, run by renderers that import client modules: `speak` is offered on every markdown or text item
 * and file a worker showed, on each section of a markdown document and each prompt and answer of a brief; `fromHere`
 * on each section of a markdown document; `stop` in the palette. Each reads through `window.tower`, as any renderer
 * does, and speaks through `voice.js`: the voice command when narrate's settings set one, else the browser's own
 * speech. While it reads, the part being read is marked on the page's bus (a document draws its section marked) and a
 * notice says what is read, with Stop.
 */
import { textOf } from '/cards.js'
import * as voice from './voice.js'

/** Narration's capability, which its marks on the bus are put under. */
const CAP = 'narrate'

/** What a part being read is marked with. */
const LISTENING = { label: 'Listening' }

/** Markdown as it is read aloud: headings, emphasis, code fences and link targets left out. */
export const spoken = (markdown) =>
  markdown
    .replace(/^```.*$/gm, '')
    .replace(/^\s{0,3}(#+|[-*+]|\d+\.)\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim()

/** The sections the page holds of the document `of` names, in their order. */
const sectionsOf = (bus, of) => bus.under(of, 'section').sort((a, b) => a.value.n - b.value.n)

/** What a subject being read is called in the notice: a section's heading, an item's tag, a file's name. */
const nameOf = (subject) => {
  const v = subject.value
  if (subject.kind === 'section') return v.heading ?? 'the opening'
  if (subject.kind === 'said') return v.side === 'prompt' ? 'the prompt' : 'the answer'
  if (subject.kind === 'shown') return v.target.split('/').pop()
  return v.tag ?? v.id ?? subject.key
}

/**
 * A narration's track over `subjects`, read in order: the one sounding marked on the bus and named in a notice,
 * with Stop, until it ends.
 */
const tracking = (kit, subjects) => {
  let marked
  let notice
  const mark = (key) => {
    if (marked) kit.bus.mark(marked, CAP, undefined)
    marked = key
    if (key) kit.bus.mark(key, CAP, LISTENING)
  }
  return {
    at(part) {
      const s = subjects[part]
      mark(s.key)
      const words = `Listening · ${nameOf(s)}${subjects.length > 1 ? ` (${part + 1} of ${subjects.length})` : ''}`
      if (notice) notice.say(words)
      else notice = kit.notice(words, { label: 'Stop', run: voice.stop })
    },
    end() {
      mark(undefined)
      notice?.close()
    },
  }
}

/** Reads `subjects` aloud in order, each one's text wherever the subject says it is. */
async function read({ tower, kit }, subjects) {
  const [texts, { command }] = await Promise.all([Promise.all(subjects.map((s) => textOf(tower, s))), tower.get('narrate/voice')])
  const parts = texts.map(spoken)
  const track = tracking(kit, subjects)
  return command ? voice.speakCommand(tower, parts, kit.toast, track) : voice.speakBrowser(parts, track)
}

/**
 * Reads the subject aloud: a section or a prompt alone; a document the page draws by sections, section by section
 * from the first; anything else, its text.
 */
export function speak(ctx) {
  const { target, kit } = ctx
  const sections = target.kind === 'section' ? [] : sectionsOf(kit.bus, target.key)
  return read(ctx, sections.length ? sections : [target])
}

/** Reads a document aloud from this section to its end, section by section. */
export function fromHere(ctx) {
  const { target, kit } = ctx
  return read(ctx, sectionsOf(kit.bus, target.value.of).filter((s) => s.value.n >= target.value.n))
}

/** Stops reading. */
export function stop() {
  voice.stop()
}
