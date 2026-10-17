/**
 * Vendors the KayKit characters Tower 3D makes its workers of into renderers/tower3d/kaykit/Characters, the GLBs the
 * bundle embeds:
 *
 *   adventurers.glb   every part the contract names (`ADVENTURER_PARTS` in renderers/tower3d/src/contract.ts) from
 *                     the KayKit Adventurers 1.0, on one skeleton: bodies, heads, helms, capes and gear, each in its
 *                     adventurer's atlas, without the clips each file embeds
 *   rig_medium.glb    the clips the contract names (`CLIPS`) on Rig_Medium's bones, without its mannequin: KayKit
 *                     Character Animations 1.1's (`KAYKIT_CLIPS`), and Quaternius's Universal Animation Library's
 *                     (`UAL_CLIPS`) retargeted onto Rig_Medium (scripts/ual.ts), as `UAL_<name>`
 *   medium.glb        the parts of the contract's other Rig_Medium characters (`KAYKIT`), skinned to adventurers.glb's
 *                     joints, with their atlases and colourways
 *   large.glb         the parts of its Rig_Large characters, on the first one's skeleton, with the Clanker family's
 *                     props and colourways (`CLANKER_PROPS`, `CLANKER_FAMILY`)
 *   rig_large.glb     the clips of rig_medium.glb on that skeleton: rotations as they are, every translation moved
 *                     from Rig_Medium's rest to the large rest by the ratio of the hips' heights
 *
 *   tsx scripts/tower3d-characters.ts <adventurers> <animations> <skeletons> <series5> <clankers> <ual>
 *
 * `<adventurers>` holds Knight.glb, Mage.glb, Rogue.glb, Rogue_Hooded.glb, Barbarian.glb and LICENSE.txt (the pack's
 * GitHub release); `<animations>` the Rig_Medium_*.glb of the animations pack (itch.io); `<skeletons>` the KayKit
 * Skeletons 1.1 folder, `<series5>` the KayKit Mystery Monthly Series 5 folder, each with its License.txt; `<clankers>`
 * the Clanker family's GLBs, one per variant (sentinel.glb …), generated from the Clanker; `<ual>` the unpacked
 * `Universal Animation Library[Standard].zip` (Quaternius), its Unreal-Godot/UAL1_Standard.glb and License.txt. Every
 * pack is CC0. Every
 * character of a rig is skinned to the same joints, by name, with the same inverse binds (to 1e-5): checked, since a
 * part moves onto the rig's one skeleton.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ADVENTURER_PARTS, ATLAS_NAMES, CLANKER_FAMILY, CLANKER_PROPS, COLOURWAYS, KAYKIT, KAYKIT_CLIPS, UAL_CLIPS, bodyOf, glowOf, textureOf, type RigKind } from '../renderers/tower3d/src/contract.ts'
import { readGlb, writeGlb, writer, type Glb, type Json } from './glb.ts'
import { retargetUal, sanitized } from './ual.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const OUT = path.join(REPO, 'renderers/tower3d/kaykit/Characters')
const [adventurers, animations, skeletons, series5, clankers, ual] = process.argv.slice(2).map((p) => path.resolve(p))
if (!ual) throw new Error('tsx scripts/tower3d-characters.ts <adventurers> <animations> <skeletons> <series5> <clankers> <ual>')
const PACKS: Record<string, string> = { skeletons, series5 }

const parentsOf = (json: Json) => {
  const parent = new Map<number, number>()
  json.nodes.forEach((n: Json, i: number) => (n.children ?? []).forEach((c: number) => parent.set(c, i)))
  return parent
}
const nodeNamed = (json: Json, name: string) => json.nodes.findIndex((n: Json) => n.name === name)

/** The adventurers' parts on the first one's skeleton, one material per atlas. */
function packAdventurers() {
  const files = ['Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian'].map((n) => readGlb(path.join(adventurers, `${n}.glb`)))
  const base = files[0]
  const jointsOf = (g: Glb) => g.json.skins[0].joints.map((j: number) => g.json.nodes[j].name).join(' ')
  const bindsOf = (g: Glb) => {
    const a = g.json.accessors[g.json.skins[0].inverseBindMatrices]
    const v = g.json.bufferViews[a.bufferView]
    const bytes = g.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }
  for (const g of files) {
    if (jointsOf(g) !== jointsOf(base)) throw new Error('the adventurers are skinned to different joints')
    if (bindsOf(g).some((x, i) => Math.abs(x - bindsOf(base)[i]) > 1e-5)) throw new Error('the adventurers are bound in different poses')
  }

  const bones = base.json.nodes.flatMap((n: Json, i: number) => (n.mesh === undefined ? [i] : []))
  const index = new Map<number, number>(bones.map((b: number, k: number) => [b, k]))
  const skeleton = bones.map((b: number) => {
    const n = base.json.nodes[b]
    return { ...n, children: (n.children ?? []).filter((c: number) => index.has(c)).map((c: number) => index.get(c)) }
  })
  const json: Json = { asset: { version: '2.0', generator: 'tower3d-characters' }, scene: 0, nodes: skeleton, meshes: [], materials: [], textures: [], samplers: base.json.samplers }
  const out = writer(json)
  json.skins = [{ joints: base.json.skins[0].joints.map((j: number) => index.get(j)), inverseBindMatrices: out.accessor(base, base.json.skins[0].inverseBindMatrices) }]
  const rig = nodeNamed(json, 'Rig')
  json.scenes = [{ nodes: [rig] }]
  if (base.json.scenes[0].nodes.join() !== String(bones[rig])) throw new Error('the adventurers stand on a root other than Rig')

  const materials = new Map<string, number>()
  const materialOf = (src: Glb, i: number) => {
    const m = src.json.materials[i]
    if (!materials.has(m.name)) {
      const texture = src.json.textures[m.pbrMetallicRoughness.baseColorTexture.index]
      json.textures.push({ sampler: 0, source: out.image(src, texture.source) })
      json.materials.push({ ...m, pbrMetallicRoughness: { ...m.pbrMetallicRoughness, baseColorTexture: { index: json.textures.length - 1 } } })
      materials.set(m.name, json.materials.length - 1)
    }
    return materials.get(m.name)!
  }

  for (const name of ADVENTURER_PARTS) {
    const src = files.find((g) => g.json.nodes.some((n: Json) => n.name === name && n.mesh !== undefined))
    if (!src) throw new Error(`no adventurer holds ${name}`)
    const i = nodeNamed(src.json, name)
    const node = src.json.nodes[i]
    const mesh = src.json.meshes[node.mesh]
    json.meshes.push({
      name,
      primitives: mesh.primitives.map((p: Json) => ({
        ...p,
        attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, a]) => [k, out.accessor(src, a as number)])),
        indices: out.accessor(src, p.indices),
        material: materialOf(src, p.material),
      })),
    })
    const parent = nodeNamed(json, src.json.nodes[parentsOf(src.json).get(i)!].name)
    json.nodes.push({ name, mesh: json.meshes.length - 1, skin: node.skin === undefined ? undefined : 0, translation: node.translation, rotation: node.rotation, scale: node.scale })
    json.nodes[parent].children.push(json.nodes.length - 1)
  }
  json.nodes.forEach((n: Json) => n.children?.length === 0 && delete n.children)
  writeGlb(path.join(OUT, 'adventurers.glb'), json, out.bin())
}

