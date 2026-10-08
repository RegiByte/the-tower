import type { Box } from './layout.ts'

export const RADIUS = 0.3

const touches = (b: Box, x: number, z: number) => {
  const nx = Math.min(Math.max(x, b.minX), b.maxX)
  const nz = Math.min(Math.max(z, b.minZ), b.maxZ)
  return (x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS
}

const blocked = (boxes: Box[], x: number, z: number) => boxes.some((b) => touches(b, x, z))

/** The free part of a straight move from (x, z) by (dx, dz), found by halving: as far as the body fits. */
function slide(boxes: Box[], x: number, z: number, dx: number, dz: number) {
  if (!blocked(boxes, x + dx, z + dz)) return { x: x + dx, z: z + dz }
  let free = 0
  let stop = 1
  for (let i = 0; i < 10; i++) {
    const k = (free + stop) / 2
    if (blocked(boxes, x + dx * k, z + dz * k)) stop = k
    else free = k
  }
  return { x: x + dx * free, z: z + dz * free }
}

/**
 * A step by (dx, dz) from (x, z), an axis at a time so a walker brushing a wall slides along it. A walker already
 * overlapping something (put there by a rebuilt floor) moves freely until it's clear.
 */
export function step(boxes: Box[], x: number, z: number, dx: number, dz: number) {
  if (blocked(boxes, x, z)) return { x: x + dx, z: z + dz }
  const along = slide(boxes, x, z, dx, 0)
  return slide(boxes, along.x, along.z, 0, dz)
}
