import * as THREE from 'three'
import { makeLayer, type KitLayer } from './kit.ts'
import { scene } from './stage.ts'
import { s, type State } from './state.ts'

/**
 * What stands on one level, under one group in building coordinates: its desks, stations, notes, pictures, walls,
 * boards, guests, cats and leavers, and its KayKit zones and dressing, in batches of their own. A level is drawn, or
 * not, as a whole.
 */
export type LevelRoot = { group: THREE.Group; zones: KitLayer; dressing: KitLayer }

/** Level `index`'s root, made on first use. */
export function onLevel(index: number): LevelRoot {
  while (s.levels.length <= index) {
    const root = { group: new THREE.Group(), zones: makeLayer(), dressing: makeLayer() }
    root.group.add(root.zones.group, root.dressing.group)
    scene.add(root.group)
    s.levels.push(root)
  }
  return s.levels[index]
}

/** Puts `o` under level `index`'s root, out of wherever it hung before. */
export function hangOn(index: number, o: THREE.Object3D) {
  const { group } = onLevel(index)
  if (o.parent !== group) group.add(o)
}

/**
 * The levels drawn. The building is a box whose slabs close off each level, and a ray that leaves a box never comes
 * back in, so from inside only your own level can be seen; riding, the levels the car passes, whose landing doors go
 * by its open front; from outside, over the city or flying the camera there and back, all of them.
 */
export function levelsShown(v: Pick<State, 'view' | 'ride' | 'flight' | 'me'>): (index: number) => boolean {
  if (v.view === 'overview' || v.flight) return () => true
  if (v.ride) {
    const [low, high] = [Math.min(v.ride.from, v.ride.to), Math.max(v.ride.from, v.ride.to)]
    return (i) => i >= low && i <= high
  }
  return (i) => i === v.me.level
}

/** Shows the levels `shown` keeps and hides the rest: what stands on each, and the building's own part of it. */
export function showLevels(shown: (index: number) => boolean) {
  s.levels.forEach((root, i) => (root.group.visible = shown(i)))
  s.world?.levels.forEach((g, i) => (g.visible = shown(i)))
}