/**
 * UAL's sitting clips sit for a human chair, their hips lower than KayKit's: they are moved so their first frame's hips
 * are where Sit_Chair_Idle's are, on the seat every chair's height is measured from.
 */
const SITTING = /^Sitting_/
function reseat(hips: Float32Array, to: Float32Array) {
  const by = [0, 1, 2].map((i) => to[i] - hips[i])
  for (let i = 0; i < hips.length; i++) hips[i] += by[i % 3]
}

/** The contract's clips, KayKit's from every Rig_Medium file and UAL's baked onto adventurers.glb's bones, aimed at one copy of Rig_Medium's bones. */
function packClips() {
  const files = readdirSync(animations).filter((f) => /^Rig_Medium_.*\.glb$/.test(f)).sort().map((f) => readGlb(path.join(animations, f)))
  const base = files[0]
  const bones = base.json.nodes.flatMap((n: Json, i: number) => (n.mesh === undefined ? [i] : []))
  const index = new Map<number, number>(bones.map((b: number, k: number) => [b, k]))
  const json: Json = {
    asset: { version: '2.0', generator: 'tower3d-characters' },
    scene: 0,
    nodes: bones.map((b: number) => {
      const n = base.json.nodes[b]
      return { ...n, children: n.children?.filter((c: number) => index.has(c)).map((c: number) => index.get(c)), mesh: undefined, skin: undefined }
    }),
    animations: [],
  }
  json.scenes = [{ nodes: base.json.scenes[0].nodes.filter((r: number) => index.has(r)).map((r: number) => index.get(r)) }]
  const out = writer(json)
  for (const name of KAYKIT_CLIPS) {
    const src = files.find((g) => g.json.animations.some((a: Json) => a.name === name))
    if (!src) throw new Error(`no Rig_Medium file holds the clip ${name}`)
    const clip = src.json.animations.find((a: Json) => a.name === name)
    json.animations.push({
      name,
      samplers: clip.samplers.map((s: Json) => ({ ...s, input: out.accessor(src, s.input), output: out.accessor(src, s.output) })),
      channels: clip.channels.map((c: Json) => {
        const node = nodeNamed(json, src.json.nodes[c.target.node].name)
        if (node < 0) throw new Error(`${name} moves ${src.json.nodes[c.target.node].name}, which Rig_Medium lacks`)
        return { ...c, target: { ...c.target, node } }
      }),
    })
  }
  const floats = (count: number, type: string, values: Float32Array, minMax = false) =>
    out.data({ componentType: 5126, count, type, ...(minMax && { min: [values[0]], max: [values.at(-1)] }) }, Buffer.from(values.buffer, values.byteOffset, values.byteLength))
  const nodeOf = new Map<string, number>(json.nodes.map((n: Json, i: number) => [sanitized(n.name), i]))
  const baked = retargetUal(readGlb(path.join(ual, 'Unreal-Godot/UAL1_Standard.glb')), readGlb(path.join(OUT, 'adventurers.glb')), UAL_CLIPS)
  const sitter = files.find((g) => g.json.animations.some((a: Json) => a.name === 'Sit_Chair_Idle'))!
  const sit = sitter.json.animations.find((a: Json) => a.name === 'Sit_Chair_Idle')
  const sitHips = sit.channels.find((c: Json) => sitter.json.nodes[c.target.node].name === 'hips' && c.target.path === 'translation')
  const seatedHips = floatsOf(sitter, sit.samplers[sitHips.sampler].output).subarray(0, 3)
  for (const { name, tracks } of baked) {
    if (SITTING.test(name)) reseat(tracks.find((t) => t.bone === 'hips' && t.path === 'translation')!.values, seatedHips)
    const onRig = tracks.filter((t) => nodeOf.has(t.bone))
    json.animations.push({
      name: `UAL_${name}`,
      samplers: onRig.map((t) => ({ input: floats(t.times.length, 'SCALAR', t.times, true), output: floats(t.times.length, t.path === 'rotation' ? 'VEC4' : 'VEC3', t.values), interpolation: 'LINEAR' })),
      channels: onRig.map((t, i) => ({ sampler: i, target: { node: nodeOf.get(t.bone), path: t.path } })),
    })
  }
  json.nodes.forEach((n: Json) => n.children?.length === 0 && delete n.children)
  writeGlb(path.join(OUT, 'rig_medium.glb'), json, out.bin())
}

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]))
function fileNamed(dir: string, name: string) {
  const file = filesUnder(dir).find((f) => path.basename(f) === name)
  if (!file) throw new Error(`no ${name} under ${dir}`)
  return file
}

