/**
 * The voice: the one place narration speaks. A narration reads parts in order (the sections of a document, or one
 * text), each cut into chunks. With a voice command set (narrate's settings), each chunk is voiced by `narrate/say`
 * and played in order through one audio element, the next voiced while one plays; without one, the browser's own
 * speech (`speechSynthesis`) reads them. A narration is told through its track: `at(part)` as a part starts sounding,
 * and `end()` once, as it ends or is stopped. A memo (`interject`) is said at once when nothing reads; while something
 * does, it waits for the chunk sounding to end, is said, and the reading goes on.
 */

/** The most characters voiced in one call: a chunk is cut at a paragraph, else a sentence, else a space. */
export const CHUNK = 1800

/** The audio element every chunk plays through. */
export const audio = new Audio()

/** Bumped by every speak and stop: a narration whose number is no longer current stops where it is. */
let current = 0

/** Ends the current narration's track: called once, as it ends or is stopped. */
let ending = () => {}

/** @typedef {{ at(part: number): void, end(): void }} Track */

/** @typedef {{ tower: unknown, text: string, track: Track, toast(message: string): void, command?: boolean }} Memo */

/** Whether a narration reads: from its start until it ends or is stopped. */
let reading = false

/** Memos waiting for the chunk sounding to end, in the order they came. @type {Memo[]} */
let waiting = []

/** The track of the memo sounding between chunks, ended by a stop. @type {Track | undefined} */
let saying

/** The current narration's utterances, held while they are read: WebKit fires no event on one nothing holds. */
let utterances = []

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

/** Every part's chunks, in order, each with the place of its part. @param {string[]} parts */
const chunked = (parts) => parts.flatMap((text, part) => chunksOf(text).map((chunk) => ({ text: chunk, part })))

/**
 * Plays `url` for narration `mine`, calling `onStart` once it sounds: to its end, or until a halt pauses it. A pause
 * from elsewhere (a media key) stays a pause. Rejects when it can't play.
 */
const play = (url, mine, onStart) =>
  new Promise((resolve, reject) => {
    const done = (err) => {
      audio.onended = audio.onpause = audio.onerror = null
      URL.revokeObjectURL(url)
      err ? reject(err) : resolve()
    }
    audio.onended = () => done()
    audio.onpause = () => mine !== current && done()
    audio.onerror = () => done(new Error(`the voice's audio won't play: ${audio.error?.message || `media error ${audio.error?.code}`}`))
    audio.src = url
    audio.play().then(onStart, (err) => done(mine === current ? err : undefined))
  })

/**
 * Plays `first`, the first of `chunks` voiced, then each of the rest voiced while the one before it plays, while
 * narration `mine` is current, telling `started` the place of each chunk as it sounds.
 */
const playAll = async (tower, mine, first, chunks, started) => {
  let url = first
  for (let i = 0; ; i++) {
    const next = i + 1 < chunks.length ? voiced(tower, chunks[i + 1].text) : undefined
    next?.catch(() => {})
    await play(url, mine, () => started(i))
    await sayWaiting(mine)
    if (!next || mine !== current) return next?.then(URL.revokeObjectURL, () => {})
    url = await next
    if (mine !== current) return URL.revokeObjectURL(url)
  }
}

/** Starts a narration told through `track`, cutting off whatever is being read: its number. @param {Track} track */
const begin = (track) => {
  const mine = halt()
  reading = true
  ending = once(track.end)
  return mine
}

/** `fn`, called at most once. @param {() => void} fn */
const once = (fn) => {
  let called = false
  return () => called || ((called = true), fn())
}

/**
 * Narration `mine` has ended on its own: its track is told, while it is current, and the memos it left waiting (it
 * failed before their turn) are said now.
 */
const finish = (mine) => {
  if (mine !== current) return
  reading = false
  const end = ending
  ending = () => {}
  end()
  const left = waiting
  waiting = []
  for (const memo of left) Promise.resolve(interject(memo, memo.command)).catch((err) => memo.toast(err.message))
}

/**
 * Says each memo waiting through the voice command, one after another, while narration `mine` is current; one that
 * can't be voiced is toasted and the next said.
 */
