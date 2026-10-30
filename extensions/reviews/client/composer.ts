import type { Card } from '../../../src/bridge/board.ts'
import type { Replies } from '../../../src/shared/api.ts'
import { esc, noLongerOffered } from '../../../src/shared/cards.ts'
import { commandOf } from '../../../src/shared/keymap.ts'
import { pressing } from '../../../src/shared/press.ts'
import type { Lines } from '../../../src/shared/subjects.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { anchorWhere, linesAnchor } from './anchors.ts'
import { noteCallOf, threadCheckout } from './panel.ts'

/**
 * `reviews/composer`: a note on lines picked in a worker's Changes, added to the review thread of its checkout under
 * the lines, signed with the user's name. Once it is added, or cancelled, the view says it is `done` (a bubbling event
 * on its host), and whoever holds the pick lets it go.
 */

const ID = 'reviews/composer'

const CSS = `:where([data-view="${ID}"]) {
  & .note-box { margin: var(--sp-s) var(--sp-l) var(--sp-l); padding: var(--sp-m) var(--sp-l); border: 1px solid var(--accent); border-radius: var(--radius); background: var(--panel); font: var(--fs-m)/1.4 var(--ui); white-space: normal; }
  & .where { display: flex; align-items: center; gap: var(--sp-s); margin-bottom: var(--sp-s); color: var(--muted); font-size: var(--fs-s); }
  & code { font: var(--fs-s) var(--mono); color: var(--ink); }
  & textarea { display: block; width: 100%; min-height: 72px; resize: vertical; padding: var(--sp-s) var(--sp-m);
    border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-m)/1.45 var(--ui); }
  & textarea::placeholder { color: var(--faint); }
  & .actions { display: flex; align-items: center; gap: var(--sp-s); margin-top: var(--sp-s); }
  & .actions .hint { margin-left: auto; color: var(--faint); font-size: var(--fs-xs); }
}`

/** The note being written on each worker's picked lines, by its id: this page's, kept while its lines are picked again. */
const drafts = new Map<string, string>()

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let lines = subject.value as Lines
  let key = subject.key
  const cardOf = () => board.floors.flatMap((f) => f.cards).find((c) => c.id === lines.card) as Card
  host.innerHTML = `<style>${CSS}</style><div class="note-box">
    <div class="where"></div>
    <textarea data-note-text placeholder="a note on these lines (⌘⏎ adds it, Esc cancels)"></textarea>
    <div class="actions"><button class="primary" data-note-add>Add note</button><button data-note-cancel>Cancel</button><span class="hint">drag across line numbers or ⇧-click one to extend, within a hunk</span></div>
  </div>`
  const where = host.querySelector<HTMLElement>('.where')!
  const text = host.querySelector<HTMLTextAreaElement>('[data-note-text]')!
  const add = host.querySelector<HTMLElement>('[data-note-add]')!
  text.value = drafts.get(lines.card) ?? ''

  /** The lines as the note will anchor them, and the thread it goes on; the box takes focus, as a fresh pick does. */
  function draw() {
    where.innerHTML = `<code>${esc(anchorWhere(lines))}</code><span>on the thread of <b>${esc(threadCheckout(cardOf()))}</b>, as ${esc(board.user.name)}</span>`
    text.focus()
  }

  const done = () => host.dispatchEvent(new Event('done', { bubbles: true }))
  const cancel = () => (drafts.delete(lines.card), done())

  async function addNote() {
    const card = cardOf()
    const reply = await pressing(add, async () => {
      const call = noteCallOf(card)
      if (!call) throw new Error(noLongerOffered(card.callsign, 'note'))
      const [verb, input] = call
      return tower.call(verb as never, { ...input, author: board.user.name, anchors: [linesAnchor(lines)], body: text.value } as never) as Promise<Replies['review/append']>
    }).catch((err: Error) => void kit.toast(err.message))
    if (!reply) return
    kit.toast(`n${reply.n} is on the thread of ${threadCheckout(card)}`)
    drafts.delete(lines.card)
    done()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-note-add]')) return void addNote()
    if (target.closest('[data-note-cancel]')) cancel()
  })
  text.addEventListener('input', () => drafts.set(lines.card, text.value))
  text.addEventListener('keydown', (e) => {
    const id = commandOf(board.keys, e, 'field')
    if (id === 'submit') return (e.preventDefault(), void addNote())
    if (id === 'cancel-pick') (e.preventDefault(), cancel())
  })

  draw()

  return {
    update(next, now) {
      board = next
      lines = now.value as Lines
      if (now.key !== key) (key = now.key), draw()
    },
    close() {},
  }
}