const SIZES: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }
function floatsOf(g: Glb, i: number) {
  const a = g.json.accessors[i]
  const at = g.bin.byteOffset + (g.json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0)
  return new Float32Array(g.bin.buffer.slice(at, at + a.count * SIZES[a.type] * 4))
}
const bindsByName = (g: Glb) => {
  const all = floatsOf(g, g.json.skins[0].inverseBindMatrices)
  return new Map<string, Float32Array>(g.json.skins[0].joints.map((j: number, k: number) => [g.json.nodes[j].name, all.subarray(k * 16, k * 16 + 16)]))
}

/** A file's bones (its nodes without meshes), reindexed, its root named Rig, and the joints its skin binds by name. */
function bonesOf(g: Glb) {
  const bones: number[] = g.json.nodes.flatMap((n: Json, i: number) => (n.mesh === undefined ? [i] : []))
  const index = new Map<number, number>(bones.map((b, k) => [b, k]))
  const root = g.json.scenes[0].nodes.find((r: number) => index.has(r))
  const nodes = bones.map((b) => {
    const n = g.json.nodes[b]
    return { name: b === root ? 'Rig' : n.name, translation: n.translation, rotation: n.rotation, scale: n.scale, children: (n.children ?? []).filter((c: number) => index.has(c)).map((c: number) => index.get(c)) }
  })
  return { nodes, root: index.get(root)!, joints: g.json.skins[0].joints.map((j: number) => g.json.nodes[j].name) as string[] }
}

