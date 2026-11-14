/**
 * What the tower lends extensions' server code: the library. `import { esc } from '/lib/words.js'` loads `src/lib/`'s
 * module, the same instance the tower runs and the same line a client writes. An extension copied anywhere reaches the
 * tower's helpers by name, never by a path into its checkout. Imported for its hook by whatever imports an extension's
 * server module.
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { LIBRARY, libraryUrls, urlSource } from './tower/served.ts'

const refused = (specifier: string, parent: string | undefined, names: string[]) =>
  new Error(`${parent ?? 'a module'} imports "${specifier}", which the tower doesn't lend: import one of ${names.join(', ')}`)

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.startsWith(LIBRARY)) return nextResolve(specifier, context)
    const source = urlSource(specifier)
    if (!source) throw refused(specifier, context.parentURL, libraryUrls())
    return { url: pathToFileURL(source).href, format: 'module', shortCircuit: true }
  },
})
