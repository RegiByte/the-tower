/**
 * Fresh imports of a folder's modules. Node keeps every module it loaded, by URL, until the process ends, so a module
 * is loaded again only under another URL: `?v=<version>`. A resolve hook carries the version of the importing module
 * to every module it imports inside the same folder, its `node_modules` aside, so a new version loads the folder's
 * whole graph again, and what lies outside it (the tower's own modules, packages) stays the one instance. Each old
 * graph stays in memory until the process ends.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Each version's folder, as a URL ending in `/`. */
const folders = new Map<string, string>()

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const resolved = nextResolve(specifier, context)
    const version = context.parentURL && URL.canParse(context.parentURL) ? new URL(context.parentURL).searchParams.get('v') : null
    const folder = version === null ? undefined : folders.get(version)
    if (!folder || !resolved.url.startsWith(folder) || resolved.url.includes('/node_modules/')) return resolved
    const url = new URL(resolved.url)
    url.searchParams.set('v', version!)
    return { ...resolved, url: url.href }
  },
})

/** `file` of `dir`, and every module it imports inside `dir`, loaded as `version`: a version not seen before loads them again. */
export const importFresh = (dir: string, file: string, version: string): Promise<Record<string, unknown>> => {
  folders.set(version, `${pathToFileURL(dir).href.replace(/\/?$/, '/')}`)
  return import(`${pathToFileURL(path.join(dir, file)).href}?v=${version}`)
}
