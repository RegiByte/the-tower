import { callOf, cardSubject, esc } from '/cards.js'
import { chordLabel, commandOf } from '/keymap.js'

/**
 * `chat/input`: a plain text box at the foot of a worker's Brief (`card.composer`). The keymap's `submit` chord or Send
 * sends what it holds through the card's `prompt` verb (`submit/at-prompt`), offered while the worker waits at its
 * prompt with nothing typed in its terminal; Enter is a newline. The tower checks again as the text arrives: a refusal
 * leaves the text in the box and says why under it. Text starting with `/` or `!` is not sent: plain text only. Text sent
 * clears the box, and the prompt shows in the Brief from the log. What is typed is kept per worker in the view's
 * state, so a reload or another renderer finds it.
 */

const ID = 'chat/input'

const STYLE = `:where([data-view="${ID}"]) {
  & .chat { display: flex; flex-direction: column; gap: var(--sp-xs); font: var(--fs-m)/1.45 var(--ui); }
  & textarea { display: block; width: 100%; box-sizing: border-box; resize: none; overflow: hidden;
    padding: var(--sp-s) var(--sp-m); border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: inherit; }
  & textarea:focus-visible { outline: none; border-color: var(--accent); }
  & textarea::placeholder { color: var(--faint); }
  & .foot { display: flex; align-items: center; gap: var(--sp-s); font-size: var(--fs-s); color: var(--muted); }
  & .say { flex: 1; min-width: 0; }
  & .say.refused { color: var(--ink); }
  & .say button { min-height: 0; margin-left: var(--sp-s); padding: 0; border: 0; background: none; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
  & .hint { color: var(--faint); font-size: var(--fs-xs); white-space: nowrap; }
}`

/** How long typing rests before the draft is kept. */
const KEEP_MS = 400

/** Why a worker that is not at its prompt takes none now, by its status, and whether its terminal is where to act. */
const NOT_NOW = {
  booting: { why: 'starting up: it takes a prompt once it waits at its prompt' },
  working: { why: 'working on it: it takes a prompt when it is done' },
  needs_input: { why: 'asking you something: answer it in its terminal', there: true },
  blocked: { why: "waiting on one of Claude's screens: answer it in its terminal", there: true },
  exited: { why: 'not running' },
  lost: { why: 'not running' },
}

/** A worker at its prompt takes none while something is typed in its terminal's composer. */
const HOLDS = { why: 'holding text in its composer, typed in its terminal or a prompt Esc put back: submit it there, or clear it with Ctrl+C', there: true }

/**
 * Claude runs a prompt that starts with `/` as a slash command, whose menus take the keys of whatever is sent next,
 * and one that starts with `!` as a shell command.
 */
const NOT_PLAIN = /^\s*[/!]/
const SLASH = 'Plain text only: run slash and shell commands in its terminal.'

const TERMINAL = '<button data-chat-terminal>Open its terminal</button>'

/** The chord that sends, as this machine names it: the keymap's first `submit` chord with ⌘ on a Mac, with Ctrl elsewhere. */
const sendChord = (keys) => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform)
  const chords = keys.submit ?? []
  const chord = chords.find((c) => c.includes(mac ? 'Meta' : 'Ctrl')) ?? chords[0]
  return chord && (mac ? chordLabel(chord) : chord)
}

export function mount(host, { tower, board: first, subject, kit, state }) {
  let board = first
  let card = subject.value
  /**
   * What the line under the box says: a refusal until the text changes or is sent again, or `sent` while the worker
   * stays in the status it was sent in.
   */
  let said = { t: 'none' }
  let sending = false
  let keepTimer
  /** The line under the box as last drawn: drawn again only when it changes, so its link survives a click. */
  let drawn = ''

  host.innerHTML = `<style>${STYLE}</style><div class="chat">
    <textarea data-chat-text rows="2"></textarea>
    <div class="foot"><span class="say" aria-live="polite"></span><span class="hint"></span><button class="primary" data-chat-send>Send</button></div>
  </div>`
  const text = host.querySelector('[data-chat-text]')
  const say = host.querySelector('.say')
  const hint = host.querySelector('.hint')
  const send = host.querySelector('[data-chat-send]')

  const draftKey = () => `draft.${card.id}`
  const keep = () => {
    clearTimeout(keepTimer)
    keepTimer = setTimeout(() => ((keepTimer = undefined), state.set(draftKey(), text.value || null)), KEEP_MS)
  }

  /** The box as tall as its text: the region's foot caps it and scrolls past that. */
  const fit = () => {
    text.style.height = 'auto'
    text.style.height = `${text.scrollHeight + text.offsetHeight - text.clientHeight}px`
  }

  /** The box fitted again when its width changes, since its text wraps anew. */
  let width = 0
  const widthWatch = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return
    width = entry.contentRect.width
    fit()
  })
  widthWatch.observe(text)

  /** Why the worker takes no prompt now, or undefined while its card offers `prompt`. */
  const notNow = () => (callOf(card, 'prompt') ? undefined : (NOT_NOW[card.status] ?? HOLDS))

  function draw() {
    const not = notNow()
    const chord = sendChord(board.keys)
    const sent = said.t === 'sent' && card.status === said.status && card.enteredAt === said.enteredAt
    const slash = NOT_PLAIN.test(text.value)
    text.placeholder = `A prompt for ${card.callsign}`
    send.disabled = sending || !!not || slash || !text.value.trim()
    hint.textContent = chord ? `${chord} sends` : ''
    say.className = `say${said.t === 'refused' ? ' refused' : ''}`
    const html =
      said.t === 'refused' ? `${esc(said.message)}${TERMINAL}`
      : slash ? `${SLASH}${TERMINAL}`
      : sending ? 'sending…'
      : sent ? 'sent'
      : not ? `${esc(card.callsign)} is ${esc(not.why)}.${not.there ? TERMINAL : ''}`
      : ''
    if (html !== drawn) say.innerHTML = drawn = html
  }

  async function submit() {
    const value = text.value
    const call = callOf(card, 'prompt')
    if (sending || !value.trim() || NOT_PLAIN.test(value) || !call) return
    sending = true
    said = { t: 'none' }
    draw()
    const [verb, input] = call
    const reply = await tower.call(verb, { ...input, text: value }).catch((err) => ({ t: 'error', message: err.message }))
    sending = false
    if (reply?.t === 'error') said = { t: 'refused', message: reply.message }
    else {
      said = { t: 'sent', status: card.status, enteredAt: card.enteredAt }
      if (text.value === value) (text.value = ''), fit()
      clearTimeout(keepTimer)
      keepTimer = undefined
      state.set(draftKey(), text.value || null)
    }
    draw()
  }

  text.addEventListener('input', () => {
    if (said.t === 'refused') said = { t: 'none' }
    fit()
    keep()
    draw()
  })
  text.addEventListener('keydown', (e) => {
    if (commandOf(board.keys, e, 'field') !== 'submit') return
    e.preventDefault()
    void submit()
  })
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-chat-send]')) return void submit()
    if (e.target.closest('[data-chat-terminal]')) kit.display(cardSubject(card), { view: 'tower/terminal' })
  })

  void state.get(draftKey()).then((draft) => {
    if (typeof draft !== 'string' || text.value) return
    text.value = draft
    fit()
    draw()
  })
  draw()
  return {
    update(next, now) {
      board = next
      card = now.value
      draw()
    },
    close() {
      widthWatch.disconnect()
      if (keepTimer === undefined) return
      clearTimeout(keepTimer)
      state.set(draftKey(), text.value || null)
    },
  }
}
