import type { Board, Card, Floor, FloorCollection } from '../../../src/bridge/board.ts'
import { can, esc, gistOf, HOST_MEANS, offeredCall, statusName, whyNot } from '../../../src/shared/cards.ts'
import { fileButtonsHtml, fileCall } from '../../../src/shared/file-acts.ts'
import { GIST_ICON } from '../../../src/shared/icons.ts'
import { commandOf, keysHint, keyshortcuts } from '../../../src/shared/keymap.ts'
import { itemSubject } from '../../../src/shared/subjects.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { ICON } from '../../../src/shared/icons.ts'
import {
  AUTOSAVE_MS, DRAFT_STATE, DRAFTS, discard, draftItem, draftPath, draftsOf, draftState, edit, follow, keepsApart, leave, newDraft, openDraft, restore, save, sendable, settle, titleOf,
  type Draft, type DraftIo,
} from './drafts.ts'

/**
 * `drafts/editor`, the drafts extension's view: a draft open for editing, on its item, or on the drafts collection for
 * a new one, which takes its item once its first save is on the board. Its text is saved as it is typed and followed
 * as the board changes it; it starts a worker through the renderer's new-worker form (`spawn`), is typed into a
 * running worker, or is deleted with an undo.
 */

const ID = 'drafts/editor'

const STYLE = `:where([data-view="${ID}"]) {
  gap: var(--sp-m);
  & .shelf-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-l); padding: var(--sp-m) var(--sp-xl); background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); box-shadow: var(--shadow); white-space: nowrap; }
  & .shelf-head .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font: 800 var(--fs-xl)/1 var(--display); text-transform: uppercase; letter-spacing: .06em;
    color: color-mix(in oklab, var(--p, var(--ink)) var(--p-text-mix), var(--ink)); }
  & .shelf-head .dim { color: var(--faint); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; }
  & .shelf-head .tag { flex: none; padding: var(--sp-2xs) var(--sp-m); border: none; border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-s)/1.3 var(--mono); cursor: copy; }
  & .shelf-head .actions { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--sp-s) var(--sp-l); font-size: var(--fs-m); }
  & .shelf-head .by { padding: 0; border: 0; background: none; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
  & .draft-note { display: flex; align-items: center; gap: var(--sp-l); padding: var(--sp-m) var(--sp-l) var(--sp-m) var(--sp-xl); border-radius: var(--radius);
    background: color-mix(in oklab, var(--broken) 11%, var(--panel)); border: 1px solid var(--broken); }
  & .draft-note:empty { display: none; }
  & .draft-note span { margin-right: auto; }
  & textarea { flex: 1; min-height: 0; resize: none; padding: var(--sp-xl); font: var(--fs-l)/1.55 var(--mono); font-variant-ligatures: none; color: var(--ink); background: var(--panel);
    border: 1px solid var(--line-strong); border-radius: var(--radius); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  & textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .targets { display: grid; gap: var(--sp-s); max-height: 60vh; overflow-y: auto; scrollbar-gutter: stable; }
  & .targets button { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-m) var(--sp-l); text-align: left; font-weight: 400; border-left: 4px solid var(--p, var(--deco)); }
  & .targets .call { font: 800 var(--fs-m)/1 var(--display); letter-spacing: .04em; }
  & .targets .where { color: var(--muted); font-size: var(--fs-s); white-space: nowrap; }
  & .targets .line { flex: 1; min-width: 0; color: var(--muted); font-size: var(--fs-s); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  & .targets .said { color: var(--faint); }
}`

/** A worker's gist as html: a tool's name in bold, said words after their mark. */
const lineOf = (c: Card) => {
  const gist = gistOf(c)
  if (!gist) return '<i>no prompt yet</i>'
  if (gist.kind === 'asks' || gist.kind === 'runs') {
    const [name, ...target] = gist.text.split(' ')
    return `<span class="tool"><b>${esc(name)}</b> ${esc(target.join(' '))}</span>`
  }
  return `<span class="said">${GIST_ICON[gist.kind]}</span> ${esc(gist.text)}`
}

const closeHtml = (keys: Board['keys']) => {
  const what = 'back to the skyline'
  const hint = keysHint(keys, 'home')
  const tip = hint ? `data-tip="${esc(`${what} (${hint})`)}" aria-keyshortcuts="${keyshortcuts(keys, 'home')}"` : `data-tip="${esc(what)}"`
  return `<button class="icon-btn" data-home aria-label="${what}" ${tip}>${ICON.close}</button>`
}

