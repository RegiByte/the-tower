import type { Scene } from './scene.ts'

/**
 * A scene document as a list of them shows it: what it is, whether it has states or slots, who places it, whether Tower
 * 3D reads it; or why it could not be read.
 */
export type DocEntry =
  | { path: string; title?: string; note?: string; states: number; slots: number; usedBy: string[]; tower3d: boolean }
  | { path: string; error: string; usedBy: string[]; tower3d: boolean }

/** A document as read for the list: its scene, or the error reading it gave. */
export type Read = { path: string; scene: Scene } | { path: string; error: string }

/** The scenes a document places, its own items' and every state's, as `resolve` answers paths relative to it. */
const placesIn = (scene: Scene, at: string, resolve: (ref: string, from: string) => string) =>
  [...(scene.items ?? []), ...Object.values(scene.states ?? {}).flatMap((s) => s.add?.items ?? [])].flatMap((it) => ('scene' in it ? [resolve(it.scene, at)] : []))

/** Every document of `docs` listed, by path, with the documents placing it; `tower3d` the paths Tower 3D reads. */
export function listing(docs: Read[], tower3d: Set<string>, resolve: (ref: string, from: string) => string): DocEntry[] {
  const placed = docs.flatMap((d) => ('scene' in d ? placesIn(d.scene, d.path, resolve).map((to) => [to, d.path] as const) : []))
  const usedBy = (path: string) => [...new Set(placed.filter(([to]) => to === path).map(([, by]) => by))]
  return docs.map((d) => {
    if ('error' in d) return { path: d.path, error: d.error, usedBy: usedBy(d.path), tower3d: tower3d.has(d.path) }
    const { path, scene } = d
    return {
      path,
      title: scene.title,
      note: scene.note,
      states: Object.keys(scene.states ?? {}).length,
      slots: [scene.slots ?? [], ...Object.values(scene.states ?? {}).map((s) => s.add?.slots ?? [])].flat().length,
      usedBy: usedBy(path),
      tower3d: tower3d.has(path),
    }
  })
}
