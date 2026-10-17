/**
 * Quaternius's Universal Animation Library retargeted onto KayKit's Rig_Medium, for the character packer
 * (scripts/tower3d-characters.ts). Both skeletons bind in a T-pose facing +z: each Rig_Medium limb is first aimed along
 * UAL's bind pose, then every frame (30 fps) a mapped bone takes the world rotation its UAL bone takes away from that
 * bind, and the hips move by UAL's pelvis, scaled by the ratio of the hips' heights. UAL's spine_02, neck_01 and
 * clavicles fold into their children's world rotations; its fingers have no KayKit bone to go to.
 */
import * as THREE from 'three'
import type { Glb, Json } from './glb.ts'

/** Rig_Medium's bones (three.js names) and the UAL bone each takes its world rotation from. */
const UAL_MAP: Record<string, string> = {
  hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', head: 'Head',
  upperarml: 'upperarm_l', lowerarml: 'lowerarm_l', wristl: 'hand_l',
  upperarmr: 'upperarm_r', lowerarmr: 'lowerarm_r', wristr: 'hand_r',
  upperlegl: 'thigh_l', lowerlegl: 'calf_l', footl: 'foot_l', toesl: 'ball_l',
  upperlegr: 'thigh_r', lowerlegr: 'calf_r', footr: 'foot_r', toesr: 'ball_r',
}
/** Each aimed bone's child along its segment, on either skeleton, in the order they are aimed (parents first). */
const SEGMENT: Record<string, [string, string]> = {
  upperarml: ['lowerarml', 'lowerarm_l'], lowerarml: ['wristl', 'hand_l'], upperarmr: ['lowerarmr', 'lowerarm_r'], lowerarmr: ['wristr', 'hand_r'],
  upperlegl: ['lowerlegl', 'calf_l'], lowerlegl: ['footl', 'foot_l'], upperlegr: ['lowerlegr', 'calf_r'], lowerlegr: ['footr', 'foot_r'],
  footl: ['toesl', 'ball_l'], footr: ['toesr', 'ball_r'],
}
const FPS = 30

const SIZES: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }
function floatsOf(g: Glb, i: number) {
  const a = g.json.accessors[i]
  const at = g.bin.byteOffset + (g.json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0)
  return new Float32Array(g.bin.buffer.slice(at, at + a.count * SIZES[a.type] * 4))
}

export const sanitized = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name)

/** A file's node tree as three.js objects named as three.js names them, under one group for its scene. */
function treeOf(g: Glb) {
  const objects = g.json.nodes.map((n: Json) => {
    const o = new THREE.Object3D()
    o.name = sanitized(n.name ?? '')
    if (n.translation) o.position.fromArray(n.translation)
    if (n.rotation) o.quaternion.fromArray(n.rotation)
    if (n.scale) o.scale.fromArray(n.scale)
    return o
  })
  g.json.nodes.forEach((n: Json, i: number) => (n.children ?? []).forEach((c: number) => objects[i].add(objects[c])))
  const root = new THREE.Group()
  for (const r of g.json.scenes[0].nodes) root.add(objects[r])
  root.updateMatrixWorld(true)
  return { root, objects: objects as THREE.Object3D[] }
}

/** UAL's skeleton in the pose its mannequin is bound in, from its inverse binds: the file's nodes hold a clip's first frame. */
function bindPose(g: Glb) {
  const tree = treeOf(g)
  const skin = g.json.skins[0]
  const inverses = floatsOf(g, skin.inverseBindMatrices)
  const joints: THREE.Object3D[] = skin.joints.map((j: number) => tree.objects[j])
  joints.forEach((b, k) => b.matrixWorld.fromArray(inverses, k * 16).invert())
  for (const b of joints) {
    const local = joints.includes(b.parent!) ? b.parent!.matrixWorld.clone().invert().multiply(b.matrixWorld) : b.matrixWorld.clone()
    local.decompose(b.position, b.quaternion, b.scale)
  }
  tree.root.updateMatrixWorld(true)
  return tree.root
}

function clipOf(g: Glb, name: string) {
  const clip = g.json.animations.find((a: Json) => a.name === name)
  if (!clip) throw new Error(`UAL holds no clip ${name}`)
  const PATHS: Record<string, string> = { translation: 'position', rotation: 'quaternion', scale: 'scale' }
  const tracks = clip.channels.map((c: Json) => {
    const s = clip.samplers[c.sampler]
    if (s.interpolation !== 'LINEAR') throw new Error(`${name} interpolates ${s.interpolation}ly`)
    const track = c.target.path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
    return new track(`${sanitized(g.json.nodes[c.target.node].name)}.${PATHS[c.target.path]}`, floatsOf(g, s.input), floatsOf(g, s.output))
  })
  return new THREE.AnimationClip(name, -1, tracks)
}

