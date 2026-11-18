/**
 * The UI SDK as the tower's elements use it, served as `/lib-ui/sdk.js`, which is internal: only the modules beside it
 * import it. It bundles the SDK's entries the elements build on once, packages inlined, since components on two SDK
 * cores can't share the layers their popups stack in; it adopts the tower's look for their parts (`look.css`); and it
 * holds what every element does with them. The `ui-*` parts it defines are an element's implementation: a page never
 * writes one, and an SDK pin may change any of them.
 */
import '@ui-sdk/web/menu'
import '@ui-sdk/web/combobox'
import look from './look.css'

const sheet = new CSSStyleSheet()
sheet.replaceSync(look)
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]

/**
 * What a `tower-*` element promises, each name with what it means: the attributes a render writes, the properties and
 * events code uses, and the custom states (`:state(<name>)`) a stylesheet reads. Never its `ui-*` parts.
 */
export type ElementContract = {
  attributes: Record<string, string>
  properties: Record<string, string>
  events: Record<string, string>
  states: Record<string, string>
}

/**
 * Fires each event of `names` the part `from` fires on its element `to` too, bubbling, so a view that draws the element
 * as a string listens on its own host. The SDK's events fire on their part alone; a listener on `to` that cancels one
 * cancels the part's change. One the element refused already is not fired again: it never happened.
 */
export function relay(from: Element, to: Element, names: string[]) {
  for (const name of names) {
    from.addEventListener(name, (event) => {
      const { detail, cancelable } = event as CustomEvent
      if (event.defaultPrevented) return
      if (!to.dispatchEvent(new CustomEvent(name, { detail, cancelable, bubbles: true }))) event.preventDefault()
    })
  }
}
