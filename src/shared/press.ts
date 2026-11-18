/**
 * Controls that ask the tower something, as every renderer draws them: a control is found again in html drawn anew by
 * its identity, and stays busy while what it asks is in flight.
 */

/** What finds a control again in html drawn anew: its first attribute that names what it does. */
const IDENTITY = /^(data-(?!tip$|since$|hold$)|href$|popovertarget$)/

/** A control's tag and the attributes naming what it does, as a selector: two controls asking the same thing share one. */
export const identityOf = (el: Element) => el.localName + [...el.attributes].filter((a) => IDENTITY.test(a.name)).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('')

/**
 * A press, as `pressingAs` holds it in flight: `key` names what it asks, so a second press of the same key while it is
 * in flight is ignored; `marks` selects the elements drawn busy meanwhile. @since 2.17
 */
export type Press = { key: string; marks: string }

/**
 * A press of `control`: keyed by its identity (`identityOf`), marking every control of that identity. A control
 * that names nothing it does (`data-resume="<call>"`, `data-act="kill" data-of="<id>"`) would mark every control of
 * its tag, and throws. @since 2.17
 */
export const pressOf = (control: Element): Press => {
  const key = identityOf(control)
  if (key === control.localName) throw new Error(`pressing: this ${key} names nothing it does: give it a data- attribute`)
  return { key, marks: key }
}

/** The presses in flight, by key, each with what it marks. */
const inFlight = new Map<string, string>()
let redrawn: MutationObserver | undefined

const mark = (marks: string, busy: boolean) =>
  document.querySelectorAll(marks).forEach((el) => (busy ? el.setAttribute('aria-busy', 'true') : el.removeAttribute('aria-busy')))

/**
 * Runs `request` for `press`. Until it settles, every element `press.marks` selects is `aria-busy`, drawn by
 * `design.css`, one drawn again meanwhile included. A press whose key is in flight is ignored and answers `undefined`.
 * @since 2.17
 */
export async function pressingAs<T>(press: Press, request: () => Promise<T>): Promise<T | undefined> {
  if (inFlight.has(press.key)) return undefined
  redrawn ??= new MutationObserver(() => inFlight.forEach((marks) => mark(marks, true)))
  if (!inFlight.size) redrawn.observe(document.body, { childList: true, subtree: true })
  inFlight.set(press.key, press.marks)
  mark(press.marks, true)
  try {
    return await request()
  } finally {
    inFlight.delete(press.key)
    mark(press.marks, false)
    if (!inFlight.size) redrawn.disconnect()
  }
}

/**
 * Runs `request` for a press of `control`, as `pressingAs` runs it (`pressOf`): the pressed control, one
 * drawn again in its place meanwhile, and one elsewhere asking the same thing are busy until it settles.
 */
export async function pressing<T>(control: Element, request: () => Promise<T>): Promise<T | undefined> {
  return pressingAs(pressOf(control), request)
}
