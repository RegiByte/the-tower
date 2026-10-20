/**
 * Builds the playground's assets from the KayKit source folder and the forge's (both read only): every glTF and GLB
 * measured into `out/catalog.json`, every mesh packed into one buffer (`out/meshes.bin`, indexed by `out/meshes.json`),
 * and each pack's atlases and maps copied to `out/atlas/<pack>/<name>.png`. Everything under `out/` is derived and can
 * be rebuilt.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { FORGE, KAYKIT_PACKS, round, type Catalog, type KayKitPack, type Model, type Mount, type PackInfo, type Pivot, type Vec3 } from './catalog.ts'
import { categorize, forgeCategory, variantOf } from './rules.ts'
import type { MeshIndex, MeshNode, Surface } from './meshes.ts'

const DIRS: Record<KayKitPack, string> = {
  furniture: 'Furniture Bits',
  restaurant: 'Restaurant Bits',
  prototype: 'Prototype Bits',
  halloween: 'Halloween Bits',
  city: 'City Builder Bits',
  space: 'Space Base Bits',
}

type Gltf = {
  scenes: { nodes: number[] }[]
  nodes: { name: string; mesh?: number; children?: number[]; translation?: Vec3; rotation?: [number, number, number, number]; scale?: Vec3; matrix?: number[] }[]
  meshes: { primitives: { attributes: Record<string, number>; indices: number; material: number }[] }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  buffers: { uri?: string }[]
  materials: { name: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[]
}

type GltfMaterial = Gltf['materials'][number]

const GLB_JSON = 0x4e4f534a
const GLB_BIN = 0x004e4942

/** A glTF's JSON and its buffers: a `.glb`'s from its binary chunk, a `.gltf`'s from the files it names. */
function readGltf(file: string): { gltf: Gltf; buffers: Buffer<ArrayBuffer>[] } {
  const bytes = fs.readFileSync(file)
  if (!file.endsWith('.glb')) {
    const gltf = JSON.parse(bytes.toString('utf8')) as Gltf
    return { gltf, buffers: gltf.buffers.map((b) => fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(b.uri!)))) }
  }
  const chunks: { type: number; data: Buffer<ArrayBuffer> }[] = []
  for (let pos = 12; pos < bytes.length; ) {
    const length = bytes.readUInt32LE(pos)
    chunks.push({ type: bytes.readUInt32LE(pos + 4), data: bytes.subarray(pos + 8, pos + 8 + length) })
    pos += 8 + length
  }
  const gltf = JSON.parse(chunks.find((c) => c.type === GLB_JSON)!.data.toString('utf8')) as Gltf
  return { gltf, buffers: chunks.filter((c) => c.type === GLB_BIN).map((c) => c.data) }
}

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const ARRAYS: Record<number, Float32ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor> = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }

function accessorReader(gltf: Gltf, buffers: Buffer<ArrayBuffer>[]) {
  return (i: number) => {
    const acc = gltf.accessors[i], view = gltf.bufferViews[acc.bufferView], Arr = ARRAYS[acc.componentType], n = WIDTH[acc.type]
    if (view.byteStride && view.byteStride !== n * Arr.BYTES_PER_ELEMENT) throw new Error('strided buffers are not supported')
    const buf = buffers[view.buffer], off = buf.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    return { n, data: new Arr(buf.buffer.slice(off, off + acc.count * n * Arr.BYTES_PER_ELEMENT)) }
  }
}

/** An 8-bit RGB or RGBA PNG's pixels, enough to read the atlas colour under a UV. */
function decodePng(file: string) {
  const buf = fs.readFileSync(file)
  let pos = 8, width = 0, height = 0, channels = 0
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error(`${file}: only 8-bit RGB and RGBA PNGs, not interlaced, are read`)
      channels = data[9] === 6 ? 4 : 3
    }
    if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * channels, px = Buffer.alloc(height * stride), n = channels
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= n ? px[y * stride + x - n] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= n && y ? px[(y - 1) * stride + x - n] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]
      px[y * stride + x] = (line[x] + pred) & 255
    }
  }
  return (u: number, v: number) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * width)))
    const y = Math.min(height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * height)))
    const i = y * stride + x * channels
    return '#' + [px[i], px[i + 1], px[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')
  }
}

type M4 = number[]
const IDENTITY: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Column-major T·R·S, as glTF composes a node. */
function compose(t: Vec3, [x, y, z, w]: number[], s: Vec3): M4 {
  const [sx, sy, sz] = s
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ]
}

