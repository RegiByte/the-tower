/**
 * Toasts: a few words about what just happened, stacked at the bottom of the page, the newest last. Each leaves after
 * `TOAST_MS`, or `ACTION_TOAST_MS` when it carries an action, and none leaves while the pointer or the focus is on the
 * stack; past `TOAST_MAX`, the oldest leaves first. A toast told again while the same one shows (`sameToast`) is not
 * stacked twice: the one showing moves to the end with its time anew, its action the newest, and counts the times
 * (`×2`). An action is one button that follows up what the toast tells (Resume after a kill, Undo after a delete):
 * pressing it closes the toast and runs it. The stack is a polite live region, so a screen reader says each toast as it
 * comes. The tower serves this module as `/toasts.js`. Every toast in the stack is as wide as the widest, so their
 * edges and their actions line up.
 */

export type ToastAction = { label: string; run: () => unknown }

export const TOAST_MS = 4000
export const ACTION_TOAST_MS = 8000
export const TOAST_MAX = 4

/** What a toast tells: its words and its action's label, all that a reader sees of it. */
export type Told = { msg: string; action?: string }

type Shown = Told & { count: number; left: number; since: number; timer?: ReturnType<typeof setTimeout> }

/** Whether two toasts tell the same: the same words with the same action, or both without one. */
export const sameToast = (a: Told, b: Told) => a.msg === b.msg && a.action === b.action

/** How a toast told `count` times says so, empty when told once. */
export const toldTimes = (count: number) => (count > 1 ? `×${count}` : '')

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

  const act = (el: HTMLElement, action?: ToastAction) => {
    el.querySelector('button')?.remove()
    if (!action) return
    const button = Object.assign(document.createElement('button'), { textContent: action.label })
    button.dataset.toastAction = action.label
    button.onclick = () => (close(el), action.run())
    el.append(button)
  }
  const fresh = (told: Told, action?: ToastAction) => {
    const el = document.createElement('div')
    el.className = 'toast'
    el.append(Object.assign(document.createElement('span'), { textContent: told.msg }), Object.assign(document.createElement('span'), { className: 'toast-count' }))
    act(el, action)
    const s: Shown = { ...told, count: 0, left: 0, since: 0 }
    return [el, s] as const
  }

  return (msg: string, action?: ToastAction) => {
    const told: Told = { msg, action: action?.label }
    const same = [...shown].find(([, s]) => sameToast(s, told))
    const [el, s] = same ?? fresh(told, action)
    if (same) (clearTimeout(s.timer), shown.delete(el), act(el, action))
    s.count += 1
    s.left = action ? ACTION_TOAST_MS : TOAST_MS
    el.querySelector('.toast-count')!.textContent = toldTimes(s.count)
    stack.append(el)
    shown.set(el, s)
    if (!(held.pointer || held.focus)) run(el, s)
    while (shown.size > TOAST_MAX) close(shown.keys().next().value!)
  }
}

/** The stack's look, from the design's tokens: the renderer's own button style draws an action. */
export const toastsCss = `
.toasts { position: fixed; left: 50%; bottom: 20px; translate: -50% 0; z-index: 20; display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-s);
  width: max-content; max-width: 90vw; pointer-events: none; }
.toasts .toast { display: flex; align-items: center; gap: var(--sp-l); max-width: 100%; padding: var(--sp-m) var(--sp-xl); background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-left: 4px solid var(--ink); border-radius: var(--radius); box-shadow: var(--shadow); pointer-events: auto; }
.toasts .toast > span:first-child { flex: 1; }
.toasts .toast-count { flex: none; color: var(--muted); font-variant-numeric: tabular-nums; }
.toasts .toast-count:empty { display: none; }
.toasts .toast button { flex: none; }
`
