/** What the tower page's module sees beyond `/tower.js`, for its own typecheck (tsconfig.page.json). */
import type * as Xterm from '@xterm/xterm'
import type * as Fit from '@xterm/addon-fit'
import type * as WebLinks from '@xterm/addon-web-links'

declare global {
  /** `/xterm.js`, `/addon-fit.js` and `/addon-web-links.js`, the classic scripts index.html loads before the module, as their UMD globals. */
  var Terminal: typeof Xterm.Terminal
  var FitAddon: typeof Fit
  var WebLinksAddon: typeof WebLinks

  /** Every element the page looks up by a selector is one of its own HTML elements. */
  interface Element {
    closest(selectors: string): HTMLElement | null
  }
  interface ParentNode {
    querySelector(selectors: string): HTMLElement | null
    querySelectorAll(selectors: string): NodeListOf<HTMLElement>
  }
}
