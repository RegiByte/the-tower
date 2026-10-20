/**
 * Builds the KayKit models and forge props Tower 3D draws into the renderer's git-ignored `out/kaykit/`, through the
 * playground's own measuring (renderers/kaykit/src/measure.ts): the models a workstation may hold (`PROPS` in
 * renderers/tower3d/src/dress.ts), every model of the scene documents the office places (`PREFABS` in
 * renderers/tower3d/src/zones.ts) and the lobby city model's (`CITY_MODELS`): measured, their meshes packed, the
 * atlases of their packs, and each prefab (those and the desk's dressing, `DESK_DRESS`) flattened shared and in every
 * list of its states it can be drawn in (one of each of its groups), with its boxes, its slots and the footprints a walker bumps into, all in one file
 * (`out/kaykit/kit.kaykit`, laid out as `KitFile` in renderers/tower3d/src/kitfile.ts) that the bundle embeds.
 *
 * It measures from renderers/tower3d/kaykit, the files of those models copied from the KayKit Bits Bundle 1 (CC0) in
 * the bundle's own layout, and from renderers/tower3d/forge, a snapshot of the forge's `dist/` (CC0). When the office
 * takes a model that folder lacks, `vendor` copies the models it uses from a full bundle (https://kaylousberg.itch.io/)
 * over it; `vendor-forge` replaces the forge snapshot with a newer `dist/`. Only the forge props the office places are
 * measured, and the forge's 4096² decal sheet goes in the file only when one of them shows a decal.
 *
 *   tsx scripts/tower3d-kit.ts                      build out/kaykit/kit.kaykit
 *   tsx scripts/tower3d-kit.ts vendor <bundle>      replace the bundle files in renderers/tower3d/kaykit with the models
 *                                                   the office uses (its Characters/ stay: scripts/tower3d-characters.ts)
 *   tsx scripts/tower3d-kit.ts vendor-forge <dist>  replace renderers/tower3d/forge with the forge's dist/ at <dist>
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { FORGE, FORGE_BINDING, fit, worldBox, type Vec3 } from '../renderers/kaykit/src/catalog.ts'
import { flatFile, readScene } from '../renderers/kaykit/src/files.ts'
import { groupsOf, picks } from '../renderers/kaykit/src/scene.ts'
import { FORGE_SURFACES, forgeId, gltfOf, measureKit, readForge, sourceFiles } from '../renderers/kaykit/src/measure.ts'
import { DESK_DRESS, PROPS } from '../renderers/tower3d/src/dress.ts'
import type { KitFile } from '../renderers/tower3d/src/kitfile.ts'
import { CITY_MODELS, PREFABS, stateKey, type Prefab, type PrefabBox, type PrefabItem } from '../renderers/tower3d/src/zones.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const VENDORED = path.join(REPO, 'renderers/tower3d/kaykit')
const FORGE_VENDORED = path.join(REPO, 'renderers/tower3d/forge')
const SCENES = path.join(REPO, 'renderers/kaykit/scenes')
const OUT = path.join(REPO, 'renderers/tower3d/out/kaykit')
const { positionals } = parseArgs({ allowPositionals: true })

/** Below this a placed model is stepped over (rugs, a tray): it bumps nobody. */
const LOW = 0.25
/** A model whose base is higher than this stands on something else, inside that thing's footprint. */
const RAISED = 0.1

/** A prefab's models and boxes in `states`, as the office draws them. */
async function modelsOf(name: string, states: string[]) {
  const flat = await flatFile(path.join(SCENES, name), states)
  const extras = (['labels', 'lamps'] as const).filter((k) => flat[k]?.length)
  if (extras.length) throw new Error(`${name}${states.length ? ` in ${states.join(', ')}` : ''}: the office draws a prefab's models and boxes only, and it has ${extras.join(', ')}`)
  return {
    flat,
    items: flat.items.map(({ model, at, turn, scale, parts, theme }): PrefabItem => ({ model, at, turn: turn ?? 0, scale: scale ?? 1, parts, theme })),
    boxes: (flat.boxes ?? []).map(({ size, at, turn, color, glow, opacity }): PrefabBox => ({ size, at, turn: turn ?? 0, color, glow, opacity })),
  }
}

/** Every prefab the office places, flattened shared and in every list of its states it can be drawn in, each with its slots. */
const flats = await Promise.all([...PREFABS, DESK_DRESS].map(async (name) => {
  const { flat, items, boxes } = await modelsOf(name, [])
  const scene = readScene(path.join(SCENES, name))
  const each = await Promise.all(picks(scene).slice(1).map(async (names) => {
    const { flat, items, boxes } = await modelsOf(name, names)
    return [stateKey(names), { items, boxes, slots: flat.slots }] as const
  }))
  return { name, items, boxes, slots: flat.slots, groups: groupsOf(scene), states: Object.fromEntries(each) }
}))

