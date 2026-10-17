import type { Scene } from './scene.ts'

/** A scene document as a list of them shows it: what it is, whether it has states or slots, who places it, whether Tower 3D reads it. */
export type DocEntry = { path: string; title?: string; note?: string; states: number; slots: number; usedBy: string[]; tower3d: boolean }

/** The scenes a document places, its own items' and every state's, as `resolve` answers paths relative to it. */
const placesIn = (scene: Scene, at: string, resolve: (ref: string, from: string) => string) =>
  [...(scene.items ?? []), ...Object.values(scene.states ?? {}).flatMap((s) => s.add?.items ?? [])].flatMap((it) => ('scene' in it ? [resolve(it.scene, at)] : []))

/** Every document of `docs` listed, by path, with the documents placing it; `tower3d` the paths Tower 3D reads. */
export function listing(docs: { path: string; scene: Scene }[], tower3d: Set<string>, resolve: (ref: string, from: string) => string): DocEntry[] {
  const placed = docs.flatMap(({ path, scene }) => placesIn(scene, path, resolve).map((to) => [to, path] as const))
  return docs.map(({ path, scene }) => ({
    path,
    title: scene.title,
    note: scene.note,
    states: Object.keys(scene.states ?? {}).length,
    slots: [scene.slots ?? [], ...Object.values(scene.states ?? {}).map((s) => s.add?.slots ?? [])].flat().length,
    usedBy: [...new Set(placed.filter(([to]) => to === path).map(([, by]) => by))],
    tower3d: tower3d.has(path),
  }))
}