const worldQ = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion())
const worldP = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())

function aimAlong(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3) {
  bone.updateWorldMatrix(true, true)
  const turn = new THREE.Quaternion().setFromUnitVectors(worldP(child).sub(worldP(bone)).normalize(), dir.clone().normalize())
  bone.quaternion.copy(worldQ(bone.parent!).invert().multiply(turn).multiply(worldQ(bone)))
  bone.updateWorldMatrix(false, true)
}

/** A clip baked onto the rig: its key times, and per bone (three.js names) and path, its keys. */
export type Baked = { name: string; tracks: { bone: string; path: 'translation' | 'rotation' | 'scale'; times: Float32Array; values: Float32Array }[] }

/**
 * `names` of `ual` retargeted onto the skeleton under `rig` (a file whose scene root is Rig_Medium's root), keyed on
 * every bone, as KayKit's clips are: a bone UAL doesn't move holds its rest.
 */
export function retargetUal(ual: Glb, rig: Glb, names: readonly string[]): Baked[] {
  const src = bindPose(ual)
  const tgt = treeOf(rig).root.children[0]
  const named = (root: THREE.Object3D, name: string) => {
    const o = root.getObjectByName(name)
    if (!o) throw new Error(`no bone ${name}`)
    return o
  }
  for (const [t, [tc, sc]] of Object.entries(SEGMENT)) {
    aimAlong(named(tgt, t), named(tgt, tc), worldP(named(src, sc)).sub(worldP(named(src, UAL_MAP[t]))))
  }
  tgt.updateMatrixWorld(true)
  const bones: THREE.Object3D[] = []
  tgt.traverse((b) => b !== tgt && bones.push(b))
  const rest = new Map(bones.map((b) => [b, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }]))
  const tgtRef = new Map(bones.map((b) => [b, worldQ(b)]))
  const srcRef = new Map(bones.filter((b) => UAL_MAP[b.name]).map((b) => [b, worldQ(named(src, UAL_MAP[b.name]))]))
  const pelvis = named(src, 'pelvis')
  const hips = named(tgt, 'hips')
  const hipsAt = { src: worldP(pelvis), tgt: worldP(hips) }
  const k = hipsAt.tgt.y / hipsAt.src.y

  return names.map((name) => {
    const clip = clipOf(ual, name)
    const mixer = new THREE.AnimationMixer(src)
    mixer.clipAction(clip).play()
    const frames = Math.max(1, Math.round(clip.duration * FPS))
    const times = Float32Array.from({ length: frames + 1 }, (_, f) => (f / frames) * clip.duration)
    const rotations = new Map<THREE.Object3D, number[]>()
    const hipsKeys: number[] = []
    for (const t of times) {
      mixer.setTime(t)
      src.updateMatrixWorld(true)
      const world = new Map<THREE.Object3D, THREE.Quaternion>([[tgt, worldQ(tgt)]])
      for (const b of bones) {
        const parent = world.get(b.parent!)!
        const ref = srcRef.get(b)
        const w = ref ? worldQ(named(src, UAL_MAP[b.name])).multiply(ref.clone().invert()).multiply(tgtRef.get(b)!) : parent.clone().multiply(rest.get(b)!.quaternion)
        if (ref) rotations.set(b, [...(rotations.get(b) ?? []), ...parent.clone().invert().multiply(w).toArray()])
        world.set(b, w)
      }
      const at = hipsAt.tgt.clone().add(worldP(pelvis).sub(hipsAt.src).multiplyScalar(k))
      hipsKeys.push(...hips.parent!.worldToLocal(at).toArray())
    }
    const ends = Float32Array.from([0, clip.duration])
    const keyed = (values: number[]) => ({ times, values: Float32Array.from(values) })
    const held = (v: THREE.Vector3 | THREE.Quaternion) => ({ times: ends, values: Float32Array.from([...v.toArray(), ...v.toArray()]) })
    const tracks: Baked['tracks'] = bones.flatMap((b) => {
      const r = rest.get(b)!
      const rotation = rotations.get(b)
      return [
        { bone: b.name, path: 'translation' as const, ...(b === hips ? keyed(hipsKeys) : held(r.position)) },
        { bone: b.name, path: 'rotation' as const, ...(rotation ? keyed(rotation) : held(r.quaternion)) },
        { bone: b.name, path: 'scale' as const, ...held(r.scale) },
      ]
    })
    return { name, tracks }
  })
}
