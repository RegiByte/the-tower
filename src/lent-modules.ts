/**
 * The served modules lent to extensions' server code: `import { mediaTypeOf } from 'tower:media.js'` loads the source
 * the tower serves renderers as `/media.js`, the same instance the tower runs. An extension copied anywhere reaches the
 * tower's helpers by name, never by a path into its checkout. Imported for its hook by whatever imports an extension's
 * server module.
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { MODULES } from './tower/served.ts'

/** The scheme a lent module's specifier starts with. */
export const LENT = 'tower:'

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.startsWith(LENT)) return nextResolve(specifier, context)
    const source = MODULES[`/${specifier.slice(LENT.length)}`]
    if (!source) {
      const names = Object.keys(MODULES).map((url) => `${LENT}${url.slice(1)}`)
      throw new Error(`${context.parentURL ?? 'a module'} imports "${specifier}", which the tower doesn't lend: import one of ${names.join(', ')}`)
    }
    return { url: pathToFileURL(source).href, format: 'module', shortCircuit: true }
  },
})
