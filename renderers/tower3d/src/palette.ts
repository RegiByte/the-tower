import { mixOklab } from '../../../src/shared/design.ts'

/** The color of a project that names none. */
export const NO_COLOR = '#8a9ab8'

const probe = document.createElement('canvas').getContext('2d')!
const hexes = new Map<string, string>()

/** Any CSS colour as `#rrggbb`, read back from a canvas: the config may name a project's colour in any CSS form. */
export function cssHex(color: string) {
  if (!hexes.has(color)) {
    probe.fillStyle = '#000'
    probe.fillStyle = color
    hexes.set(color, probe.fillStyle as string)
  }
  return hexes.get(color)!
}

/** A floor's project colour as `#rrggbb`. */
export const tintOf = (floor: { color?: string }) => cssHex(floor.color ?? NO_COLOR)

/** The warm neutrals every floor is built of, before its project's share is mixed in. */
const NEUTRAL = { carpet: '#4b473e', wall: '#6e6858', ceiling: '#cfc6af', facing: '#8b8471', enamel: '#28322f', light: '#fff1d0' }

/** How much of the project colour each surface takes, in percent: a whisper on the planes, all of it on the accents. */
const SHARE = { carpet: 8, wall: 5, ceiling: 3, facing: 6, rug: 85, spandrel: 70, light: 6 }

/**
 * A floor's colors from its project's `#rrggbb`: large planes are warm neutrals with a whisper of the project, and the
 * project colour itself is spent on a few countable accents (the landing rug, the band between storeys, the glowing
 * lines), so the workers' status colours stay the loudest thing on the floor.
 */
export function floorPalette(tint: string) {
  const mix = (share: number, neutral: string) => mixOklab(tint, share, neutral)
  return {
    band: tint,
    carpet: mix(SHARE.carpet, NEUTRAL.carpet),
    rug: mix(SHARE.rug, NEUTRAL.carpet),
    wall: mix(SHARE.wall, NEUTRAL.wall),
    ceiling: mix(SHARE.ceiling, NEUTRAL.ceiling),
    facing: mix(SHARE.facing, NEUTRAL.facing),
    spandrel: mix(SHARE.spandrel, NEUTRAL.enamel),
    light: mix(SHARE.light, NEUTRAL.light),
  }
}

export type FloorPalette = ReturnType<typeof floorPalette>
