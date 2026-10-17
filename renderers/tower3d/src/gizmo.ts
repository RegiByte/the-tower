import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/** What the gizmo keeps of its own state, read here to turn its plane handles. */
type Gizmo = THREE.Object3D & {
  eye: THREE.Vector3
  worldQuaternion: THREE.Quaternion
  mode: 'translate' | 'rotate' | 'scale'
  space: 'world' | 'local'
  gizmo: Record<string, THREE.Object3D>
  picker: Record<string, THREE.Object3D>
}

const PLANES: Record<string, ('x' | 'y' | 'z')[]> = { XY: ['x', 'y'], YZ: ['y', 'z'], XZ: ['x', 'z'] }
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }

/**
 * Three's TransformControls stands its two-axis handles on the +x, +y and +z side of the object, whatever side it is
 * seen from. These controls mirror each plane handle, drawn and picked, along every axis that points away from the
 * camera, so the handles are always on the side you look from.
 */
export function transformControls(camera: THREE.Camera, canvas: HTMLElement): TransformControls {
  const controls = new TransformControls(camera, canvas)
  const gizmo = (controls as unknown as { _gizmo: Gizmo })._gizmo
  const update = gizmo.updateMatrixWorld.bind(gizmo)
  const axis = new THREE.Vector3()
  gizmo.updateMatrixWorld = (force?: boolean) => {
    update(force)
    if (gizmo.mode === 'rotate') return
    const turn = gizmo.mode === 'scale' || gizmo.space === 'local' ? gizmo.worldQuaternion : new THREE.Quaternion()
    const sign = (a: 'x' | 'y' | 'z') => (axis.copy(AXES[a]).applyQuaternion(turn).dot(gizmo.eye) < 0 ? -1 : 1)
    for (const group of [gizmo.gizmo[gizmo.mode], gizmo.picker[gizmo.mode]]) {
      for (const handle of group.children) {
        const plane = PLANES[handle.name]
        if (!plane) continue
        for (const a of plane) handle.scale[a] *= sign(a)
        handle.updateMatrixWorld(true)
      }
    }
  }
  return controls
}
