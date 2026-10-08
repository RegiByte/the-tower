import type { Catalog } from '../../kaykit/src/catalog.ts'
import type { MeshFile } from '../../kaykit/src/meshes.ts'
import type { Prefabs } from './zones.ts'

/**
 * The office's KayKit set as one file, embedded in the bundle (a framed renderer has an opaque origin and fetches
 * nothing from beside its page): a little-endian u32 with the header's length, the header as JSON padded to 4 bytes,
 * the packed meshes (floats, then indices), then each atlas's PNG in the header's order.
 */
export type KitFile = {
  catalog: Catalog
  prefabs: Prefabs
  meshes: MeshFile & { bytes: number }
  atlases: { key: string; bytes: number }[]
}

/** Where each part of a kit file starts, from its header's length. */
export function kitLayout(headerBytes: number, header: KitFile) {
  const meshes = 4 + headerBytes
  let at = meshes + header.meshes.bytes
  const atlases = header.atlases.map(({ key, bytes }) => ((at += bytes), { key, from: at - bytes, to: at }))
  return { meshes: { from: meshes, to: meshes + header.meshes.bytes }, atlases }
}