/** An accessor's bytes, tightly packed, from an interleaved buffer view too. */
function bytesOf(src: Glb, i: number) {
  const a = src.json.accessors[i]
  const v = src.json.bufferViews[a.bufferView]
  const at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType as number]! * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]
  if (!v.byteStride || v.byteStride === size) return src.bin.subarray(at, at + a.count * size)
  return Buffer.concat(Array.from({ length: a.count }, (_, n) => src.bin.subarray(at + n * v.byteStride, at + n * v.byteStride + size)))
}

/** An accessor copied as its bytes, tightly packed (`bytesOf`). */
const copied = (out: ReturnType<typeof writer>, src: Glb, i: number) => {
  const { componentType, normalized, count, type, min, max } = src.json.accessors[i]
  return out.data({ componentType, normalized, count, type, min, max }, bytesOf(src, i))
}

/** A skinned primitive's joint indices, from its file's skin to the packed one's (`remap`, by position in the file's). */
function remapped(src: Glb, i: number, remap: number[]) {
  const a = src.json.accessors[i]
  const v = src.json.bufferViews[a.bufferView]
  const size = a.componentType === 5121 ? 1 : 2
  const at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const stride = v.byteStride ?? size * 4
  const bytes = Buffer.alloc(a.count * 4 * size)
  for (let n = 0; n < a.count; n++) {
    for (let k = 0; k < 4; k++) {
      const from = at + n * stride + k * size
      const j = remap[size === 1 ? src.bin.readUInt8(from) : src.bin.readUInt16LE(from)]
      if (size === 1) bytes.writeUInt8(j, n * 4 + k)
      else bytes.writeUInt16LE(j, (n * 4 + k) * 2)
    }
  }
  return bytes
}

/**
 * Skinned primitives of one file packed as one: each attribute's vertices one after another (joints remapped), indices
 * moved past the vertices before them.
 */
