import type { Board, Floor } from '../bridge/board.ts'
import type { Call, Replies, Verbs } from './api.ts'
import { branchPlaceholder, callsignRefusal, cutLine, cutNameOf, formFields, spawnCall, spawnForm, spawnFormHtml, spawnSummaryHtml, type SpawnForm } from './cards.ts'
import { commandOf } from './keymap.ts'
import { tagOf } from './tags.ts'
import { loop, type Handlers, type Loop, type StateEffect } from './loop.ts'

/**
 * The new-worker dialog as a machine, every renderer's: `spawnHandlers` its steps, `wireSpawn` the dialog element it
 * runs in. A prompt it closes on without starting a worker is kept as a draft; one a worker started on never is. The
 * tower serves this module as `/spawn.js`.
 */

/**
 * The dialog: closed, filled in on a floor (`error`, why the last Start failed), or starting a worker while the tower
 * answers (`shown`: still open; a second Esc closes it whatever the page asks). `on`: the draft it was opened on, as
 * the renderer holds it.
 */
export type Spawning<D> =
  | { t: 'closed' }
  | { t: 'editing'; project: string; on: D | undefined; error: string }
  | { t: 'starting'; project: string; on: D | undefined; shown: boolean }

/** `cancel`: Cancel or Esc asked to close; `closed`: the dialog closed, with the prompt it held. */
export type SpawnEvent<D> =
  | { type: 'open'; project: string; on: D | undefined; text: string }
  | { type: 'start'; form: SpawnForm }
  | { type: 'cancel' }
  | { type: 'closed'; text: string }
  | { type: 'started'; reply: Replies['spawn'] }
  | { type: 'failed'; message: string }

/**
 * `show` draws the form on `project` with `text` as its prompt (`on`: the draft it was opened on, titled on the form) and
 * opens it; `draw` redraws Start's busy and the error line from the state; `run` starts a worker on `form`; `keep`
 * keeps `text` as a draft (`keepUnsent`); `started` hands the new worker to the renderer.
 */
export type SpawnEffect<D> =
  | StateEffect<Spawning<D>>
  | { type: 'show'; project: string; text: string; on: D | undefined }
  | { type: 'reshow' }
  | { type: 'draw' }
  | { type: 'close' }
  | { type: 'run'; project: string; form: SpawnForm }
  | { type: 'keep'; project: string; on: D | undefined; text: string }
  | { type: 'toast'; text: string }
  | { type: 'started'; id: string; on: D | undefined }

export const spawnClosed = <D>(): Spawning<D> => ({ t: 'closed' })

/** The dialog's steps. A dialog a second Esc closed while Start waits opens again as it was: when asked to open, or on the error of a start that failed. */
export const spawnHandlers = <D>(): Handlers<Spawning<D>, SpawnEvent<D>, SpawnEffect<D>> => ({
  open: (s, { project, on, text }) => {
    if (s.t === 'starting' && !s.shown) return [{ type: 'state', state: { ...s, shown: true } }, { type: 'reshow' }]
    return s.t === 'closed' ? [{ type: 'state', state: { t: 'editing', project, on, error: '' } }, { type: 'show', project, text, on }] : []
  },
  start: (s, { form }) =>
    s.t === 'editing' ? [{ type: 'state', state: { t: 'starting', project: s.project, on: s.on, shown: true } }, { type: 'draw' }, { type: 'run', project: s.project, form }] : [],
  cancel: (s) => (s.t === 'editing' ? [{ type: 'close' }] : []),
  closed: (s, { text }) => {
    if (s.t === 'editing') return [{ type: 'state', state: { t: 'closed' } }, { type: 'keep', project: s.project, on: s.on, text }]
    return s.t === 'starting' && s.shown ? [{ type: 'state', state: { ...s, shown: false } }] : []
  },
  started: (s, { reply }) => {
    if (s.t !== 'starting') return []
    return [{ type: 'state', state: { t: 'closed' } }, { type: 'draw' }, { type: 'close' }, ...(reply.cut ? [{ type: 'toast' as const, text: cutLine(reply.cut) }] : []), { type: 'started', id: reply.id, on: s.on }]
  },
  failed: (s, { message }) => {
    if (s.t !== 'starting') return []
    return [{ type: 'state', state: { t: 'editing', project: s.project, on: s.on, error: message } }, ...(s.shown ? [] : [{ type: 'reshow' as const }]), { type: 'draw' }]
  },
})

/** A draft as the form keeps a prompt in it: its id once it is saved, and its text. */
export type KeptDraft = { id?: string; text: string }

/**
 * The drafts client's functions the form keeps a prompt with, as the renderer imports them from the drafts extension
 * (`/x/drafts/drafts.js`), so the form runs whichever drafts provider the page runs: `draftsOf`, a floor's drafts while
 * the extension is on there; `keepUnsent`, a prompt kept in a draft over the renderer's `I`, its collection calls;
 * `titleOf`, a draft's title.
 */
export type SpawnDrafts<I, K extends KeptDraft> = {
  draftsOf(f: Floor): unknown
  keepUnsent(io: I, project: string, from: K | undefined, text: string): Promise<K | undefined>
  titleOf(text: string): string
}

