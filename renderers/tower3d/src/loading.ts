import { reducedMotion } from '../../../src/shared/prefs.ts'

/**
 * The loading screen index.html draws before the bundle runs: the elevator's panel, a button per stage of the start
 * lighting as the page reaches it, gone once the first frame with a board is drawn. A fixture page (`?board=`) drops it
 * as it boots (boot.ts), so its frames are the same as a page that never had one.
 */

export type Stage = 'settings' | 'models' | 'board' | 'building' | 'lighting'

const screen = document.getElementById('loading')!

export function stage(at: Stage) {
  delete screen.dataset.failed
  const buttons = [...screen.querySelectorAll<HTMLElement>('li')]
  const now = buttons.findIndex((li) => li.dataset.stage === at)
  buttons.forEach((li, i) => (li.classList.toggle('done', i < now), li.classList.toggle('now', i === now)))
  screen.querySelector('.floor')!.textContent = buttons[now].querySelector('b')!.textContent
}

/** A start that can't go on says why on the screen, which stays. */
export function fail(why: string) {
  screen.dataset.failed = ''
  screen.querySelector('.why')!.textContent = why
}

export const failed = () => screen.dataset.failed !== undefined

export const shown = () => screen.isConnected && !screen.classList.contains('leaving')

export function leave() {
  if (reducedMotion()) return screen.remove()
  screen.addEventListener('transitionend', () => screen.remove(), { once: true })
  screen.classList.add('leaving')
}

export const drop = () => screen.remove()