function joined(out: ReturnType<typeof writer>, src: Glb, primitives: Json[], remap: number[]) {
  const counts = primitives.map((p) => src.json.accessors[p.attributes.POSITION].count)
  const attributes = Object.fromEntries(
    Object.keys(primitives[0].attributes).map((name) => {
      const parts = primitives.map((p) => p.attributes[name] as number)
      const first = src.json.accessors[parts[0]]
      const bytes = Buffer.concat(parts.map((i) => (name === 'JOINTS_0' ? remapped(src, i, remap) : bytesOf(src, i))))
      const fields: Json = { componentType: first.componentType, normalized: first.normalized, count: counts.reduce((a, b) => a + b), type: first.type }
      if (name === 'POSITION') {
        const bounds = parts.map((i) => src.json.accessors[i])
        fields.min = [0, 1, 2].map((k) => Math.min(...bounds.map((b) => b.min[k])))
        fields.max = [0, 1, 2].map((k) => Math.max(...bounds.map((b) => b.max[k])))
      }
      return [name, out.data(fields, bytes)]
    }),
  )
  const total = counts.reduce((a, b) => a + b)
  if (total > 65535) throw new Error('joined primitives hold more vertices than 16-bit indices reach')
  const indices: number[] = primitives.flatMap((p, n) => {
    const a = src.json.accessors[p.indices]
    const b = bytesOf(src, p.indices)
    const before = counts.slice(0, n).reduce((x, y) => x + y, 0)
    return Array.from({ length: a.count }, (_, k) => (a.componentType === 5121 ? b.readUInt8(k) : a.componentType === 5123 ? b.readUInt16LE(k * 2) : b.readUInt32LE(k * 4)) + before)
  })
  const bytes = Buffer.alloc(indices.length * 2)
  indices.forEach((x, k) => bytes.writeUInt16LE(x, k * 2))
  return { attributes, indices: out.data({ componentType: 5123, count: indices.length, type: 'SCALAR' }, bytes), mode: primitives[0].mode }
}

/**
 * The contract's KayKit characters on `rig`, from their packs' files, skinned to `base`'s skeleton by joint name: each
 * part a mesh of one material, a glowing primitive split off as `<part>_Glow`, painted in its character's atlas
 * (`<atlas>_texture`) or glowing (`<atlas>_glow`), with every colourway of those atlases beside them, each with its
 * glow: the Clanker family's from its variant's file, any other in the glow of the atlas it repaints. On Rig_Large,
 * the Clanker family's props, rigid on his bones as their files hang them.
 */
