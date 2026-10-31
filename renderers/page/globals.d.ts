/** What the tower page's module sees beyond `/tower.js`, for its own typecheck (tsconfig.page.json). */
import type * as Xterm from '@xterm/xterm'
import type * as Fit from '@xterm/addon-fit'
import type * as WebLinks from '@xterm/addon-web-links'
import type * as UnicodeGraphemes from '@xterm/addon-unicode-graphemes'

declare global {
  /** `/xterm.js`, `/addon-fit.js`, `/addon-web-links.js` and `/addon-unicode-graphemes.js`, the classic scripts index.html loads before the module, as their UMD globals. */
  var Terminal: typeof Xterm.Terminal
  var FitAddon: typeof Fit
  var WebLinksAddon: typeof WebLinks
  var UnicodeGraphemesAddon: typeof UnicodeGraphemes

  /** Every element the page looks up by a selector is one of its own HTML elements. */
  interface Element {
    closest(selectors: string): HTMLElement | null
  }
  interface ParentNode {
    querySelector(selectors: string): HTMLElement | null
    querySelectorAll(selectors: string): NodeListOf<HTMLElement>
  }
}