const ids = [...new Set([...Object.keys(PROPS), ...CITY_MODELS, ...flats.flatMap((f) => [...f.items, ...Object.values(f.states).flatMap((s) => s.items)].map((it) => it.model))])].sort()
const forgeIds = ids.filter((id) => id.startsWith(`${FORGE}/`))
const kaykitIds = ids.filter((id) => !forgeIds.includes(id))

const VENDORED_README = `# KayKit models

The models Tower 3D draws, copied unchanged from the KayKit Bits Bundle 1 (1.1) by Kay Lousberg
(www.kaylousberg.com, https://kaylousberg.itch.io/), in the bundle's own layout. They are CC0: \`License.txt\` is
the bundle's.

\`npm run tower3d\` measures them into the renderer's kit. When the office takes a model this folder lacks, copy
the models it uses from a full bundle: \`tsx scripts/tower3d-kit.ts vendor <bundle>\`. \`Characters/\` holds what
the workers are made of, from two other KayKit packs (its own README).
`

/** The vendored folder's characters, which another script vendors (scripts/tower3d-characters.ts). */
const CHARACTERS = 'Characters'

/**
 * Replaces the vendored bundle files with those measuring `ids` reads from the bundle at `bundle`, its license and a
 * README, leaving the characters be.
 */
function vendor(bundle: string) {
  if (!existsSync(bundle)) throw new Error(`no KayKit Bits bundle at ${bundle}`)
  for (const entry of readdirSync(VENDORED)) if (entry !== CHARACTERS) rmSync(path.join(VENDORED, entry), { recursive: true, force: true })
  const files = [...sourceFiles(bundle, kaykitIds), 'License.txt']
  for (const file of files) {
    mkdirSync(path.dirname(path.join(VENDORED, file)), { recursive: true })
    copyFileSync(path.join(bundle, file), path.join(VENDORED, file))
  }
  writeFileSync(path.join(VENDORED, 'README.md'), VENDORED_README)
  console.log(`${kaykitIds.length} KayKit models, ${files.length} files → ${path.relative(REPO, VENDORED)}`)
}

const FORGE_README = `# Forge props

A snapshot of the forge's \`dist/\`, copied unchanged: a kit of real-size low-poly props made for the tower in a
repository of its own, to take KayKit's place in Tower 3D over time. They are CC0 (\`License.txt\`).

\`catalog.json\` lists every prop's sidecar and how each of the three materials binds the textures in \`textures/\`;
\`props/<category>/<name>.glb\` carry the meshes, with no images. \`npm run tower3d\` measures the props the office
places into the renderer's kit, as the pack \`forge\` (ids \`forge/<category>/<name>\`). Replace the snapshot with a
newer \`dist/\`: \`tsx scripts/tower3d-kit.ts vendor-forge <dist>\`.
`

const FORGE_LICENSE = `The forge's props, their textures and their sidecars are dedicated to the public domain under CC0 1.0 Universal
(https://creativecommons.org/publicdomain/zero/1.0/): copy, modify and use them, commercially or not, without asking
and without credit.
`

type Binding = { opacity?: number; alphaTest?: number }

/** Fails unless the forge's `dist/` binds its materials as the kit draws them (`FORGE_SURFACES`, `FORGE_BINDING`). */
function checkBinding(dist: string) {
  const materials = readForge(dist).materials as Record<string, Binding>
  const names = Object.keys(materials).sort(), bound = Object.keys(FORGE_SURFACES).sort()
  const problems = [
    ...(names.join() === bound.join() ? [] : [`materials ${names.join(', ')}, where the kit binds ${bound.join(', ')}`]),
    ...(materials.forge_glass?.opacity === FORGE_BINDING.glassOpacity ? [] : [`forge_glass's opacity ${materials.forge_glass?.opacity}, where the kit draws ${FORGE_BINDING.glassOpacity}`]),
    ...(materials.forge_decals?.alphaTest === FORGE_BINDING.decalCut ? [] : [`forge_decals's alphaTest ${materials.forge_decals?.alphaTest}, where the kit cuts at ${FORGE_BINDING.decalCut}`]),
  ]
  if (problems.length) throw new Error(`${dist}: the forge's contract changed: ${problems.join('; ')}. Change FORGE_SURFACES and FORGE_BINDING with it`)
}

/** Replaces the vendored forge snapshot with the forge's `dist/` at `dist`, its license and a README. */
function vendorForge(dist: string) {
  if (!existsSync(path.join(dist, 'catalog.json'))) throw new Error(`no forge dist/ at ${dist}: it has no catalog.json`)
  checkBinding(dist)
  rmSync(FORGE_VENDORED, { recursive: true, force: true })
  cpSync(dist, FORGE_VENDORED, { recursive: true })
  writeFileSync(path.join(FORGE_VENDORED, 'License.txt'), FORGE_LICENSE)
  writeFileSync(path.join(FORGE_VENDORED, 'README.md'), FORGE_README)
  console.log(`${readForge(FORGE_VENDORED).props.length} forge props → ${path.relative(REPO, FORGE_VENDORED)}`)
}

