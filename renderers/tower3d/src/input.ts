/**
 * What the player means to do this frame, apart from where it came from: the keys held and the mouse's travel under
 * pointer lock produce it, and the door (`window.tower3d`) produces the same.
 */
export type Move = { ahead: number; side: number; run: boolean; jump: boolean }
export type Turn = { x: number; y: number }

const held = new Set<string>()
let driven: Move | undefined
let turnX = 0
let turnY = 0

const typing = () => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}

export function listen(canvas: HTMLCanvasElement) {
  /** macOS reports no keyup for a key released while Cmd is down: Cmd lets go of every key. */
  addEventListener('keydown', (e) => (e.key === 'Meta' ? held.clear() : !typing() && !e.metaKey && !e.ctrlKey && !e.altKey && held.add(e.code)))
  addEventListener('keyup', (e) => (e.key === 'Meta' ? held.clear() : held.delete(e.code)))
  addEventListener('blur', () => held.clear())
  document.addEventListener('mousemove', (e) => document.pointerLockElement === canvas && turn(e.movementX, e.movementY))
}

const axis = (plus: boolean, minus: boolean) => Number(plus) - Number(minus)

const fromKeys = (): Move => ({
  ahead: axis(held.has('KeyW') || held.has('ArrowUp'), held.has('KeyS') || held.has('ArrowDown')),
  side: axis(held.has('KeyD') || held.has('ArrowRight'), held.has('KeyA') || held.has('ArrowLeft')),
  run: held.has('ShiftLeft') || held.has('ShiftRight'),
  jump: held.has('Space'),
})

/** The move held now: the door's while it drives, else the keyboard's. */
export const move = (): Move => driven ?? fromKeys()

/** Holds `m` until the next call; `undefined` hands moving back to the keyboard. */
export const drive = (m: Move | undefined) => (driven = m)

/** Adds mouse travel, in pixels, to the turn taken next frame. */
export function turn(dx: number, dy: number) {
  turnX += dx
  turnY += dy
}

/** The travel since the last take. */
export function takeTurn(): Turn {
  const t = { x: turnX, y: turnY }
  turnX = turnY = 0
  return t
}

export const releaseKeys = () => held.clear()
