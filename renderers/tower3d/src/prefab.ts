import { turnXZ } from '../../kaykit/src/catalog.ts'
import type { Box } from './layout.ts'

/** What a prefab's models in a list of its states are kept under: the names in any order. */
export const stateKey = (names: string[]) => names.toSorted().join('+')

/** A footprint in a prefab's frame, in level space once the prefab stands at (x, z), stretched, turned by `turn`. */
export const turnBox = (b: Box, x: number, z: number, turn: number, stretch = 1): Box => {
  const corners = [[b.minX * stretch, b.minZ], [b.minX * stretch, b.maxZ], [b.maxX * stretch, b.minZ], [b.maxX * stretch, b.maxZ]].map(([cx, cz]) => turnXZ(cx, cz, turn))
  const xs = corners.map(([cx]) => x + cx)
  const zs = corners.map(([, cz]) => z + cz)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}