if (positionals[0] === 'vendor-forge') {
  if (!positionals[1]) throw new Error('vendor-forge <dist>: the forge\'s dist/ folder to copy')
  vendorForge(path.resolve(positionals[1]))
  process.exit(0)
}
if (positionals[0] === 'vendor') {
  if (!positionals[1]) throw new Error('vendor <bundle>: the KayKit Bits Bundle 1 folder to copy from')
  vendor(path.resolve(positionals[1]))
  process.exit(0)
}
if (positionals.length) throw new Error(`unknown verb ${positionals[0]}: tsx scripts/tower3d-kit.ts [vendor <bundle> | vendor-forge <dist>]`)

const placing = (id: string) => flats.filter((f) => [...f.items, ...Object.values(f.states).flatMap((s) => s.items)].some((it) => it.model === id)).map((f) => f.name)
const named = (id: string) => (placing(id).length ? `${id} (in ${placing(id).join(', ')})` : id)
const missing = kaykitIds.filter((id) => !existsSync(path.join(VENDORED, gltfOf(id))))
if (missing.length) {
  console.error(`${path.relative(REPO, VENDORED)} lacks ${missing.map(named).join(', ')}: copy the models the office places from the full KayKit Bits bundle with \`tsx scripts/tower3d-kit.ts vendor <bundle>\``)
  process.exit(1)
}
const forged = new Set(readForge(FORGE_VENDORED).props.map((p) => forgeId(p.id)))
const unforged = forgeIds.filter((id) => !forged.has(id))
if (unforged.length) {
  console.error(`${path.relative(REPO, FORGE_VENDORED)} lacks ${unforged.map(named).join(', ')}: vendor a forge dist/ that has them with \`tsx scripts/tower3d-kit.ts vendor-forge <dist>\``)
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const ATLASES = path.join(OUT, 'atlas')
const kit = measureKit({ kaykit: VENDORED, forge: FORGE_VENDORED }, ATLASES, ids)
const byId = new Map(kit.catalog.models.map((m) => [m.id, m]))

/** The floor a placed model takes, in its prefab's frame, if it is one a walker bumps into. */
function footprint(it: PrefabItem) {
  const f = fit(byId.get(it.model)!)
  const s: Vec3 = Array.isArray(it.scale) ? it.scale : [it.scale, it.scale, it.scale]
  const b = worldBox(f.min, f.max, it.at, it.turn, s)
  if (b.max[1] - b.min[1] < LOW || b.min[1] > RAISED) return []
  return [{ minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] }]
}

/** The floor a box takes in its prefab's frame, if it stands on the floor and is tall enough to bump into: a wall, a pane of glass. */
function boxFootprint(b: PrefabBox) {
  if (b.size[1] < LOW || b.at[1] > RAISED) return []
  const w = worldBox([-b.size[0] / 2, 0, -b.size[2] / 2], [b.size[0] / 2, b.size[1], b.size[2] / 2], b.at, b.turn, [1, 1, 1])
  return [{ minX: w.min[0], maxX: w.max[0], minZ: w.min[2], maxZ: w.max[2] }]
}

const footprints = (items: PrefabItem[], boxes: PrefabBox[]) => [...items.flatMap(footprint), ...boxes.flatMap(boxFootprint)]
const prefabs: Record<string, Prefab> = Object.fromEntries(flats.map(({ name, items, boxes, slots, groups, states }) => [
  name,
  { items, boxes, footprint: footprints(items, boxes), slots, groups, states: Object.fromEntries(Object.entries(states).map(([key, st]) => [key, { ...st, footprint: footprints(st.items, st.boxes) }])) },
]))
const meshes = Buffer.concat([Buffer.from(kit.floats.buffer), Buffer.from(kit.ints.buffer)])
const atlases = Object.entries(kit.catalog.packs).flatMap(([pack, info]) => [...info.atlases, ...info.maps].map((name) => ({ key: `${pack}/${name}`, png: readFileSync(path.join(ATLASES, pack, `${name}.png`)) })))
const header: KitFile = {
  catalog: kit.catalog,
  prefabs,
  meshes: { floats: kit.floats.length, models: kit.meshes, bytes: meshes.length },
  atlases: atlases.map(({ key, png }) => ({ key, bytes: png.length })),
}
const json = Buffer.from(JSON.stringify(header))
const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, ' ')])
const length = Buffer.alloc(4)
length.writeUInt32LE(padded.length)
const file = Buffer.concat([length, padded, meshes, ...atlases.map((a) => a.png)])
writeFileSync(path.join(OUT, 'kit.kaykit'), file)
rmSync(ATLASES, { recursive: true })
console.log(`${kit.catalog.models.length} models (${forgeIds.length} from the forge, its maps: ${kit.catalog.packs[FORGE]?.maps.join(', ') || 'none'}), ${flats.length} prefabs, ${(file.length / 1024).toFixed(0)} KB → ${path.relative(REPO, OUT)}/kit.kaykit`)
