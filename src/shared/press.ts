/**
 * Controls that ask the tower something, as every renderer draws them: a control is found again in html drawn anew by
 * its identity, and stays busy while what it asks is in flight. The tower serves this module as `/press.js`.
 */

/** What finds a control again in html drawn anew: its first attribute that names what it does. */
const IDENTITY = /^(data-(?!tip$|since$|hold$)|href$|popovertarget$)/

/** A control's tag and the attributes naming what it does, as a selector: two controls asking the same thing share one. */
export const identityOf = (el: Element) => el.localName + [...el.attributes].filter((a) => IDENTITY.test(a.name)).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('')

const inFlight = new Set<string>()
let redrawn: MutationObserver | undefined

const mark = (key: string, busy: boolean) =>
  document.querySelectorAll(key).forEach((el) => (busy ? el.setAttribute('aria-busy', 'true') : el.removeAttribute('aria-busy')))

/**
 * Runs `request` for a press of `control`. Until it settles, every control of the same identity (`identityOf`) is
 * `aria-busy`, drawn by `design.css`: the pressed one, one drawn again in its place meanwhile, and one elsewhere asking
 * the same thing. A press of a busy control is ignored and answers `undefined`. The control names what it does by an
 * attribute (`data-resume="<call>"`, `data-act="kill" data-of="<id>"`): one without would mark every control of its tag.
 */
export async function pressing<T>(control: Element, request: () => Promise<T>): Promise<T | undefined> {
  const key = identityOf(control)
  if (key === control.localName) throw new Error(`pressing: this ${key} names nothing it does: give it a data- attribute`)
  if (inFlight.has(key)) return undefined
  redrawn ??= new MutationObserver(() => inFlight.forEach((k) => mark(k, true)))
  if (!inFlight.size) redrawn.observe(document.body, { childList: true, subtree: true })
  inFlight.add(key)
  mark(key, true)
  try {
    return await request()
  } finally {
    inFlight.delete(key)
    mark(key, false)
    if (!inFlight.size) redrawn.disconnect()
  }
}