function multiply(a: M4, b: M4): M4 {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

const apply = (m: M4, x: number, y: number, z: number): Vec3 => [
  m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
]

/** Where the origin sits within `lo..hi` on one axis. */
const side = <L extends string>(lo: number, hi: number, [atLo, mid, atHi]: [L, L, L]): L | 'offset' =>
  Math.abs(lo) < 0.02 ? atLo : Math.abs(hi) < 0.02 ? atHi : Math.abs(lo + hi) < 0.04 ? mid : 'offset'

function pivotOf(min: Vec3, max: Vec3): Pivot {
  return {
    x: side(min[0], max[0], ['min', 'center', 'max']),
    y: side(min[1], max[1], ['bottom', 'center', 'top']),
    z: side(min[2], max[2], ['min', 'center', 'max']),
  }
}

/** How a piece is meant to be placed, read from where its origin sits. */
function mountOf(p: Pivot, height: number): Mount {
  if (p.y === 'bottom') return 'floor'
  if (p.y === 'top') return height <= 1.05 ? 'tile' : 'hanging'
  if (p.z === 'min' || p.z === 'max') return 'wall'
  return 'free'
}

/** A KayKit material samples its pack's atlas when it has a texture; the bundle's one material without is glass. */
const kaykitSurface = (m: GltfMaterial): Surface => (m.pbrMetallicRoughness?.baseColorTexture ? 'atlas' : 'glass')

/** How each of the forge's materials is drawn, bound by name as its catalog's `materials` binds them. */
export const FORGE_SURFACES: Record<string, Surface> = { forge_palette: 'atlas', forge_glass: 'glass', forge_decals: 'decals' }

function forgeSurface(m: GltfMaterial): Surface {
  const surface = FORGE_SURFACES[m.name]
  if (!surface) throw new Error(`the forge material ${m.name} is not one of ${Object.keys(FORGE_SURFACES).join(', ')}: the forge's contract changed`)
  return surface
}

/** One model: its measured facts, and its nodes with their geometry appended to the packed buffers. */
function measure(file: string, surfaceOf: (m: GltfMaterial) => Surface, atlas: (u: number, v: number) => string, packed: Packed) {
  const { gltf, buffers } = readGltf(file)
  const read = accessorReader(gltf, buffers)
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  const colors = new Map<string, number>()
  const nodes: MeshNode[] = []
  const parts: Model['parts'] = []
  let tris = 0
  const roots = gltf.scenes[0].nodes
  const visit = (ni: number, parent: number, parentWorld: M4) => {
    const node = gltf.nodes[ni]
    if (node.matrix) throw new Error(`${file}: node matrices are not supported`)
    const t = node.translation ?? [0, 0, 0], r = node.rotation ?? [0, 0, 0, 1], s = node.scale ?? [1, 1, 1]
    const world = multiply(parentWorld, compose(t, r, s))
    const index = nodes.length
    const entry: MeshNode = { name: node.name, parent, t, r, s, prims: [] }
    nodes.push(entry)
    if (parent >= 0 || roots.length > 1 || node.children) parts.push({ name: node.name, pivot: apply(world, 0, 0, 0).map(round) as Vec3 })
    for (const prim of node.mesh === undefined ? [] : gltf.meshes[node.mesh].primitives) {
      const pos = read(prim.attributes.POSITION), nor = read(prim.attributes.NORMAL), uv = read(prim.attributes.TEXCOORD_0), idx = read(prim.indices)
      const surface = surfaceOf(gltf.materials[prim.material])
      const count = pos.data.length / 3
      tris += idx.data.length / 3
      for (let i = 0; i < count; i++) {
        const p = apply(world, pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2])
        for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], p[k]), (hi[k] = Math.max(hi[k], p[k])))
        if (surface === 'atlas') {
          const c = atlas(uv.data[i * 2], uv.data[i * 2 + 1])
          colors.set(c, (colors.get(c) ?? 0) + 1)
        }
      }
      const at = (data: ArrayLike<number>, into: number[]) => {
        const start = into.length
        for (let i = 0; i < data.length; i++) into.push(data[i])
        return [start, data.length] as [number, number]
      }
      entry.prims.push({ position: at(pos.data, packed.floats), normal: at(nor.data, packed.floats), uv: at(uv.data, packed.floats), index: at(idx.data, packed.ints), surface })
    }
    for (const c of node.children ?? []) visit(c, index, world)
  }
  for (const ni of roots) visit(ni, -1, IDENTITY)
  const min = lo.map(round) as Vec3, max = hi.map(round) as Vec3
  const pivot = pivotOf(min, max)
  const total = [...colors.values()].reduce((a, b) => a + b, 0)
  return {
    facts: {
      size: [0, 1, 2].map((k) => round(max[k] - min[k])) as Vec3,
      min, max, pivot,
      mount: mountOf(pivot, max[1] - min[1]),
      tris,
      parts,
      palette: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([color, n]) => ({ color, share: round(n / total) })),
    },
    nodes,
  }
}

