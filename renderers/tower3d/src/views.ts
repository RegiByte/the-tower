import type { Subject } from '/lib/board.js'
import { declaredLayout, layoutOf, usableConfigLayout } from '/lib/layout.js'
import type { Board, Tower } from './api.ts'
import type { DeskRegion } from './desk-verbs.ts'
import { deskViews, readerView, viewHosting } from './hosting.ts'
import type { Clock } from './clock.ts'
import type { Port } from './port.ts'
import { s } from './state.ts'
import { nowOf } from './now.ts'
import type { Toasts } from './toasts.ts'

/** What the views are started with. */
export type ViewsDeps = { tower: Tower; clock: Clock; port: Port; toasts: Toasts }

export type Views = ReturnType<typeof startViews>

/**
 * The page's mounted views (the kit's): the desk's and the reader's, and the layout they are drawn by. A view that
 * changed or hands a subject to place tells the app through the port (`views/changed`, `display`).
 */
export function startViews(started: ViewsDeps) {
  const { port } = started
  const { toast } = started.toasts
  const { boardNow } = nowOf(port)

  /**
   * The layout Tower 3D draws by (decision `region-overflow`): its `renderer.json`'s over what started extensions give
   * their own regions, then the config's less the regions whose layout fails its check, then yours.
   */
  const layoutNow = (board: Board) => layoutOf(declaredLayout(board, s.declared?.layout ?? {}), s.declared ? usableConfigLayout(s.declared) : {}, s.storedLayout)
  /** The desk's region as Tower 3D draws it now: what its `renderer.json` says it holds, and its entry in the layout. */
  const deskNow = (board: Board): DeskRegion => ({ holds: s.declared?.regions?.find((r) => r.id === 'card.desk')?.holds ?? [], entry: layoutNow(board)['card.desk'] })

  const viewDeps = {
    tower: started.tower,
    now: started.clock.now,
    board: () => boardNow()!,
    layout: () => layoutNow(boardNow()!),
    declared: () => s.declared!,
    toast: (message: string) => toast(message),
    display: (subject: Subject | string) => port.dispatch({ type: 'display', subject }),
    redraw: () => port.dispatch({ type: 'views/changed' }),
  }
  const hosting = viewHosting(viewDeps)
  /** The page's views the desk mounts. */
  const desk = deskViews(viewDeps, hosting)
  /** The page's thread view the reader mounts, on a checkout's thread where no worker's desk is. */
  const reader = readerView(viewDeps, hosting)

  return { desk, reader, layoutNow, deskNow }
}
