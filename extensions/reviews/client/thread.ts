import type { Card, Floor } from '../../../src/bridge/board.ts'
import type { Replies, Verbs } from '../../../src/shared/api.ts'
import { noLongerOffered, offeredCall, plural, runVerb, sendTarget } from '../../../src/shared/cards.ts'
import { commandOf } from '../../../src/shared/keymap.ts'
import { loop, timers } from '../../../src/shared/loop.ts'
import { anchorOf, changesHandlers, type ChangesEvent, changesOf, changesPath, drawPanel, fileCall, noChanges, readChanges } from '../../../src/shared/panels.ts'
import { panelsCss } from '../../../src/shared/panels-css.ts'
import { pressing } from '../../../src/shared/press.ts'
import { heldHandlers, noReads, reading } from '../../../src/shared/reads.ts'
import { linesSubject } from '../../../src/shared/subjects.ts'
import type { Mount, Tab } from '../../../src/shared/views.ts'
import type { NoteCall } from '../threads.ts'
import { cardReviews, cardThread, floorThreadsOf, heldThread, noteCallOf, readThread, resolveAction, reviewsHtml, threadCheckout, threadFailure, threadViewOf, threadWant } from './panel.ts'
import { THE_USER, sendText, unseenBy, type ReviewThread } from './reviews.ts'

/**
 * `reviews/thread`: a worker's checkout's review thread in its tabs, read once per version of its file, its notes'
 * quotes marked as the worker's Changes against its default branch find them; a note written, answered and resolved
 * by the user, the notes sent to a worker, and a note's lines shown (`display` of a `lines` subject).
 */

