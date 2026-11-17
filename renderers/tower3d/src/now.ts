import { captured as capturedBy, type Panel } from './app.ts'
import type { Heed } from './cards.ts'
import type { Port } from './port.ts'

/** What the app decided, read through the port, and the dispatches that are one event each: the same wherever they are read. */
export type Now = ReturnType<typeof nowOf>

export function nowOf(port: Port) {
  /** What the building took, the board it stands on and the shelf entry this page is. */
  const buildingNow = () => port.state().building

  const boardNow = () => buildingNow()?.board

  const selfNow = () => buildingNow()?.self

  const captured = () => capturedBy(port.state().capture)

  const unlock = () => port.dispatch({ type: 'unlock' })

  const letGo = () => port.dispatch({ type: 'let-go' })

  /** The worker whose desk you sit at. */
  const atDesk = () => panelAs('desk')?.id

  /** The panel open beside the world. */
  const panelNow = () => port.state().panel

  /** The panel open while it is a `kind`. */
  const panelAs = <K extends Panel['kind']>(kind: K) => {
    const p = panelNow()
    return p?.kind === kind ? (p as Extract<Panel, { kind: K }>) : undefined
  }

  /** The panel goes to `to` (`go` in app.ts). */
  const go = (to: Panel | undefined) => port.dispatch({ type: 'go', to })

  /** The open panel's own data changes; it stays open, neither left nor entered. */
  const patchPanel = (to: Panel) => port.dispatch({ type: 'panel', to })

  const viewNow = () => port.state().view

  const motionNow = () => port.state().motion

  const deskTabNow = () => port.state().deskTab

  const replayNow = () => port.state().replay

  /** What you did about the waits (`Heed`): dismissed, the attention machine's, and visited by N this round. */
  const heed = (): Heed => ({ dismissed: port.state().attending.dismissed, visited: port.state().visited })

  /**
   * What the aimed thing offers, each verb on its own key. The mouse wheel marks one and a click runs it; a verb that
   * ends something runs only once its key or the button has been held for `HOLD_MS`.
   */
  const aimNow = () => port.state().aim

  return { buildingNow, boardNow, selfNow, captured, unlock, letGo, atDesk, panelNow, panelAs, go, patchPanel, viewNow, motionNow, deskTabNow, replayNow, heed, aimNow }
}
