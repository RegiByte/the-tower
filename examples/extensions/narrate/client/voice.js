/**
 * The voice: the one place narration speaks. With a voice command set (narrate's settings), each chunk of the text is
 * voiced by `narrate/say` and played in order through one audio element, the next voiced while one plays; without
 * one, the browser's own speech (`speechSynthesis`) reads it.
 */

/** The most characters voiced in one call: a chunk is cut at a paragraph, else a sentence, else a space. */
export const CHUNK = 1800

/** The audio element every chunk plays through. */
export const audio = new Audio()

/** Bumped by every speak and stop: a narration whose number is no longer current stops where it is. */
let current = 0

/** `parts` packed into pieces of at most `max` characters, joined by `sep`; a part longer than `max` is cut by `cut`. */
const pack = (parts, sep, max, cut) =>
  parts.flatMap((part) => (part.length > max ? cut(part) : [part])).reduce((pieces, part) => {
    const last = pieces.at(-1)
    return last !== undefined && last.length + sep.length + part.length <= max ? [...pieces.slice(0, -1), last + sep + part] : [...pieces, part]
  }, [])

/** A text with no sentence break cut at the last space within `max`, or at `max` where there is none. */
const bySpace = (text, max) => {
  const pieces = []
  let rest = text
  while (rest.length > max) {
    const at = rest.lastIndexOf(' ', max)
    const end = at > 0 ? at : max
    pieces.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }
  return [...pieces, rest].filter(Boolean)
}

/** `text` in chunks of at most `max` characters, in order: whole paragraphs where they fit, else sentences. */
export const chunksOf = (text, max = CHUNK) =>
  pack(text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), '\n\n', max, (paragraph) =>
    pack(paragraph.split(/(?<=[.!?…])\s+/), ' ', max, (sentence) => bySpace(sentence, max)),
  )

/** One chunk voiced by the command, as an object URL of its audio. */
const voiced = async (tower, text) => {
  const { audio: read } = await tower.call('narrate/say', { text })
  return URL.createObjectURL(await tower.blob(read))
}

/** Plays `url` to its end, or until it is paused; rejects when it can't play. */
const play = (url) =>
  new Promise((resolve, reject) => {
    const done = (err) => {
      audio.onended = audio.onpause = audio.onerror = null
      URL.revokeObjectURL(url)
      err ? reject(err) : resolve()
    }
    audio.onended = audio.onpause = () => done()
    audio.onerror = () => done(new Error(`the voice's audio won't play: ${audio.error?.message || `media error ${audio.error?.code}`}`))
    audio.src = url
    audio.play().catch(done)
  })

/** Plays `first`, then each of `rest` voiced while the one before it plays, while narration `mine` is current. */
const playAll = async (tower, mine, first, rest) => {
  let url = first
  for (let i = 0; ; i++) {
    const next = i < rest.length ? voiced(tower, rest[i]) : undefined
    next?.catch(() => {})
    await play(url)
    if (!next || mine !== current) return next?.then(URL.revokeObjectURL, () => {})
    url = await next
    if (mine !== current) return URL.revokeObjectURL(url)
  }
}

/**
 * Reads `text` aloud through the voice command, cutting off whatever is being read. It settles once the first chunk
 * plays; a later chunk that fails is toasted.
 */
export async function speakCommand(tower, text, toast) {
  const mine = halt()
  const [first, ...rest] = chunksOf(text)
  if (!first) return
  toast(rest.length ? `Voicing ${rest.length + 1} parts…` : 'Voicing…')
  const url = await voiced(tower, first)
  if (mine !== current) return URL.revokeObjectURL(url)
  playAll(tower, mine, url, rest).catch((err) => mine === current && toast(err.message))
}

/** Reads `text` aloud through the browser's own speech, cutting off whatever is being read. */
export function speakBrowser(text) {
  halt()
  speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

/** Stops whichever voice reads, and answers the number of a narration started now. */
const halt = () => {
  speechSynthesis.cancel()
  audio.pause()
  return ++current
}

/** Stops reading. */
export function stop() {
  halt()
}
