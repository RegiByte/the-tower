/**
 * What the tower lends extensions' server code. The library: `import { esc } from '/lib/words.js'` loads `src/lib/`'s
 * module, the same instance the tower runs and the same line a client writes. The served modules, until 2.0:
 * `import { mediaTypeOf } from 'tower:media.js'` loads the source the tower serves renderers as `/media.js`. An
 * extension copied anywhere reaches the tower's helpers by name, never by a path into its checkout. Imported for its
 * hook by whatever imports an extension's server module.
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { LIBRARY, libraryUrls, MODULES, urlSource } from './tower/served.ts'

/** The scheme a lent module's specifier starts with. */
export const LENT = 'tower:'

const refused = (specifier: string, parent: string | undefined, names: string[]) =>
  new Error(`${parent ?? 'a module'} imports "${specifier}", which the tower doesn't lend: import one of ${names.join(', ')}`)

const lent = (file: string) => ({ url: pathToFileURL(file).href, format: 'module', shortCircuit: true })

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (specifier.startsWith(LIBRARY)) {
      const source = urlSource(specifier)
      if (!source) throw refused(specifier, context.parentURL, libraryUrls())
      return lent(source)
    }
    if (!specifier.startsWith(LENT)) return nextResolve(specifier, context)
    const source = MODULES[`/${specifier.slice(LENT.length)}`]
    if (!source) throw refused(specifier, context.parentURL, Object.keys(MODULES).map((url) => `${LENT}${url.slice(1)}`))
    return lent(source)
  },
})
