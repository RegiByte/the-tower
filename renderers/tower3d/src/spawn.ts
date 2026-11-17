import type { Draft, DraftIo } from '../../../extensions/drafts/client/drafts.ts'
import type { Call } from '/lib/extension.js'
import { type Held } from './acts.ts'
import { wireSpawn } from '/lib/spawn.js'
import { hiringHandlers, noHires } from './hiring.ts'
import type { Tower } from './api.ts'
import { type SpawnForm, spawnCall, spawnDefaults } from './cards.ts'
import { loop } from '/lib/machine.js'
import { floorSignHtml } from './ui.ts'
import type { Titles } from './titles.ts'
import { s } from './state.ts'
import type { Toasts } from './toasts.ts'
import type { Events } from './events.ts'
import { $ } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Clients } from './clients.ts'
import type { Port } from './port.ts'

/** What the hires are started with. */
export type SpawnDeps = { tower: Tower; clients: Clients; titles: Titles; port: Port; toasts: Toasts; events: Events; world: World }

export type Spawn = ReturnType<typeof startSpawn>

/**
 * Hiring: the new-worker dialog, a modal over whatever panel is open (`spawning`), the hires in flight (`hiring`), and
 * the carried note handed to a session or hired on.
 */
export function startSpawn(started: SpawnDeps) {
  const { tower } = started
  const { discardItem, draftItem, draftsOf, keepUnsent, openDraft, readDraft, titleOf } = started.clients
  const { port } = started
  const { toast, offered } = started.toasts
  const { events } = started
  const { syncStations, planNow, floorOf, drop } = started.world
  const { noteText } = started.titles
  const { boardNow, unlock } = nowOf(port)

  /** The drafts collection over the renderer API. */
  const draftIo: DraftIo = { call: tower.call, read: noteText, failed: (err) => toast(err.message) }

  /** The floor the dialog's Start waits on, if it does. */
  const dialogStarting = () => {
    const d = spawning.state()
    return d.t === 'starting' ? d.project : undefined
  }

  /** A worker with `form` on a floor, on the carried note `on` if given (`hiring`). */
  const hireWith = (project: string, form: SpawnForm, on: Held | undefined) =>
    hiring.dispatch({ type: 'hire', project, name: floorOf(project).name, form, on, starting: dialogStarting() })

  /** A worker where the floor starts one unless told, its own worktree or the hub: you sit down at it once its desk shows. */
  const hire = (project: string) => hireWith(project, spawnDefaults(floorOf(project)), undefined)

  /** The editor's last save, which a note's text is read after. */
  const saving = { last: Promise.resolve(true) }

  /** The carried note's text as it is on disk now, `undefined` when it can't be sent: a note that can't be read stays in hand. */
  async function carriedText() {
    const note = s.carrying!
    await saving.last
    const text = await readDraft(draftIo, note.project, note.id).catch((err: Error) => (toast(err.message), null))
    if (text === null) return undefined
    if (text === undefined) return (toast('The draft in your hand is gone'), drop(), undefined)
    if (!text.trim()) return (toast('The draft is empty'), undefined)
    return text
  }

  /** After a draft's words reached a session: it is deleted, and out of your hand if you held it. */
  async function sent(note: Held) {
    await discardItem(draftIo, note.project, note.id)
    if (s.carrying?.project === note.project && s.carrying.id === note.id) drop()
  }

  /** The carried note on its way to a session: pressing again meanwhile sends nothing. */
  let handing = false

  /** Sends the carried note with `send`, then deletes its draft: a failed send keeps it in your hand. */
  async function sendCarried(send: (text: string) => Promise<boolean>) {
    if (handing || hiredOn(s.carrying!)) return
    handing = true
    try {
      const note = s.carrying!
      const text = await carriedText()
      if (text !== undefined && (await send(text))) await sent(note)
    } finally {
      handing = false
    }
  }

  const handOver = (c: Call<'submit'>) => sendCarried(async (text) => (await offered(c, { text }))?.t === 'ok')

  /** A worker hired on the carried note goes to work on it alone: you stay where you are, and the note leaves your hand once it started. */
  async function hireOnNote(project: string) {
    const note = s.carrying!
    if (hiredOn(note)) return toast(HIRED_ON_NOTE)
    if (handing) return
    const prompt = await carriedText()
    if (prompt !== undefined) hireWith(project, spawnDefaults(floorOf(project), prompt), note)
  }

  const HIRED_ON_NOTE = 'A worker is being hired on the draft in your hand'

  /** Whether a hire waiting on the tower was made on `note`: it can't be sent anywhere else meanwhile. */
  const hiredOn = (note: Held) => Object.values(hiring.state()).some((h) => h.t === 'spawning' && h.on?.project === note.project && h.on.id === note.id)

  const spawn = $('spawn') as HTMLDialogElement

  /** The new-worker dialog (`wireSpawn`), opened on a floor or on a draft: a prompt it closes on is kept in that draft, read again from disk, which is deleted once a worker starts on it. */
  const spawning = wireSpawn<Held, DraftIo, Draft>(spawn, {
    board: () => boardNow()!,
    run: async (call, body) => {
      const reply = await tower.run(call, body)
      const project = call[1].project!
      hiring.dispatch({ type: 'arriving', project, name: floorOf(project).name, id: reply.id })
      hiring.dispatch({ type: 'board', board: boardNow()! })
      return reply
    },
    sign: (f) => floorSignHtml(planNow(), f.id),
    drafts: { draftsOf, keepUnsent, titleOf },
    draftIo,
    held: async (note) => {
      const item = draftItem(boardNow()!.floors, note.project, note.id)
      return item && openDraft(draftIo, note.project, item).catch((err: Error) => (toast(err.message), undefined))
    },
    kept: () => {},
    shown: unlock,
    started: (id, note) => {
      port.dispatch({ type: 'pend', pending: { desk: id } })
      if (note) void sent(note)
    },
    toast,
    upload: (name, data) => tower.call('upload', { name, data }).then((r) => r.path),
  })

  spawning.subscribe(events.listen('spawning'))

  function openSpawn(project: string, draft?: { note: Held; text: string }) {
    hiring.dispatch({ type: 'open', project, name: floorOf(project).name, on: draft?.note, text: draft?.text ?? '' })
  }

  /** The hires in flight, one per floor (`hiring.ts`): the open workstation of a floor hiring reads so until the new worker's desk shows. */
  const hiring = loop({
    state: noHires<Held>(),
    handlers: hiringHandlers<Held>(),
    execute: {
      run: ({ project, form }, dispatch) =>
        void Promise.resolve().then(() => tower.run(...spawnCall(floorOf(project), form))).then(
          (reply) => dispatch({ type: 'replied', project, reply }),
          (err: Error) => dispatch({ type: 'failed', project, message: err.message }),
        ),
      started: ({ id, on }, dispatch) => {
        if (on) void sent(on)
        else port.dispatch({ type: 'pend', pending: { desk: id } })
        dispatch({ type: 'board', board: boardNow()! })
      },
      open: ({ project, on, text }) => spawning.dispatch({ type: 'open', project, on, text }),
      toast: ({ text }) => toast(text),
      draw: () => boardNow() && syncStations(hiring.state()),
    },
  })

  hiring.subscribe(events.listen('hiring'))

  async function openSpawnOnNote(project: string, note: Held) {
    if (hiredOn(note)) return toast(HIRED_ON_NOTE)
    const text = await carriedText()
    if (text !== undefined) openSpawn(project, { note, text })
  }

  return { draftIo, hire, saving, handOver, hireOnNote, spawn, openSpawn, hiring, openSpawnOnNote }
}
