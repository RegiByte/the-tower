/**
 * Loaded before the tests (`npm test`): a page module imports what the tower serves by its URL (`/views.js`), and
 * this resolves each served module's URL to its source, as `tsconfig.client.json`'s paths do for the typecheck.
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { MODULES } from '../src/tower/served.ts'

registerHooks({
  resolve: (specifier, context, nextResolve) => (MODULES[specifier] ? { url: pathToFileURL(MODULES[specifier]).href, shortCircuit: true } : nextResolve(specifier, context)),
})
