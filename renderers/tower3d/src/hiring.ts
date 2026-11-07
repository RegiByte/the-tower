import { findCard, type Board } from '/lib/board.js'
import type { Replies } from '/lib/extension.js'
import type { Handlers, StateEffect } from '/lib/machine.js'
import { cutLine, type SpawnForm } from '/lib/spawn.js'

/**
 * The hires in flight in the world, one at most per floor, as a machine: a hire takes seconds on a floor that cuts a
 * worktree, and the world shows nothing of it until the new worker's desk does, so a second press in that gap would
 * hire a second worker. A floor's hire holds from the press until the board shows the worker it started: E, the
 * carried note's hire and the new-worker dialog all start nothing on that floor meanwhile. The dialog's own Start
 * waits in the spawn machine (`src/shared/spawn.ts`); its floor comes in as `starting`, and its worker as `arriving`.
 */

/**
 * A floor's hire: its spawn waiting on the tower (`on`, the carried note it was hired on), then the worker it started
 * on its way to its desk. `name`: the floor's, for what is said of it.
 */
export type Hire<D> = { t: 'spawning'; name: string; on: D | undefined } | { t: 'arriving'; name: string; id: string }

/** The hires in flight, by floor. `D`: a carried note, as the renderer holds it. */
export type Hiring<D> = Readonly<Record<string, Hire<D>>>

export const noHires = <D>(): Hiring<D> => ({})

/**
 * `hire`: a worker with `form` on a floor (`starting`, the floor the dialog's Start waits on, if any); `open`: the
 * dialog asked for on a floor; `replied` and `failed`: the tower's answer to a hire; `arriving`: the worker the
 * dialog started; `board`: a board drawn; `lost`: the tower stopped answering.
 */
export type HiringEvent<D> =
  | { type: 'hire'; project: string; name: string; form: SpawnForm; on: D | undefined; starting: string | undefined }
  | { type: 'open'; project: string; name: string; on: D | undefined; text: string }
  | { type: 'replied'; project: string; reply: Replies['spawn'] }
  | { type: 'failed'; project: string; message: string }
  | { type: 'arriving'; project: string; name: string; id: string }
  | { type: 'board'; board: Board }
  | { type: 'lost' }

/**
 * `run` spawns; `started` hands over the worker a hire started, on the note it was hired on; `open` opens the dialog;
 * `draw` redraws the floors' open workstations.
 */
export type HiringEffect<D> =
  | StateEffect<Hiring<D>>
  | { type: 'run'; project: string; form: SpawnForm }
  | { type: 'started'; id: string; on: D | undefined }
  | { type: 'open'; project: string; on: D | undefined; text: string }
  | { type: 'toast'; text: string }
  | { type: 'draw' }

const without = <D>(h: Hiring<D>, project: string): Hiring<D> => Object.fromEntries(Object.entries(h).filter(([p]) => p !== project))

const already = (name: string) => ({ type: 'toast' as const, text: `Already hiring a worker on ${name}: wait for its desk` })

export const hiringHandlers = <D>(): Handlers<Hiring<D>, HiringEvent<D>, HiringEffect<D>> => ({
  hire: (h, { project, name, form, on, starting }) => {
    if (h[project] || starting === project) return [already(name)]
    return [
      { type: 'state', state: { ...h, [project]: { t: 'spawning', name, on } } },
      { type: 'toast', text: `Hiring a worker on ${name}` },
      { type: 'draw' },
      { type: 'run', project, form },
    ]
  },
  open: (h, { project, name, on, text }) => (h[project] ? [already(name)] : [{ type: 'open', project, on, text }]),
  replied: (h, { project, reply }) => {
    const hire = h[project]
    if (hire?.t !== 'spawning') return []
    return [
      { type: 'state', state: { ...h, [project]: { t: 'arriving', name: hire.name, id: reply.id } } },
      ...(reply.cut ? [{ type: 'toast' as const, text: cutLine(reply.cut) }] : []),
      { type: 'started', id: reply.id, on: hire.on },
    ]
  },
  failed: (h, { project, message }) =>
    h[project]?.t === 'spawning' ? [{ type: 'state', state: without(h, project) }, { type: 'toast', text: message }, { type: 'draw' }] : [],
  arriving: (h, { project, name, id }) => [{ type: 'state', state: { ...h, [project]: { t: 'arriving', name, id } } }, { type: 'draw' }],
  board: (h, { board }) => {
    const shown = Object.entries(h).flatMap(([project, hire]) => {
      const card = hire.t === 'arriving' ? findCard(board, hire.id) : undefined
      return card ? [{ project, card }] : []
    })
    if (!shown.length) return []
    const next = shown.reduce((acc, { project }) => without(acc, project), h)
    const ended = shown.filter(({ card }) => !card.onDuty)
    return [
      { type: 'state', state: next },
      ...ended.map(({ card }): HiringEffect<D> => ({ type: 'toast', text: `${card.callsign} ended before it reached its desk` })),
      { type: 'draw' },
    ]
  },
  lost: (h) => {
    const names = Object.values(h).map((hire) => hire.name)
    if (!names.length) return []
    return [{ type: 'state', state: noHires<D>() }, { type: 'toast', text: `The tower stopped answering while hiring on ${names.join(', ')}: look there once it is back` }, { type: 'draw' }]
  },
})