type Packed = { floats: number[]; ints: number[] }

/** Models measured from one source: what `measureKit` gathers from each. */
type Part = { models: Model[]; meshes: MeshIndex; packs: Partial<Catalog['packs']> }

/** A pack's atlases in the source folder, by name (`base`, `alt_A`, …): the one its glTFs ship with, then the alternates it has. */
function atlasFiles(source: string, pack: KayKitPack): Record<string, string> {
  const dir = DIRS[pack]
  const gltfDir = path.join(source, dir, 'Assets/gltf')
  const base = fs.readdirSync(gltfDir).find((f) => f.endsWith('.png'))!
  const alts = ['textures', 'texture'].map((d) => path.join(source, dir, 'Assets', d)).filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => /_alt(_[A-Z])?\.png$/.test(f)).map((f) => path.join(d, f)))
  return { base: path.join(gltfDir, base), ...Object.fromEntries(alts.map((f) => [f.match(/(alt(_[A-Z])?)\.png$/)![1], f])) }
}

const packsOf = (ids: string[]) => KAYKIT_PACKS.filter((pack) => ids.some((id) => id.startsWith(`${pack}/`)))

/** The glTF of the KayKit model `id` (`pack/name`), relative to a KayKit folder. */
export function gltfOf(id: string) {
  const [pack, name] = id.split('/') as [KayKitPack, string]
  return path.join(DIRS[pack], 'Assets/gltf', `${name}.gltf`)
}

/** The files under `source` that measuring the KayKit models `ids` reads: each glTF with its buffers, and its pack's atlases. */
export function sourceFiles(source: string, ids: string[]): string[] {
  return packsOf(ids).flatMap((pack) => {
    const gltfs = ids.filter((id) => id.startsWith(`${pack}/`)).map(gltfOf)
    const buffers = gltfs.flatMap((f) => (JSON.parse(fs.readFileSync(path.join(source, f), 'utf8')) as Gltf).buffers.map((b) => path.join(path.dirname(f), decodeURIComponent(b.uri!))))
    const atlases = Object.values(atlasFiles(source, pack)).map((f) => path.relative(source, f))
    return [...gltfs, ...buffers, ...atlases]
  })
}

const copyInto = (atlases: string, pack: string, files: Record<string, string>) => {
  fs.mkdirSync(path.join(atlases, pack), { recursive: true })
  for (const [name, file] of Object.entries(files)) fs.copyFileSync(file, path.join(atlases, pack, `${name}.png`))
}

/** The KayKit models `ids` names (every model when absent) from the folder at `source`, with their packs' atlases. */
function measureKayKit(source: string, atlases: string, ids: string[] | undefined, packed: Packed): Part {
  const part: Part = { models: [], meshes: {}, packs: {} }
  for (const pack of ids ? packsOf(ids) : KAYKIT_PACKS) {
    const dir = DIRS[pack]
    const gltfDir = path.join(source, dir, 'Assets/gltf')
    const files = fs.readdirSync(gltfDir).filter((f) => f.endsWith('.gltf') && (!ids || ids.includes(`${pack}/${f.replace(/\.gltf$/, '')}`))).sort()
    const found = atlasFiles(source, pack)
    copyInto(atlases, pack, found)
    const atlas = decodePng(found.base)
    for (const f of files) {
      const name = f.replace(/\.gltf$/, ''), id = `${pack}/${name}`
      const { facts, nodes } = measure(path.join(gltfDir, f), kaykitSurface, atlas, packed)
      part.models.push({ id, pack, name, category: categorize(id, name), variant: { ...variantOf(name), siblings: [] }, ...facts, source: path.join(dir, 'Assets/gltf', f) })
      part.meshes[id] = nodes
    }
    part.packs[pack] = { dir, count: files.length, atlases: Object.keys(found), maps: [] }
  }
  return part
}

/** The forge's `catalog.json`, as much of it as the kit reads: how each material binds its textures, and every prop's sidecar. */
export type ForgeCatalog = {
  materials: Record<string, { map: string; emissiveMap?: string }>
  props: { id: string; name: string; category: string; glb: string; decals: string[] }[]
}

export const readForge = (source: string) => JSON.parse(fs.readFileSync(path.join(source, 'catalog.json'), 'utf8')) as ForgeCatalog

/** A forge model's id in the kit: its own (`kitchen/coffee_mug_01`) under the pack's name. */
export const forgeId = (id: string) => `${FORGE}/${id}`

