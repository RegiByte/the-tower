/**
 * The voice: the one place narration speaks. It is the browser's own speech (`speechSynthesis`); to use another
 * provider, replace these two functions with calls to it, keeping their names.
 */

/** Reads `text` aloud, cutting off whatever is being read. */
export function speak(text) {
  speechSynthesis.cancel()
  speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

/** Stops reading. */
export function stop() {
  speechSynthesis.cancel()
}
