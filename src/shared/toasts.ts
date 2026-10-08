/**
 * Toasts: a few words about what just happened, stacked at the bottom of the page, the newest last. Each leaves after
 * `TOAST_MS`, or `ACTION_TOAST_MS` when it carries an action, and none leaves while the pointer or the focus is on the
 * stack; past `TOAST_MAX`, the oldest leaves first, and the same words told again move to the end, their time anew. An action is one button that follows up what the toast tells
 * (Resume after a kill, Undo after a delete): pressing it closes the toast and runs it. The stack is a polite live
 * region, so a screen reader says each toast as it comes. The tower serves this module as `/toasts.js`.
 */

export type ToastAction = { label: string; run: () => unknown }

export const TOAST_MS = 4000
export const ACTION_TOAST_MS = 8000
export const TOAST_MAX = 4

type Shown = { left: number; since: number; timer?: ReturnType<typeof setTimeout> }

/** Turns `stack`, an empty element of the page, into its toasts, answering the function that shows one. */
export function toaster(stack: HTMLElement) {
  stack.classList.add('toasts')
  stack.setAttribute('role', 'status')
  const shown = new Map<HTMLElement, Shown>()
  const held = { pointer: false, focus: false }
  const close = (el: HTMLElement) => {
    clearTimeout(shown.get(el)?.timer)
    shown.delete(el)
    el.remove()
    if (!shown.size) held.pointer = false
    hold('focus', stack.contains(document.activeElement))
  }
  const run = (el: HTMLElement, s: Shown) => ((s.since = Date.now()), (s.timer = setTimeout(() => close(el), s.left)))
  const pause = (s: Shown) => (clearTimeout(s.timer), (s.left -= Date.now() - s.since))
  const hold = (how: keyof typeof held, on: boolean) => {
    const was = held.pointer || held.focus
    held[how] = on
    const now = held.pointer || held.focus
    if (now !== was) shown.forEach((s, el) => (now ? pause(s) : run(el, s)))
  }
  stack.addEventListener('pointerenter', () => hold('pointer', true))
  stack.addEventListener('pointerleave', () => hold('pointer', false))
  stack.addEventListener('focusin', () => hold('focus', true))
  stack.addEventListener('focusout', (e) => hold('focus', stack.contains(e.relatedTarget as Node | null)))

  return (msg: string, action?: ToastAction) => {
    for (const [old] of shown) if (!old.querySelector('button') && old.textContent === msg) close(old)
    const el = document.createElement('div')
    el.className = 'toast'
    el.append(Object.assign(document.createElement('span'), { textContent: msg }))
    if (action) {
      const button = Object.assign(document.createElement('button'), { textContent: action.label })
      button.dataset.toastAction = action.label
      button.onclick = () => (close(el), action.run())
      el.append(button)
    }
    stack.append(el)
    const s: Shown = { left: action ? ACTION_TOAST_MS : TOAST_MS, since: Date.now() }
    shown.set(el, s)
    if (!(held.pointer || held.focus)) run(el, s)
    while (shown.size > TOAST_MAX) close(shown.keys().next().value!)
  }
}

/** The stack's look, from the design's tokens: the renderer's own button style draws an action. */
export const toastsCss = `
.toasts { position: fixed; left: 50%; bottom: 20px; translate: -50% 0; z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: max-content; max-width: 90vw; pointer-events: none; }
.toasts .toast { display: flex; align-items: center; gap: 12px; max-width: 100%; padding: 9px 14px; background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-left: 4px solid var(--ink); border-radius: var(--radius); box-shadow: var(--shadow); pointer-events: auto; }
.toasts .toast button { flex: none; }
`
