import * as THREE from 'three'
import { makeLayer, type KitLayer } from './kit.ts'
import type { Motion, View } from './app.ts'
import type { World as Built } from './world.ts'

/**
 * What stands on one level, under one group in building coordinates: its desks, stations, notes, pictures, walls,
 * boards, guests, cats and leavers, and its KayKit zones and dressing, in batches of their own. A level is drawn, or
 * not, as a whole.
 */
export type LevelRoot = { group: THREE.Group; zones: KitLayer; dressing: KitLayer }

/** Level `index`'s root in `roots`, the roots by level index, made on first use and added to `scene`. */
export function onLevel(roots: LevelRoot[], scene: THREE.Scene, index: number): LevelRoot {
  while (roots.length <= index) {
    const root = { group: new THREE.Group(), zones: makeLayer(), dressing: makeLayer() }
    root.group.add(root.zones.group, root.dressing.group)
    scene.add(root.group)
    roots.push(root)
  }
  return roots[index]
}

/** Puts `o` under level `index`'s root in `roots`, out of wherever it hung before. */
export function hangOn(roots: LevelRoot[], scene: THREE.Scene, index: number, o: THREE.Object3D) {
  const { group } = onLevel(roots, scene, index)
  if (o.parent !== group) group.add(o)
}

/** The level `o` stands on: whose root in `roots` it hangs on. */
export const levelOf = (roots: LevelRoot[], o: THREE.Object3D) => roots.findIndex((root) => root.group === o.parent)

/**
 * The levels drawn. The building is a box whose slabs close off each level, and a ray that leaves a box never comes
 * back in, so from inside only your own level can be seen; riding, the levels the car passes, whose landing doors go
 * by its open front; from outside, over the city or flying the camera there and back, all of them.
 */
export function levelsShown(view: View, { ride, flight }: Pick<Motion, 'ride' | 'flight'>, level: number): (index: number) => boolean {
  if (view === 'overview' || flight) return () => true
  if (ride) {
    const [low, high] = [Math.min(ride.from, ride.to), Math.max(ride.from, ride.to)]
    return (i) => i >= low && i <= high
  }
  return (i) => i === level
}

/** Shows the levels `shown` keeps and hides the rest: what stands on each (`roots`), and the building's own part of it (`built`). */
export function showLevels(roots: LevelRoot[], built: Built | undefined, shown: (index: number) => boolean) {
  roots.forEach((root, i) => (root.group.visible = shown(i)))
  built?.levels.forEach((g, i) => (g.visible = shown(i)))
}