const sayWaiting = async (mine) => {
  for (let memo = waiting.shift(); memo && mine === current; memo = waiting.shift()) {
    const url = await voiced(memo.tower, memo.text).catch((err) => (memo.toast(err.message), undefined))
    if (!url) continue
    if (mine !== current) return URL.revokeObjectURL(url)
    const said = sayingNow(memo)
    await play(url, mine, () => memo.track.at(0)).catch((err) => memo.toast(err.message))
    said()
  }
}

/**
 * Says `memo`: at once when nothing reads, through the command when `command`, else the browser's speech; while
 * something reads, after the chunk sounding, in the voice it reads with. @param {Memo} memo @param {boolean} command
 */
export function interject(memo, command) {
  if (reading) return void waiting.push({ ...memo, command })
  return command ? speakCommand(memo.tower, [memo.text], memo.toast, memo.track) : speakBrowser([memo.text], memo.track)
}

/**
 * Reads `parts` aloud in order through the voice command, cutting off whatever is being read. It settles once the
 * first chunk sounds, rejecting when it can't, or once the narration is stopped; a later chunk that fails is toasted.
 * @param {string[]} parts @param {Track} track
 */
export async function speakCommand(tower, parts, toast, track) {
  const mine = begin(track)
  const chunks = chunked(parts)
  if (!chunks.length) return finish(mine)
  toast(chunks.length > 1 ? `Voicing ${chunks.length} parts…` : 'Voicing…')
  const url = await voiced(tower, chunks[0].text).catch((err) => {
    finish(mine)
    throw err
  })
  if (mine !== current) return URL.revokeObjectURL(url)
  let sounded = false
  await new Promise((sounding, failed) => {
    const started = (i) => {
      if (mine === current) track.at(chunks[i].part)
      sounded = true
      sounding()
    }
    playAll(tower, mine, url, chunks, started).then(
      () => (finish(mine), sounding()),
      (err) => {
        const shown = mine === current
        finish(mine)
        sounded ? shown && toast(err.message) : failed(err)
      },
    )
  })
}

/**
 * Reads `parts` aloud in order through the browser's own speech, one utterance a chunk, cutting off whatever is being
 * read. @param {string[]} parts @param {Track} track
 */
export function speakBrowser(parts, track) {
  const mine = begin(track)
  const chunks = chunked(parts)
  const next = (i) => {
    if (mine !== current) return
    if (i === chunks.length) return finish(mine)
    const { text, part } = chunks[i]
    say(text, () => mine === current && track.at(part), () => sayWaitingAloud(mine, () => next(i + 1)))
  }
  next(0)
}

/**
 * Speaks `text` through the browser, held until it ends: WebKit fires no event on an utterance nothing holds. One the
 * browser can't say ends as one said, so what follows it is read.
 */
const say = (text, onStart, onEnd) => {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.onstart = onStart
  utterance.onend = utterance.onerror = () => ((utterances = utterances.filter((u) => u !== utterance)), onEnd())
  utterances.push(utterance)
  speechSynthesis.speak(utterance)
}

/** Says each memo waiting through the browser's speech, one after another, while narration `mine` is current, then `then`. */
const sayWaitingAloud = (mine, then) => {
  if (mine !== current) return
  const memo = waiting.shift()
  if (!memo) return then()
  const said = sayingNow(memo)
  say(memo.text, () => memo.track.at(0), () => (said(), sayWaitingAloud(mine, then)))
}

/** `memo` is sounding between chunks: a stop ends its track, as does the function answered, once it is said. @param {Memo} memo */
const sayingNow = (memo) => {
  const track = { ...memo.track, end: once(memo.track.end) }
  saying = track
  return () => {
    track.end()
    if (saying === track) saying = undefined
  }
}

/** Stops whichever voice reads, ends its track, and answers the number of a narration started now. */
const halt = () => {
  speechSynthesis.cancel()
  utterances = []
  audio.pause()
  reading = false
  saying?.end()
  saying = undefined
  const end = ending
  ending = () => {}
  end()
  return ++current
}

/** Stops reading, and drops the memos waiting: they stay listed, to hear again. */
export function stop() {
  waiting = []
  halt()
}
