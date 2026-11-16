import { asking } from '/lib/chrome.js'

/**
 * What the player means to do this frame, apart from where it came from: the keys held and the mouse's travel under
 * pointer lock produce it, and the door (`window.tower3d`) produces the same.
 */
export type Move = { ahead: number; side: number; run: boolean; jump: boolean }
export type Turn = { x: number; y: number }

const typing = () => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || asking()
}

/** Every key `move` reads, by `KeyboardEvent.code`. */
export const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'])

const axis = (plus: boolean, minus: boolean) => Number(plus) - Number(minus)

const fromKeys = (held: ReadonlySet<string>): Move => ({
  ahead: axis(held.has('KeyW') || held.has('ArrowUp'), held.has('KeyS') || held.has('ArrowDown')),
  side: axis(held.has('KeyD') || held.has('ArrowRight'), held.has('KeyA') || held.has('ArrowLeft')),
  run: held.has('ShiftLeft') || held.has('ShiftRight'),
  jump: held.has('Space'),
})

/** Listens to the keys held and to the mouse's travel while `canvas` holds the pointer lock. */
export function startInput(canvas: HTMLCanvasElement) {
  const held = new Set<string>()
  let driven: Move | undefined
  let turnX = 0
  let turnY = 0
  /** macOS reports no keyup for a key released while Cmd is down: Cmd lets go of every key. */
  const down = (e: KeyboardEvent) => (e.key === 'Meta' ? held.clear() : !typing() && !e.metaKey && !e.ctrlKey && !e.altKey && held.add(e.code))
  const up = (e: KeyboardEvent) => (e.key === 'Meta' ? held.clear() : held.delete(e.code))
  const blur = () => held.clear()
  const travel = (e: MouseEvent) => document.pointerLockElement === canvas && turn(e.movementX, e.movementY)
  addEventListener('keydown', down)
  addEventListener('keyup', up)
  addEventListener('blur', blur)
  document.addEventListener('mousemove', travel)

  /** Adds mouse travel, in pixels, to the turn taken next frame. */
  function turn(dx: number, dy: number) {
    turnX += dx
    turnY += dy
  }

  return {
    /** The move held now: the door's while it drives, else the keyboard's. */
    move: (): Move => driven ?? fromKeys(held),
    /** Holds `m` until the next call; `undefined` hands moving back to the keyboard. */
    drive: (m: Move | undefined) => void (driven = m),
    turn,
    /** The travel since the last take. */
    takeTurn: (): Turn => {
      const t = { x: turnX, y: turnY }
      turnX = turnY = 0
      return t
    },
    releaseKeys: () => held.clear(),
    stop: () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', blur)
      document.removeEventListener('mousemove', travel)
    },
  }
}

export type Input = ReturnType<typeof startInput>
