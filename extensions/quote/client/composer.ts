import { can, type Card, offeredCall, type Passage } from '/lib/board.js'
import { statusName } from '/lib/cards.js'
import { commandOf } from '/lib/keys.js'
import { type Mount, pressing, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'

/**
 * `quote/composer`: a prompt about a passage picked in a markdown, text, code or html file a worker showed, typed into
 * that worker's prompt and submitted (the core's `submit`, queued while it works). The prompt names the file and its
 * lines, where it has them, and quotes the passage (`askPrompt`). Once it is sent, or cancelled, the view says it is
 * `done` (a bubbling event on its host), and the file lets the pick go.
 */

const ID = 'quote/composer'

/** The most characters a quote may have: past it, the prompt would bury the question. */
export const MAX_QUOTE = 4000

/** The most lines the prompt grows to before it scrolls. */
const MAX_ROWS = 8

const STYLE = viewCss(
  ID,
  `padding: var(--sp-m) var(--sp-l); font: var(--fs-m)/1.4 var(--ui);
  & textarea { display: block; width: 100%; resize: none; overflow-y: auto; padding: var(--sp-s) var(--sp-m);
    max-height: calc(${MAX_ROWS} * 1.45em + 2 * var(--sp-s) + 2px);
    border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-m)/1.45 var(--ui); }
  & textarea::placeholder { color: var(--faint); }
  & textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .actions { display: flex; align-items: center; gap: var(--sp-s); margin-top: var(--sp-s); }
  & .actions .hint { margin-left: auto; color: var(--faint); font-size: var(--fs-xs); }
  & .why { color: var(--muted); font-size: var(--fs-s); }
`,
)

/** Where a passage is, in words: its file and its lines, where it has them. The quote says the rest. */
const whereOf = (p: Passage) => {
  const lines = p.from === undefined ? '' : p.from === p.to ? ` (line ${p.from})` : ` (lines ${p.from}–${p.to})`
  return `${p.file ?? 'the document you showed'}${lines}`
}

/** Files whose passages are prose, quoted as a blockquote: any other is code or data, quoted as written in a fence. */
const PROSE = /\.(md|markdown|txt|html?)$/i

/** A passage quoted: prose as a blockquote; code in a fence longer than any run of backticks in it, named by its file's extension. */
const quoted = (p: Passage) => {
  if (p.file === undefined || PROSE.test(p.file)) return p.quote.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')
  const fence = '`'.repeat(Math.max(3, ...(p.quote.match(/`+/g) ?? []).map((run) => run.length + 1)))
  const lang = /\.([a-z0-9]+)$/i.exec(p.file)?.[1] ?? ''
  return `${fence}${lang}\n${p.quote}\n${fence}`
}

/** The prompt a passage and the user's words make: where the passage is, the passage quoted, then the words. */
export const askPrompt = (p: Passage, words: string) => `About this passage of ${whereOf(p)}:\n\n${quoted(p)}\n\n${words.trim()}`

/** Enter alone sends, as Claude's own prompt does: a prompt about a passage is mostly a line. Shift+Enter breaks a line; an IME's Enter commits its text. */
const sendsAlone = (e: KeyboardEvent) => e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing

/** A prompt as tall as its lines, from one up to `MAX_ROWS`, where its max-height stops it and it scrolls. */
const fit = (text: HTMLTextAreaElement) => {
  text.style.height = 'auto'
  text.style.height = `${text.scrollHeight + text.offsetHeight - text.clientHeight}px`
}

/** What is typed about each document, by its key: this page's, kept while its passages are picked again. */
const drafts = new Map<string, string>()

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let passage = subject.value as Passage
  const cardOf = (): Card | undefined => board.floors.flatMap((f) => f.cards).find((c) => c.id === passage.card)

  host.innerHTML = `<style>${STYLE}</style><div class="body"></div>`
  const body = host.querySelector<HTMLElement>('.body')!

  const done = () => host.dispatchEvent(new Event('done', { bubbles: true }))
  const cancel = () => (drafts.delete(passage.of), done())

  /** Why the passage can't be asked about now, or none. */
  const whyNot = (card: Card | undefined) => {
    if (passage.card === undefined) return 'No worker showed this document: ask about a passage of one a worker showed.'
    if (!card) return 'The worker that showed this is gone.'
    if (!can(card, 'submit')) return `${card.callsign} is ${statusName(card)}: it takes no prompt now.`
    if (passage.quote.length > MAX_QUOTE) return `The passage is ${passage.quote.length} characters, past ${MAX_QUOTE}: pick less, or name the section in a prompt of your own.`
    return undefined
  }

  /**
   * The box: the prompt, its placeholder naming who it goes to and its title where the passage is, or why there is
   * none. The passage is lit in the file, or selected in the page, so it isn't drawn again here, whoever read it.
   * It never takes the focus, neither as it is made nor on a new pick or a board: a pick leaves the focus and the
   * selection where they are, so the passage can be copied, and the user clicks into the prompt to ask, as in Claude's
   * own prompt.
   */
  function draw() {
    const card = cardOf()
    const why = whyNot(card)
    if (why) {
      body.innerHTML = `<div class="why">${esc(why)}</div><div class="actions"><button data-ask-cancel>Close</button></div>`
      return
    }
    if (!body.querySelector('textarea')) {
      body.innerHTML = `<textarea data-ask-text rows="1"></textarea>
        <div class="actions"><button class="primary" data-ask-send>Send</button><button data-ask-cancel>Cancel</button><span class="hint">queued while it works</span></div>`
      const text = body.querySelector<HTMLTextAreaElement>('[data-ask-text]')!
      text.value = drafts.get(passage.of) ?? ''
      text.addEventListener('input', () => (drafts.set(passage.of, text.value), fit(text)))
      text.addEventListener('keydown', (e) => {
        const id = commandOf(board.keys, e, 'field')
        if (id === 'submit' || sendsAlone(e)) return (e.preventDefault(), void send())
        if (id === 'cancel-pick') (e.preventDefault(), cancel())
      })
    }
    const text = body.querySelector<HTMLTextAreaElement>('[data-ask-text]')!
    text.placeholder = `Ask ${card!.callsign} about this passage (⏎ sends it, Esc cancels)`
    text.title = whereOf(passage)
    fit(text)
  }

  async function send() {
    const text = body.querySelector<HTMLTextAreaElement>('[data-ask-text]')!
    if (!text.value.trim()) return void kit.toast('Write a prompt about the passage first')
    const card = cardOf()!
    const prompt = askPrompt(passage, text.value)
    const reply = await pressing(body.querySelector<HTMLElement>('[data-ask-send]')!, () => tower.run(offeredCall(card, 'submit', card.callsign), { text: prompt })).catch(
      (err: Error) => void kit.toast(err.message),
    )
    if (!reply) return
    kit.toast(`Sent to ${card.callsign}`)
    drafts.delete(passage.of)
    done()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-ask-send]')) return void send()
    if (target.closest('[data-ask-cancel]')) cancel()
  })

  draw()

  return {
    update(next, now) {
      board = next
      passage = now.value as Passage
      draw()
    },
    close() {},
  }
}