function packKaykit(rig: RigKind, base: Glb, file: string) {
  const characters = (Object.keys(KAYKIT) as (keyof typeof KAYKIT)[]).filter((c) => KAYKIT[c].rig === rig)
  const skeleton = bonesOf(base)
  const json: Json = { asset: { version: '2.0', generator: 'tower3d-characters' }, scene: 0, scenes: [{ nodes: [skeleton.root] }], nodes: skeleton.nodes, meshes: [], materials: [], textures: [] }
  const out = writer(json)
  json.skins = [{ joints: skeleton.joints.map((n) => nodeNamed(json, n)), inverseBindMatrices: out.accessor(base, base.json.skins[0].inverseBindMatrices) }]
  const binds = bindsByName(base)
  const materials = new Map<string, number>()
  const materialNamed = (name: string, make: () => Json) => {
    if (!materials.has(name)) {
      json.materials.push({ ...make(), name })
      materials.set(name, json.materials.length - 1)
    }
    return materials.get(name)!
  }
  const painted = (image: number) => {
    json.textures.push({ sampler: 0, source: image })
    return { pbrMetallicRoughness: { baseColorTexture: { index: json.textures.length - 1 }, metallicFactor: 0, roughnessFactor: 0.5 } }
  }
  for (const c of characters) {
    const k = KAYKIT[c]
    const src = readGlb(fileNamed(PACKS[k.pack], `${c}.glb`))
    json.samplers ??= src.json.samplers
    for (const [joint, m] of bindsByName(src)) {
      const ours = binds.get(joint)
      if (!ours) throw new Error(`${c} is skinned to ${joint}, which the ${rig} skeleton lacks`)
      if (m.some((x, i) => Math.abs(x - ours[i]) > 1e-5)) throw new Error(`${c} is bound to ${joint} in another pose than the ${rig} skeleton`)
    }
    const remap = src.json.skins[0].joints.map((j: number) => skeleton.joints.indexOf(src.json.nodes[j].name))
    const parents = parentsOf(src.json)
    const joins: Record<string, readonly string[]> = 'joined' in k ? k.joined : {}
    const wanted = new Set<string>([...bodyOf(c).parts, ...k.head, ...Object.values(k.slots as Record<string, readonly string[]>).flat()].filter((n) => !(n in joins)))
    for (const [i, node] of src.json.nodes.entries() as IterableIterator<[number, Json]>) {
      if (node.mesh === undefined || !wanted.has(node.name)) continue
      src.json.meshes[node.mesh].primitives.forEach((p: Json, n: number) => {
        const m = src.json.materials[p.material]
        const glow = m.name === 'Glow'
        if (n > 0 && !glow) throw new Error(`${node.name} has a second primitive that does not glow`)
        const name = n === 0 ? node.name : `${node.name}_Glow`
        const material = glow
          ? materialNamed(`${k.atlas.toLowerCase()}_glow`, () => ({ emissiveFactor: m.emissiveFactor, pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] } }))
          : materialNamed(textureOf(k.atlas), () => painted(out.image(src, src.json.textures[m.pbrMetallicRoughness.baseColorTexture.index].source)))
        const attributes = Object.fromEntries(
          Object.entries(p.attributes).map(([a, at]) => {
            const i = at as number
            return [a, a === 'JOINTS_0' ? out.data({ componentType: src.json.accessors[i].componentType, count: src.json.accessors[i].count, type: 'VEC4' }, remapped(src, i, remap)) : out.accessor(src, i)]
          }),
        )
        json.meshes.push({ name, primitives: [{ attributes, indices: out.accessor(src, p.indices), material, mode: p.mode }] })
        const parent = node.skin === undefined ? nodeNamed(json, src.json.nodes[parents.get(i)!].name) : skeleton.root
        json.nodes.push({ name, mesh: json.meshes.length - 1, skin: node.skin === undefined ? undefined : 0, translation: node.translation, rotation: node.rotation, scale: node.scale })
        json.nodes[parent].children.push(json.nodes.length - 1)
        wanted.delete(name)
      })
    }
    if (wanted.size) throw new Error(`${c}.glb lacks ${[...wanted].join(', ')}`)
    for (const [name, from] of Object.entries(joins)) {
      const primitives = from.map((n) => {
        const node = src.json.nodes[nodeNamed(src.json, n)]
        if (node?.skin === undefined) throw new Error(`${c}.glb lacks a skinned ${n} to join into ${name}`)
        const mesh = src.json.meshes[node.mesh]
        if (mesh.primitives.length > 1) throw new Error(`${n} has a second primitive, which ${name} does not join`)
        return mesh.primitives[0]
      })
      json.meshes.push({ name, primitives: [{ ...joined(out, src, primitives, remap), material: materialNamed(textureOf(k.atlas), () => { throw new Error(`${name} is joined before ${c}'s atlas is packed`) }) }] })
      json.nodes.push({ name, mesh: json.meshes.length - 1, skin: 0 })
      json.nodes[skeleton.root].children.push(json.nodes.length - 1)
    }
  }
  if (rig === 'large') {
    for (const [name, { node: from, glows }] of Object.entries(CLANKER_PROPS)) {
      const src = readGlb(path.join(clankers, `${from.split('_')[0]}.glb`))
      const i = nodeNamed(src.json, from)
      if (i < 0) throw new Error(`${from.split('_')[0]}.glb lacks ${from}`)
      const node = src.json.nodes[i]
      const primitives: Json[] = src.json.meshes[node.mesh].primitives
      const glowing = primitives.filter((p) => src.json.materials[p.material].name.startsWith('Glow'))
      if (glowing.length !== (glows ? 1 : 0) || primitives.length !== glowing.length + 1) throw new Error(`${from} is not one painted primitive${glows ? ' and one glowing' : ''}`)
      const parent = nodeNamed(json, src.json.nodes[parentsOf(src.json).get(i)!].name)
      for (const p of primitives) {
        const glow = glowing.includes(p)
        const material = glow ? materials.get(glowOf('Clanker'))! : materials.get(textureOf('Clanker'))!
        const attributes = Object.fromEntries(Object.entries(p.attributes).map(([a, at]) => [a, copied(out, src, at as number)]))
        json.meshes.push({ name: glow ? `${name}_Glow` : name, primitives: [{ attributes, material, mode: p.mode }] })
        json.nodes.push({ name: glow ? `${name}_Glow` : name, mesh: json.meshes.length - 1, translation: node.translation, rotation: node.rotation, scale: node.scale })
        json.nodes[parent].children.push(json.nodes.length - 1)
      }
    }
  }
  for (const atlas of ATLAS_NAMES) {
    const of = COLOURWAYS[atlas]
    if (!of || !materials.has(textureOf(of))) continue
    if ((CLANKER_FAMILY as readonly string[]).includes(atlas)) {
      const src = readGlb(path.join(clankers, `${atlas.slice(of.length + 1).toLowerCase()}.glb`))
      const glow = src.json.materials.find((m: Json) => m.name.startsWith('Glow'))
      const image = src.json.bufferViews[src.json.images[0].bufferView]
      materialNamed(textureOf(atlas), () => painted(out.png(textureOf(atlas), src.bin.subarray(image.byteOffset ?? 0, (image.byteOffset ?? 0) + image.byteLength))))
      materialNamed(glowOf(atlas), () => ({ emissiveFactor: glow.emissiveFactor, pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] } }))
      continue
    }
    const pack = PACKS[Object.values(KAYKIT).find((k) => k.atlas === of)!.pack]
    const png = readFileSync(fileNamed(pack, `${textureOf(of)}${atlas.slice(of.length).toLowerCase()}.png`))
    materialNamed(textureOf(atlas), () => painted(out.png(textureOf(atlas), png)))
    if (materials.has(glowOf(of))) materialNamed(glowOf(atlas), () => ({ ...json.materials[materials.get(glowOf(of))!], name: undefined }))
  }
  json.nodes.forEach((n: Json) => n.children?.length === 0 && delete n.children)
  writeGlb(path.join(OUT, file), json, out.bin())
}