/**
 * What the dialog needs of its renderer. `sign`: the floor's sign as the renderer draws it; `drafts` and `draftIo`: the
 * drafts client and its collection calls; `held`: the draft the form was opened on as the renderer holds it now, for
 * keeping a prompt in it; `kept`: a draft a prompt was kept in; `shown`: the dialog has just opened, before its prompt
 * takes focus; `started`: a worker started from the form, on the draft it was opened on, which the renderer deletes.
 */
export type SpawnIo<D, I, K extends KeptDraft> = {
  board(): Board
  run(call: Call<'spawn'>, body: Partial<Verbs['spawn']>): Promise<Replies['spawn']>
  sign(f: Floor): string
  drafts: SpawnDrafts<I, K>
  draftIo: I
  held(on: D): Promise<K | undefined>
  kept(d: K): void
  shown(): void
  started(id: string, on: D | undefined): void
  toast(text: string): void
}

/**
 * Runs the new-worker dialog in `dialog`, opened by dispatching `open`. The form's summary, branch placeholder and callsign's
 * refusal follow its fields; Start (or the `submit` key) starts a worker once the form is valid, and Cancel or Esc
 * closes it, except while Start waits on the tower. The dialog closes from its buttons, never by a form submit: a
 * shelf page runs sandboxed without `allow-forms`.
 */
export function wireSpawn<D, I, K extends KeptDraft>(dialog: HTMLDialogElement, io: SpawnIo<D, I, K>): Loop<Spawning<D>, SpawnEvent<D>> {
  const floorOf = (project: string) => io.board().floors.find((f) => f.id === project)
  const field = (name: string) => dialog.querySelector<HTMLInputElement>(`[name=${name}]`)!
  const form = () => dialog.querySelector<HTMLFormElement>('form')!
  const prompt = () => dialog.querySelector<HTMLTextAreaElement>('[name=prompt]')!
  const startButton = () => dialog.querySelector<HTMLElement>('[data-close=start]')!
  const shownFloor = () => {
    const s = machine.state()
    return floorOf(s.t === 'closed' ? '' : s.project)!
  }
  const sync = () => {
    const f = shownFloor()
    const v = spawnForm(f, new FormData(form()))
    const refused = callsignRefusal(io.board(), v)
    field('branch').placeholder = branchPlaceholder(f, cutNameOf(v))
    field('callsign').setCustomValidity(refused)
    dialog.querySelector('[data-callsign-why]')!.textContent = refused
    dialog.querySelector('[data-summary]')!.innerHTML = spawnSummaryHtml(f, v, io.board().claudeDefaults, formFields(io.board(), f))
    return v
  }
  const keep = async ({ project, on, text }: Extract<SpawnEffect<D>, { type: 'keep' }>) => {
    const f = floorOf(project)
    if (!f || !io.drafts.draftsOf(f)) return
    const from = on === undefined ? undefined : await io.held(on)
    const kept = await io.drafts.keepUnsent(io.draftIo, project, from, text)
    if (!kept) return
    io.kept(kept)
    io.toast(`${from ? 'Your edits were kept in the draft' : 'Your prompt was kept as a draft'}: ${io.drafts.titleOf(kept.text)} (${tagOf(kept.id!)})`)
  }
  const machine = loop({
    state: spawnClosed<D>(),
    handlers: spawnHandlers<D>(),
    execute: {
      show: ({ project, text, on }) => {
        const f = floorOf(project)!
        dialog.innerHTML = spawnFormHtml(f, { sign: io.sign(f), draft: on === undefined ? undefined : io.drafts.titleOf(text), defaults: io.board().claudeDefaults, fields: formFields(io.board(), f) })
        prompt().value = text
        sync()
        dialog.showModal()
        io.shown()
        prompt().focus()
      },
      reshow: () => (dialog.showModal(), io.shown()),
      draw: () => {
        const s = machine.state()
        if (s.t === 'starting') startButton().setAttribute('aria-busy', 'true')
        else startButton().removeAttribute('aria-busy')
        dialog.querySelector('[data-spawn-error]')!.textContent = s.t === 'editing' ? s.error : ''
      },
      close: () => dialog.close(),
      run: ({ project, form }, dispatch) =>
        void io.run(...spawnCall(floorOf(project)!, form)).then(
          (reply) => dispatch({ type: 'started', reply }),
          (err: Error) => dispatch({ type: 'failed', message: err.message }),
        ),
      keep: (effect) => void keep(effect),
      toast: ({ text }) => io.toast(text),
      started: ({ id, on }) => io.started(id, on),
    },
  })
  dialog.addEventListener('input', sync)
  dialog.addEventListener('click', (e) => {
    const close = (e.target as Element).closest<HTMLElement>('[data-close]')
    if (close?.dataset.close === 'cancel') return machine.dispatch({ type: 'cancel' })
    if (close && form().reportValidity()) machine.dispatch({ type: 'start', form: sync() })
  })
  dialog.addEventListener('cancel', (e) => (e.preventDefault(), machine.dispatch({ type: 'cancel' })))
  dialog.addEventListener('close', () => machine.dispatch({ type: 'closed', text: prompt().value }))
  dialog.addEventListener('keydown', (e) => {
    if (commandOf(io.board().keys, e, 'field') === 'submit') startButton().click()
  })
  return machine
}
