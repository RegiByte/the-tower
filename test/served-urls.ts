/**
 * Loaded before the tests (`npm test`): a page module imports what the tower serves by its URL (`/views.js`), and
 * this resolves each served URL to its source, as `tsconfig.client.json`'s paths do for the typecheck: a served module,
 * a file below `src/` at its own URL (`/shared/press.js`), and an npm package's module (`/vendor/marked.js`).
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { MODULES, urlSource, urlVendor } from '../src/tower/served.ts'

const sourceOf = (specifier: string) => MODULES[specifier] ?? urlSource(specifier)

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const file = specifier.startsWith('/') ? sourceOf(specifier) : undefined
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    const vendor = specifier.startsWith('/vendor/') ? urlVendor(specifier) : undefined
    return nextResolve(vendor ?? specifier, context)
  },
})