const ID = 'reviews/thread'

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > .reviews { position: absolute; inset: 0; overflow: auto; padding: 0 var(--sp-xl) 48px; background: var(--panel); color: var(--ink); scrollbar-gutter: stable; }
}`

/** The note being written on each checkout, by `<project>/<checkout>`, and the worker picked to send its notes to: this page's. */
const noteDrafts = new Map<string, string>()
const sendPicks = new Map<string, string>()

const draftKey = (c: Card) => `${c.project}/${threadCheckout(c)}`

/** A worker has a Reviews tab where reviews is on: its tally what it hasn't seen of the thread, else how many notes it holds. */
export const tab: Tab = (board, subject) => {
  const c = subject.value as Card
  const part = cardReviews(c)
  if (!part) return undefined
  const f = board.floors.find((f) => f.id === c.project) as Floor
  const notes = floorThreadsOf(f).find((t) => t.checkout === threadCheckout(c))?.messages
  const hint = `the review thread of checkout ${threadCheckout(c)}: notes from you, its workers and reviewers`
  return part.unseen ? { text: `${part.unseen} new`, tip: `${plural(part.unseen, 'note')} ${c.callsign} hasn't seen`, tone: 'unseen', hint } : notes ? { text: String(notes), hint } : { hint }
}

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let card = subject.value as Card
  let seen = true
  /** The note the composer answers. */
  let re: number | undefined
  host.innerHTML = `<style>${CSS}${panelsCss}</style><div class="reviews"></div>`
  const el = host.querySelector<HTMLElement>('.reviews')!

  const threadReads = loop({
    state: noReads<ReviewThread>(),
    handlers: heldHandlers<ReviewThread>(),
    execute: { read: reading(readThread((path) => tower.text(path))), draw: () => draw(), toast: ({ message }) => kit.toast(message) },
  })

  /** The worker's Changes against its default branch, read while the thread is seen: where its notes' quotes stand now. */
  const changeReads = loop({
    state: noChanges(),
    handlers: changesHandlers,
    execute: {
      ...timers<ChangesEvent>(),
      read: reading(
        readChanges({
          repos: (id, scope) => tower.get(changesPath(id, scope) as 'changes/<id>'),
          viewed: (key) => tower.store.get(key) as Promise<Record<string, string> | undefined>,
          now: Date.now,
        }),
      ),
      draw: () => draw(),
      toast: () => {},
      keep: () => {},
    },
  })

  const threadOf = () => heldThread(threadReads.state(), board.floors, cardThread(card))
  const picked = () => sendPicks.get(draftKey(card))

  function follow() {
    changeReads.dispatch({ type: 'follow', card: seen ? card : undefined })
    const want = seen && threadWant(board.floors, cardThread(card))
    if (want) threadReads.dispatch(want)
  }

  function draw() {
    const thread = threadOf()
    const view = threadViewOf(board, cardThread(card), {
      thread, failed: thread ? undefined : threadFailure(threadReads.state(), cardThread(card)), changes: changesOf(changeReads.state(), card.id)?.repos, picked: picked(), re,
    })
    drawPanel(el, reviewsHtml(view), { 'note-text': noteDrafts.get(draftKey(card)) ?? '' })
  }

  const note = ([verb, input]: NoteCall, fields: Partial<Verbs['review/append']>) => tower.call(verb as never, { ...input, ...fields } as never) as Promise<Replies['review/append']>
  const told = <T,>(request: Promise<T>) => request.catch((err: Error) => void kit.toast(err.message))

  async function addWritten(button: HTMLElement) {
    const reply = await told(
      pressing(button, async () => {
        const call = noteCallOf(card)
        if (!call) throw new Error(noLongerOffered(card.callsign, 'note'))
        return note(call, { author: board.user.name, re, body: noteDrafts.get(draftKey(card)) ?? '' })
      }),
    )
    if (!reply) return
    kit.toast(`n${reply.n} is on the thread of ${threadCheckout(card)}`)
    noteDrafts.delete(draftKey(card))
    re = undefined
    draw()
  }

  async function resolveNote(button: HTMLElement, n: number) {
    const reply = await told(pressing(button, () => runVerb(resolveAction({ project: card.project, checkout: threadCheckout(card), user: board.user.name }, n))))
    if (reply) kit.toast(`n${n} is resolved on the thread of ${threadCheckout(card)}`)
  }

  /** Send reaches a worker whenever it is drawn. */
  function sendNotes(button: HTMLElement) {
    const f = board.floors.find((f) => f.id === card.project) as Floor
    const target = sendTarget(f, threadCheckout(card), picked()) as Card
    const thread = threadOf()
    const text = sendText(THE_USER, threadCheckout(card), thread ? unseenBy(thread, target.callsign).map((m) => m.n) : [], target.hiredBy?.callsign)
    void told(pressing(button, async () => tower.run(offeredCall(target, 'submit', target.callsign), { text }))).then((r) => r && kit.toast(`Sent ${target.callsign} to the thread of ${threadCheckout(card)}`))
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    const add = target.closest<HTMLElement>('[data-note-add]')
    if (add) return void addWritten(add)
    const reply = target.closest<HTMLElement>('[data-reply]')?.dataset.reply
    if (reply) return ((re = Number(reply)), draw(), el.querySelector<HTMLElement>('[data-note-text]')?.focus())
    if (target.closest('[data-reply-clear]')) return ((re = undefined), draw())
    const resolve = target.closest<HTMLElement>('[data-resolve]')
    if (resolve) return void resolveNote(resolve, Number(resolve.dataset.resolve))
    const toNote = target.closest<HTMLElement>('[data-to-note]')?.dataset.toNote
    if (toNote) return el.querySelector(`[data-note="${toNote}"]`)?.scrollIntoView({ block: 'center' })
    const anchored = target.closest<HTMLElement>('[data-anchor]')?.dataset.anchor
    const anchor = anchored && threadOf() ? anchorOf(threadOf()!, anchored) : undefined
    if (anchor) {
      const { repo, path, from, to, quote } = anchor
      return kit.display(linesSubject({ card: card.id, project: card.project, repo, path, from, to, ...(quote && { quote }) }))
    }
    const send = target.closest<HTMLElement>('[data-send]')
    if (send) return sendNotes(send)
    const want = target.closest('[data-thread-read]') && threadWant(board.floors, cardThread(card))
    if (want) return (threadReads.dispatch({ ...want, type: 'refresh' }), draw())
    const copy = target.closest<HTMLElement>('[data-copy]')?.dataset.copy
    if (copy) void navigator.clipboard.writeText(copy).then(() => kit.toast(`Copied ${copy}`), (err: Error) => kit.toast(err.message))
  })

  host.addEventListener('change', (e) => {
    const picker = (e.target as Element).closest<HTMLSelectElement>('[data-send-pick]')
    if (!picker) return
    sendPicks.set(draftKey(card), picker.value)
    draw()
  })

  host.addEventListener('input', (e) => {
    const box = e.target as HTMLTextAreaElement
    if (box.matches('[data-note-text]')) noteDrafts.set(draftKey(card), box.value)
  })

  host.addEventListener('keydown', (e) => {
    const target = e.target as Element
    if (target.matches('[data-note-text]') && commandOf(board.keys, e, 'field') === 'submit') (e.preventDefault(), void addWritten(host.querySelector<HTMLElement>('[data-note-add]')!))
  })

  draw()
  follow()

  return {
    update(next, now) {
      board = next
      card = now.value as Card
      follow()
      draw()
    },
    visible(on) {
      seen = on
      follow()
    },
    close() {
      changeReads.dispatch({ type: 'follow', card: undefined })
    },
  }
}