/**
 * The textures drawing `props` samples, by name, relative to the forge folder: the palette as the pack's atlas, its
 * emissive map, and the decal sheet only when one of them shows a decal (at 4096² it is most of the forge's GPU cost).
 */
export function forgeTextures(forge: ForgeCatalog, props: ForgeCatalog['props']): Record<string, string> {
  const palette = forge.materials.forge_palette
  return { base: palette.map, emissive: palette.emissiveMap!, ...(props.some((p) => p.decals.length) && { decals: forge.materials.forge_decals.map }) }
}

/** The forge's props `ids` names (every prop when absent) from the forge's `dist/` at `source`, with the textures they sample. */
function measureForge(source: string, atlases: string, ids: string[] | undefined, packed: Packed): Part {
  const forge = readForge(source)
  const props = forge.props.filter((p) => !ids || ids.includes(forgeId(p.id)))
  if (!props.length) return { models: [], meshes: {}, packs: {} }
  const textures = forgeTextures(forge, props)
  copyInto(atlases, FORGE, Object.fromEntries(Object.entries(textures).map(([name, file]) => [name, path.join(source, file)])))
  const atlas = decodePng(path.join(source, textures.base))
  const part: Part = { models: [], meshes: {}, packs: {} }
  for (const p of props.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const id = forgeId(p.id)
    const { facts, nodes } = measure(path.join(source, p.glb), forgeSurface, atlas, packed)
    part.models.push({ id, pack: FORGE, name: p.name, category: forgeCategory(id, p.category), variant: { ...variantOf(p.name), siblings: [] }, ...facts, source: p.glb })
    part.meshes[id] = nodes
  }
  part.packs[FORGE] = { dir: path.basename(source), count: props.length, atlases: ['base'], maps: Object.keys(textures).filter((n) => n !== 'base') } satisfies PackInfo
  return part
}

/** A set of models measured and their meshes packed, with each pack's atlases copied: what a drawing loads. */
export type Measured = { catalog: Catalog; meshes: MeshIndex; floats: Float32Array; ints: Uint32Array }

/** Where the models come from: a KayKit Bits folder and a forge `dist/`. */
export type Sources = { kaykit: string; forge: string }

/**
 * Measures the models `ids` names (every model when absent) from the KayKit and forge folders, packing their meshes in
 * one buffer, and copies the atlases and maps of every pack they come from to `<atlases>/<pack>/<name>.png`.
 */
export function measureKit(sources: Sources, atlases: string, ids?: string[]): Measured {
  const packed: Packed = { floats: [], ints: [] }
  fs.rmSync(atlases, { recursive: true, force: true })
  const parts = [measureKayKit(sources.kaykit, atlases, ids, packed), measureForge(sources.forge, atlases, ids, packed)]
  const models = parts.flatMap((p) => p.models)
  const meshes: MeshIndex = Object.assign({}, ...parts.map((p) => p.meshes))
  const unknown = ids?.filter((id) => !meshes[id]) ?? []
  if (unknown.length) throw new Error(`no model ${unknown.join(', ')} in ${sources.kaykit} or ${sources.forge}`)
  const families = Object.groupBy(models, (m) => `${m.pack}/${m.variant.base}`)
  for (const m of models) m.variant.siblings = families[`${m.pack}/${m.variant.base}`]!.map((s) => s.name).filter((n) => n !== m.name)
  const packs = Object.assign({}, ...parts.map((p) => p.packs)) as Catalog['packs']
  const catalog: Catalog = { bundle: 'KayKit Bits Bundle 1 (1.1), and the forge', license: 'CC0', unit: 'meter, +Y up, models face +Z', packs, models }
  return { catalog, meshes, floats: new Float32Array(packed.floats), ints: new Uint32Array(packed.ints) }
}

/** Writes a measured set where `loadMeshes` and the catalog readers look: `catalog.json`, `meshes.json`, `meshes.bin`. */
export function writeKit(out: string, { catalog, meshes, floats, ints }: Measured) {
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(catalog, null, 1))
  fs.writeFileSync(path.join(out, 'meshes.json'), JSON.stringify({ floats: floats.length, ints: ints.length, models: meshes }))
  fs.writeFileSync(path.join(out, 'meshes.bin'), Buffer.concat([Buffer.from(floats.buffer), Buffer.from(ints.buffer)]))
  return { models: catalog.models.length, bytes: floats.byteLength + ints.byteLength }
}

/** Builds `out/` from every model of the KayKit and forge folders. */
export function build(sources: Sources, out: string) {
  return writeKit(out, measureKit(sources, path.join(out, 'atlas')))
}
