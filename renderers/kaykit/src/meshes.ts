import * as THREE from 'three'
import type { Vec3 } from './catalog.ts'

/**
 * Every model's geometry, packed by the build into one buffer: floats (positions, normals, UVs) then indices. A node
 * keeps glTF's local TRS so a part can be posed by name; a primitive is a span of each array, `glass` when it samples
 * no atlas (the one transparent material in the bundle).
 */
export type Span = [start: number, length: number]
export type MeshNode = {
  name: string
  parent: number
  t: Vec3
  r: [number, number, number, number]
  s: Vec3
  prims: { position: Span; normal: Span; uv: Span; index: Span; glass: boolean }[]
}
export type MeshIndex = Record<string, MeshNode[]>

/** A model's nodes with their geometries made: what the drawing instances. */
export type ModelMesh = { nodes: (Omit<MeshNode, 'prims'> & { prims: { geometry: THREE.BufferGeometry; glass: boolean }[] })[] }

export async function loadMeshes(base: string): Promise<Map<string, ModelMesh>> {
  const [index, bin] = await Promise.all([
    fetch(`${base}/meshes.json`).then((r) => r.json() as Promise<MeshFile>),
    fetch(`${base}/meshes.bin`).then((r) => r.arrayBuffer()),
  ])
  return meshesFrom(index, bin)
}

/** `meshes.json` as written by the build: how many floats lead the buffer, and each model's nodes. */
export type MeshFile = { floats: number; models: MeshIndex }

/** Every model's geometry from the packed buffer `bin` (floats, then indices) and its index. */
export function meshesFrom(index: MeshFile, bin: ArrayBuffer): Map<string, ModelMesh> {
  const floats = new Float32Array(bin, 0, index.floats)
  const ints = new Uint32Array(bin, index.floats * 4)
  const slice = <T extends Float32Array | Uint32Array>(arr: T, [start, length]: Span) => arr.subarray(start, start + length) as T
  const out = new Map<string, ModelMesh>()
  for (const [id, nodes] of Object.entries(index.models)) {
    out.set(id, {
      nodes: nodes.map((n) => ({
        ...n,
        prims: n.prims.map((p) => {
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.BufferAttribute(slice(floats, p.position), 3))
          g.setAttribute('normal', new THREE.BufferAttribute(slice(floats, p.normal), 3))
          g.setAttribute('uv', new THREE.BufferAttribute(slice(floats, p.uv), 2))
          g.setIndex(new THREE.BufferAttribute(slice(ints, p.index), 1))
          return { geometry: g, glass: p.glass }
        }),
      })),
    })
  }
  return out
}