/**
 * rig_medium.glb's clips on `base`'s skeleton: each bone's rotations and scales as they are, its translations moved
 * from Rig_Medium's rest to `base`'s by the ratio of the hips' heights, so a pose keeps its shape and its reach grows
 * with the body. Channels on bones `base` lacks (Rig_Medium's IK controls) are left out.
 */
function packLargeClips(base: Glb) {
  const medium = readGlb(path.join(OUT, 'rig_medium.glb'))
  const skeleton = bonesOf(base)
  const json: Json = { asset: { version: '2.0', generator: 'tower3d-characters' }, scene: 0, scenes: [{ nodes: [skeleton.root] }], nodes: skeleton.nodes, animations: [] }
  const out = writer(json)
  const restIn = (nodes: Json[], name: string): number[] => nodes.find((n) => n.name === name)?.translation ?? [0, 0, 0]
  const s = restIn(skeleton.nodes, 'hips')[1] / restIn(medium.json.nodes, 'hips')[1]
  for (const clip of medium.json.animations) {
    const samplers: Json[] = []
    const channels: Json[] = []
    for (const c of clip.channels) {
      const bone = medium.json.nodes[c.target.node].name
      const node = skeleton.nodes.findIndex((n) => n.name === bone && n.name !== 'Rig')
      if (node < 0) continue
      const sampler = clip.samplers[c.sampler]
      if (sampler.interpolation !== 'LINEAR') throw new Error(`${clip.name} interpolates ${bone} ${sampler.interpolation}ly`)
      const moved = () => {
        const from = restIn(medium.json.nodes, bone)
        const to = restIn(skeleton.nodes, bone)
        const v = floatsOf(medium, sampler.output).map((x, i) => to[i % 3] + (x - from[i % 3]) * s)
        return out.data({ componentType: 5126, count: v.length / 3, type: 'VEC3' }, Buffer.from(v.buffer))
      }
      const output = c.target.path === 'translation' ? moved() : out.accessor(medium, sampler.output)
      samplers.push({ input: out.accessor(medium, sampler.input), output, interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node, path: c.target.path } })
    }
    json.animations.push({ name: clip.name, samplers, channels })
  }
  json.nodes.forEach((n: Json) => n.children?.length === 0 && delete n.children)
  writeGlb(path.join(OUT, 'rig_large.glb'), json, out.bin())
}