export const mount: Mount = async (host, { tower, board: first, subject, kit }) => {
  let board = first
  let lost = false
  const project = subject.project!
  const io: DraftIo = { call: tower.call, read: (project, id) => tower.text(draftPath(project, id)), failed: (err) => kit.toast(err.message) }
  const floor = () => board.floors.find((f) => f.id === project) as Floor
  /** The draft open; `done` once it was sent or deleted, when closing keeps nothing. */
  let d: Draft = newDraft(project)
  let done = false
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The keys of the item the view is on once its first save is on the board, and of the subject it was mounted on. */
  let mountedOn = subject.key

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="draft-note"></div>
    <textarea spellcheck="false" placeholder="a prompt for later: the first line names it"></textarea>
    <dialog class="sheet" aria-label="Send to a worker"><form method="dialog"><header><h2>SEND TO A WORKER</h2></header><div class="targets"></div>
    <div class="actions"><small>the draft is typed into the worker's prompt and submitted</small><button value="">Cancel</button></div></form></dialog>`
  const head = host.querySelector<HTMLElement>('.shelf-head')!
  const note = host.querySelector<HTMLElement>('.draft-note')!
  const text = host.querySelector('textarea')!
  const transfer = host.querySelector('dialog')!
  let region: ReturnType<typeof kit.region> | undefined

  const item = () => (d.id === undefined ? undefined : draftItem(board.floors, project, d.id))
  const targets = () => board.floors.flatMap((f) => f.cards).filter((c) => can(c, 'submit'))
  const heldWhy = () => (lost ? HOST_MEANS.unknown : whyNot(board, 'spawn'))

  /** The head: an item is listed in its floor's drafts, with what extensions add to it. */
  const drawHead = () => {
    const f = floor()
    const it = item()
    const dir = (draftsOf(f) as FloorCollection).dir
    const by = it?.keptBy ? ` · kept by <button class="by" data-card="${esc(it.keptBy.session)}" data-tip="go to the worker that kept it">${esc(it.keptBy.callsign)}</button>` : ''
    const tag = it ? `<button class="tag" data-copy="${esc(it.tag)}" data-tip="${esc(`${dir}/${it.id}`)} · click to copy the tag">${esc(it.tag)}</button>${fileButtonsHtml(`${dir}/${it.id}`)}` : ''
    const held = heldWhy()
    const start = held
      ? `<button class="held primary" aria-disabled="true" aria-label="Start session" data-tip="${esc(held)}">Start session</button>`
      : can(f, 'spawn') ? '<button class="primary" data-draft-act="send" data-tip="start a new session on this prompt">Start session</button>' : ''
    region?.close()
    head.innerHTML = `<span class="label">Draft</span>${tag}<span class="dim">${esc(f.name)} · ${DRAFT_STATE[draftState(d)]}${by}</span>
    <span class="actions"><span class="adds"></span><small class="dim">⌘⏎ new session</small>
      ${start}
      ${targets().length ? '<button data-draft-act="transfer" data-tip="type this prompt into a running worker">Send to worker…</button>' : ''}
      <button class="danger" data-draft-act="delete">Delete</button>
      ${closeHtml(board.keys)}</span>`
    const adds = head.querySelector<HTMLElement>('.adds')!
    region = it ? kit.region(adds, 'item.head', itemSubject(project, DRAFTS, it)) : undefined
    if (!it) adds.remove()
    else adds.style.display = 'contents'
    note.innerHTML = d.conflict !== undefined
      ? `<span>Someone else changed this draft while you were editing it.</span>
      <button data-draft-act="reload">Take theirs</button><button data-draft-act="keep">Keep mine</button>`
      : ''
  }

  const hold = () => clearTimeout(timer)

  /** Resolves to whether the draft's text is on disk; a first save gives it an id, which its item then takes. */
  const saveNow = () => {
    hold()
    return save(io, d).then((ok) => (drawHead(), ok))
  }

  /** The draft saved for sending, held from autosave: `undefined` when it is empty or not on disk. */
  const saved = async () => {
    if (!d.text.trim()) return void kit.toast('The draft is empty')
    hold()
    const sent = await sendable(io, d)
    if (sent === undefined) return void (d.conflict !== undefined && kit.toast('Settle the change made on disk first'))
    return sent
  }

  /** The item the board carries for the draft, once a board does. */
  let waiting: (() => void) | undefined
  const onBoard = async () => {
    while (!item() && !closed) await new Promise<void>((resolve) => (waiting = resolve))
    return item()
  }

  const send = async () => {
    if (!can(floor(), 'spawn') || (await saved()) === undefined) return
    const it = await onBoard()
    if (it) void kit.run('spawn', itemSubject(project, DRAFTS, it))
  }

  const openTransfer = () => {
    const order = [...board.floors].reverse().map((f) => f.id)
    const rank = (c: Card) => (c.project === project ? -1 : order.indexOf(c.project))
    const floorOf = (id: string) => board.floors.find((f) => f.id === id)!
    transfer.querySelector('.targets')!.innerHTML = targets()
      .sort((a, b) => rank(a) - rank(b) || a.startedAt - b.startedAt)
      .map((c) => `<button value="${c.id}" style="${floorOf(c.project).color ? `--p:${esc(floorOf(c.project).color!)}` : ''}">
      <span class="call">${esc(c.callsign)}</span><span class="where">${esc(floorOf(c.project).name)} · ${statusName(c)}</span>
      <span class="line">${lineOf(c)}</span></button>`)
      .join('')
    transfer.returnValue = ''
    transfer.showModal()
    transfer.querySelector<HTMLElement>('.targets button')?.focus()
  }

  transfer.addEventListener('close', async () => {
    const id = transfer.returnValue
    if (!id) return
    const sent = await saved()
    const card = board.floors.flatMap((f) => f.cards).find((c) => c.id === id)
    if (sent === undefined || !card) return
    const reply = await tower.run(offeredCall(card, 'submit', card.callsign), { text: sent }).catch((err: Error) => void kit.toast(err.message))
    if (!reply) return
    done = true
    await discard(io, d)
    kit.display(`card:${id}`)
  })

  /** Deleting is the user's, and done at once: what was typed is saved first, and the toast's Undo puts the file back, under its id. */
  const remove = async () => {
    done = true
    hold()
    kit.display('board')
    void save(io, d)
    const gone = await discard(io, d)
    if (gone) kit.toast(`Deleted "${titleOf(gone.text)}" from Drafts`, { label: 'Undo', run: () => void undo(gone) })
  }
  const undo = (gone: NonNullable<Awaited<ReturnType<typeof discard>>>) =>
    restore(io, gone).then(() => kit.toast(`"${titleOf(gone.text)}" is back in Drafts`), (err: Error) => kit.toast(err.message))

  text.addEventListener('input', () => {
    edit(d, text.value)
    hold()
    timer = setTimeout(() => void saveNow(), AUTOSAVE_MS)
    drawHead()
  })
  text.addEventListener('keydown', (e) => {
    const id = commandOf(board.keys, e, 'field')
    if (id === 'save-draft') (e.preventDefault(), void saveNow())
    if (id === 'submit') (e.preventDefault(), void send())
  })
  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (transfer.contains(target)) return
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    if (target.closest('[data-home]')) return kit.display('board')
    const copy = target.closest<HTMLElement>('[data-copy]')?.dataset.copy
    if (copy) return void navigator.clipboard.writeText(copy).then(() => kit.toast(`Copied ${copy}`), (err: Error) => kit.toast(err.message))
    const card = target.closest<HTMLElement>('[data-card]')?.dataset.card
    if (card) return kit.display(`card:${card}`)
    const act = target.closest<HTMLElement>('[data-draft-act]')?.dataset.draftAct
    if (act === 'send') return void send()
    if (act === 'transfer') return openTransfer()
    if (act === 'delete') return void remove()
    if (act === 'reload' || act === 'keep') {
      void settle(io, d, act === 'reload').then(() => !closed && drawHead())
      if (act === 'reload') text.value = d.text
      drawHead()
    }
  })

  /** The board shows the draft as it is now: deleted elsewhere closes it, a change elsewhere replaces or conflicts. */
  const followBoard = async () => {
    if (!d.id || done) return
    const outcome = await follow(io, d, item())
    if (closed || done) return
    if (outcome === 'gone') return (done = true, kit.display('board'), kit.toast('The draft was deleted elsewhere'))
    if (outcome === 'replaced') text.value = d.text
    drawHead()
  }

  const offError = tower.onBoardError((err) => {
    lost = err.code === 'disconnected'
    drawHead()
  })

  if (subject.kind === `item.${DRAFTS}`) {
    text.readOnly = true
    drawHead()
    const it = draftItem(board.floors, project, (subject.value as { id: string }).id)
    const loaded = it && (await openDraft(io, project, it).catch((err: Error) => (kit.toast(err.message), null)))
    if (loaded === null) kit.display('board')
    else if (!loaded) (kit.display('board'), kit.toast('That draft is gone'))
    else {
      d = loaded
      text.value = d.text
      text.readOnly = false
    }
  }
  drawHead()
  text.focus()

  return {
    update(next) {
      board = next
      lost = false
      const it = item()
      if (it && mountedOn !== `item.${DRAFTS}:${project}/${it.id}`) {
        mountedOn = `item.${DRAFTS}:${project}/${it.id}`
        kit.display(itemSubject(project, DRAFTS, it), { view: ID })
      }
      waiting?.()
      void followBoard()
      drawHead()
    },
    show: (s) => s.key === mountedOn,
    close() {
      closed = true
      hold()
      waiting?.()
      region?.close()
      offError()
      transfer.close()
      if (done) return
      if (keepsApart(d)) kit.toast('Your edits were kept as a new draft')
      void leave(io, d)
    },
  }
}
