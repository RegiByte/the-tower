/**
 * Loaded before the tests (`npm test`): a page module imports what the tower serves by its URL (`views.ts`), and
 * this resolves each served URL to its source, as `tsconfig.client.json`'s paths do for the typecheck: a file below
 * `src/` at its own URL (`/lib/view.js`, `/shared/press.js`), and an npm package's module (`/vendor/marked.js`).
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { urlSource, urlVendor } from '../src/tower/served.ts'

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const file = specifier.startsWith('/') ? urlSource(specifier) : undefined
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    const vendor = specifier.startsWith('/vendor/') ? urlVendor(specifier) : undefined
    return nextResolve(vendor ?? specifier, context)
  },
})
