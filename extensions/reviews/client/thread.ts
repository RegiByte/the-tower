import { type Board, type Card, type Floor, type Subject, linesSubject, noLongerOffered, offeredCall, runVerb, sendTarget } from '/lib/board.js'
import { CHANGES_POLL_MS } from '/lib/changes.js'
import type { Replies, Verbs } from '/lib/extension.js'
import { commandOf } from '/lib/keys.js'
import { heldHandlers, loop, noReads, reading, valueOf } from '/lib/machine.js'
import { type Mount, type Tab, drawPanel, fileCall, panelsCss, pressing } from '/lib/view.js'
import { plural } from '/lib/words.js'
import { anchorOf } from './anchors.ts'
import type { FloorThread, NoteCall } from '../threads.ts'
import { type ThreadPlace, cardReviews, cardThread, floorThread, floorThreadsOf, heldThread, readThread, resolveAction, reviewsHtml, threadCheckout, threadFailure, threadViewAt, threadWant } from './panel.ts'
import { THE_USER, sendText, unseenBy, type AnchorStates, type ReviewThread } from './reviews.ts'

/**
 * `reviews/thread`: a worker's checkout's review thread in its tabs; `reviews/checkout-thread`: a checkout's thread
 * where no worker's view is, read as the worker on duty there. Each is read once per version of its file, its notes'
 * quotes marked as they stand among its reader's changes against its default branch (`anchors/<project>`); a note
 * written, answered and resolved by the user, the notes sent to a worker, and a note's lines shown (`display` of a
 * `lines` subject) while a worker reads it.
 */

const CSS = `:where([data-view="reviews/thread"], [data-view="reviews/checkout-thread"]) {
  position: absolute; inset: 0;
  & > .reviews { position: absolute; inset: 0; overflow: auto; padding: 0 var(--sp-xl) 48px; background: var(--panel); color: var(--ink); scrollbar-gutter: stable; }
}`

/**
 * The note being written on each checkout, by `<project>/<checkout>`, and the worker picked to send its notes to: this
 * page's, shared by every view of the same thread.
 */
const noteDrafts = new Map<string, string>()
const sendPicks = new Map<string, string>()

const draftKey = (at: ThreadPlace) => `${at.project}/${at.checkout}`

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

