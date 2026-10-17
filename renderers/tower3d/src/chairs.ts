import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * The meeting rooms' empty chairs, drawn a level at a time: the desk model's chair merged into one geometry per
 * material, each an instanced mesh holding every chair on the level, so a level's chairs cost a draw call per material
 * in each pass however many stand.
 */

/** A chair on its level: where it stands, in building coordinates, and the way it faces (degrees about +y, 0 facing +z). */
export type ChairAt = { x: number; y: number; z: number; turn: number }

/** The chair's meshes merged by material, in the chair's own frame. */
export type ChairKit = { geometry: THREE.BufferGeometry; material: THREE.Material }[]

/** A level's chairs: its instanced meshes, one per material of the kit, under `group`. */
export type Chairs = { group: THREE.Group; meshes: THREE.InstancedMesh[] }

export function chairKit(chair: THREE.Object3D): ChairKit {
  chair.updateWorldMatrix(true, true)
  const toChair = chair.matrixWorld.clone().invert()
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  chair.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const geometry = o.geometry.clone().applyMatrix4(toChair.clone().multiply(o.matrixWorld))
    byMaterial.set(o.material, [...(byMaterial.get(o.material) ?? []), geometry])
  })
  return [...byMaterial].map(([material, parts]) => {
    const geometry = mergeGeometries(parts)
    if (!geometry) throw new Error(`the chair's ${material.name} meshes do not share their attributes: export them alike in models/desk.py`)
    geometry.userData.shared = true
    return { geometry, material }
  })
}

export const makeChairs = (): Chairs => ({ group: new THREE.Group(), meshes: [] })

const DEG = Math.PI / 180

/** Stands a level's chairs at `at`, making room for twice as many when more stand than its meshes hold. */
export function placeChairs(chairs: Chairs, kit: ChairKit, at: ChairAt[]) {
  if (at.length > (chairs.meshes[0]?.instanceMatrix.count ?? 0)) {
    for (const mesh of chairs.meshes) (mesh.removeFromParent(), mesh.dispose())
    chairs.meshes = kit.map(({ geometry, material }) => new THREE.InstancedMesh(geometry, material, Math.max(16, at.length * 2)))
    chairs.group.add(...chairs.meshes)
  }
  const frame = new THREE.Matrix4()
  at.forEach(({ x, y, z, turn }, i) => {
    frame.makeRotationY(turn * DEG).setPosition(x, y, z)
    for (const mesh of chairs.meshes) mesh.setMatrixAt(i, frame)
  })
  for (const mesh of chairs.meshes) {
    mesh.count = at.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }
}