const README = `# KayKit characters

What Tower 3D makes its workers of, by Kay Lousberg (www.kaylousberg.com, https://kaylousberg.itch.io/). Every pack is
CC0, its licence beside the files packed from it:

- \`adventurers.glb\`: the parts of the KayKit Adventurers 1.0 the workers' looks use, on one Rig_Medium skeleton, in
  the four adventurers' atlases, without the clips each character file embeds (\`License-Adventurers.txt\`).
- \`rig_medium.glb\`: the clips their poses play, from KayKit Character Animations 1.1, without its mannequin
  (\`License-Animations.txt\`), and clips of Quaternius's Universal Animation Library (quaternius.com, CC0,
  \`License-UAL.txt\`) retargeted onto Rig_Medium by the packer, named \`UAL_<name>\`.
- \`medium.glb\`: the Rig_Medium characters of KayKit Skeletons 1.1 (\`License-Skeletons.txt\`) and of the KayKit
  Mystery Monthly Series 5 (the Helpers and the Combat Mech, \`License-Series5.txt\`), skinned to adventurers.glb's
  joints, with their atlases and colourways.
- \`large.glb\`: the Series 5's Clanker on his Rig_Large skeleton, with his atlas and its colourway, and his family.
- \`rig_large.glb\`: rig_medium.glb's clips on that skeleton, retargeted by the packer.

Only the parts Tower 3D uses are packed, never a whole pack. All are packed from the packs' own files by
\`tsx scripts/tower3d-characters.ts <adventurers> <animations> <skeletons> <series5> <clankers> <ual>\`, which takes the parts
and clips \`renderers/tower3d/src/contract.ts\` names.

## The Clanker family

Eight variants of the Clanker (Sentinel, Tinker, Brute, Sir Clanksworth, Scout, Frostbyte, Sludge and King Bolt),
generated by Claude from the CC0 Clanker by a script, with nothing else as their source: each repaints his gradient
atlas and gives his eyes a glow of its own, scales some of his bones, drops exhausts and bolts low-poly props onto his
bones. \`<clankers>\` holds one GLB per variant (\`sentinel.glb\` …); the packer takes from each
its atlas and glow, a colourway of the Clanker's, and its props, parts of his. The bone scales and the parts each
variant wears are its outfit in \`renderers/tower3d/wardrobe.json\`. \`clanker-family.json\` is the generator's table
of the variants, kept as their provenance: names, palettes (gradient stops per atlas column), glow, bone scales, the
props and where they were placed, and the parts removed.
`

mkdirSync(OUT, { recursive: true })
packAdventurers()
packClips()
packKaykit('medium', readGlb(path.join(OUT, 'adventurers.glb')), 'medium.glb')
const large = readGlb(fileNamed(series5, `${(Object.keys(KAYKIT) as (keyof typeof KAYKIT)[]).find((c) => KAYKIT[c].rig === 'large')}.glb`))
packKaykit('large', large, 'large.glb')
packLargeClips(large)
copyFileSync(path.join(adventurers, 'LICENSE.txt'), path.join(OUT, 'License-Adventurers.txt'))
copyFileSync(path.join(skeletons, 'License.txt'), path.join(OUT, 'License-Skeletons.txt'))
copyFileSync(path.join(series5, 'License.txt'), path.join(OUT, 'License-Series5.txt'))
copyFileSync(path.join(ual, 'License.txt'), path.join(OUT, 'License-UAL.txt'))
writeFileSync(path.join(OUT, 'README.md'), README)
const size = (f: string) => `${f} ${(readFileSync(path.join(OUT, f)).length / 1024).toFixed(0)} KB`
console.log(`${['adventurers.glb', 'rig_medium.glb', 'medium.glb', 'large.glb', 'rig_large.glb'].map(size).join(' · ')} → ${path.relative(REPO, OUT)}`)