/** A thread's view on the subject it is mounted on, its place read from the board and the subject as they are now. */
const threadMount = (placeOf: (board: Board, subject: Subject) => ThreadPlace): Mount => (host, { tower, board: first, subject: firstSubject, kit }) => {
  let board = first
  let subject = firstSubject
  const place = () => placeOf(board, subject)
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

  /**
   * Where the thread's anchors stand among the worker's changes, read while the thread is seen: again as its file or
   * the worker's turn moves on, and every `CHANGES_POLL_MS`, as the worker's Changes are.
   */
  const stateReads = loop({
    state: noReads<AnchorStates>(),
    handlers: heldHandlers<AnchorStates>(),
    execute: {
      read: reading((slot) => tower.get(`reviews/anchors/${place().project}?card=${encodeURIComponent(slot)}` as never).then((r) => (r as { states: AnchorStates }).states)),
      draw: () => draw(),
      toast: () => {},
    },
  })
  const statesKey = (reader: Card) => `${threadWant(board.floors, place())?.key ?? ''}|${reader.status === 'working' ? 'working' : 'still'}`
  let poll: ReturnType<typeof setInterval> | undefined

  const threadOf = () => heldThread(threadReads.state(), board.floors, place())
  const picked = () => sendPicks.get(draftKey(place()))

  /** The thread read while it is seen, and where its anchors stand while it is seen and a worker reads it. */
  function follow() {
    const reader = seen ? place().reader : undefined
    if (reader) stateReads.dispatch({ type: 'want', slot: reader.id, key: statesKey(reader) })
    if (reader && !poll) poll = setInterval(() => {
      const now = place().reader
      if (now) stateReads.dispatch({ type: 'refresh', slot: now.id, key: statesKey(now) })
    }, CHANGES_POLL_MS)
    if (!reader) (clearInterval(poll), (poll = undefined))
    const want = seen && threadWant(board.floors, place())
    if (want) threadReads.dispatch(want)
  }

  function draw() {
    const at = place()
    const thread = threadOf()
    const view = threadViewAt(board, at, {
      thread, failed: thread ? undefined : threadFailure(threadReads.state(), at), states: at.reader && valueOf(stateReads.state().held[at.reader.id]), picked: picked(), re,
    })
    drawPanel(el, reviewsHtml(view), { 'note-text': noteDrafts.get(draftKey(at)) ?? '' })
  }

  const note = ([verb, input]: NoteCall, fields: Partial<Verbs['review/append']>) => tower.call(verb as never, { ...input, ...fields } as never) as Promise<Replies['review/append']>
  const told = <T,>(request: Promise<T>) => request.catch((err: Error) => void kit.toast(err.message))

  async function addWritten(button: HTMLElement) {
    const at = place()
    const reply = await told(
      pressing(button, async () => {
        if (!at.note) throw new Error(noLongerOffered(`the thread of ${at.checkout}`, 'note'))
        return note(at.note, { author: board.user.name, re, body: noteDrafts.get(draftKey(at)) ?? '' })
      }),
    )
    if (!reply) return
    kit.toast(`n${reply.n} is on the thread of ${at.checkout}`)
    noteDrafts.delete(draftKey(at))
    re = undefined
    draw()
  }

  async function resolveNote(button: HTMLElement, n: number) {
    const at = place()
    const reply = await told(pressing(button, () => runVerb(resolveAction({ project: at.project, checkout: at.checkout, user: board.user.name }, n))))
    if (reply) kit.toast(`n${n} is resolved on the thread of ${at.checkout}`)
  }

  /** Send is drawn enabled only while it reaches a worker. */
  function sendNotes(button: HTMLElement) {
    const at = place()
    const f = board.floors.find((f) => f.id === at.project) as Floor
    const target = sendTarget(f, at.checkout, picked())
    if (!target) return kit.toast(`Pick a worker to send the notes on ${at.checkout} to`)
    const thread = threadOf()
    const text = sendText(THE_USER, at.checkout, thread ? unseenBy(thread, target.callsign).map((m) => m.n) : [], target.hiredBy?.callsign)
    void told(pressing(button, async () => tower.run(offeredCall(target, 'submit', target.callsign), { text }))).then((r) => r && kit.toast(`Sent ${target.callsign} to the thread of ${at.checkout}`))
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
      const { project, checkout, reader } = place()
      if (!reader) return kit.toast(`Nobody works in ${checkout} now, so its Changes aren't read`)
      const { repo, path, from, to, quote } = anchor
      return kit.display(linesSubject({ card: reader.id, project, repo, path, from, to, ...(quote && { quote }) }))
    }
    const send = target.closest<HTMLElement>('[data-send]')
    if (send) return sendNotes(send)
    const want = target.closest('[data-thread-read]') && threadWant(board.floors, place())
    if (want) return (threadReads.dispatch({ ...want, type: 'refresh' }), draw())
    const copy = target.closest<HTMLElement>('[data-copy]')?.dataset.copy
    if (copy) void navigator.clipboard.writeText(copy).then(() => kit.toast(`Copied ${copy}`), (err: Error) => kit.toast(err.message))
  })

  host.addEventListener('change', (e) => {
    const picker = (e.target as Element).closest<HTMLSelectElement>('[data-send-pick]')
    if (!picker) return
    sendPicks.set(draftKey(place()), picker.value)
    draw()
  })

  host.addEventListener('input', (e) => {
    const box = e.target as HTMLTextAreaElement
    if (box.matches('[data-note-text]')) noteDrafts.set(draftKey(place()), box.value)
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
      subject = now
      follow()
      draw()
    },
    visible(on) {
      seen = on
      follow()
    },
    close() {
      clearInterval(poll)
    },
  }
}

export const mount: Mount = threadMount((_, subject) => cardThread(subject.value as Card))

/** `reviews/checkout-thread`, on a `reviews.thread` subject: a floor's thread, read as the worker on duty in its checkout. */
export const mountThread: Mount = threadMount((board, subject) => floorThread(board.floors.find((f) => f.id === subject.project) as Floor, subject.value as FloorThread))
