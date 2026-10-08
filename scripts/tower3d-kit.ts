/**
 * Builds the KayKit models Tower 3D draws into the renderer's git-ignored `out/kaykit/`, through the playground's own
 * measuring (renderers/kaykit/src/measure.ts): the models a workstation may hold (`PROPS` in
 * renderers/tower3d/src/dress.ts), every model of the scene documents the office places (`PREFABS` in
 * renderers/tower3d/src/zones.ts) and the lobby city model's (`CITY_MODELS`): measured, their meshes packed, the
 * atlases of their packs, and each prefab flattened with the footprints a walker bumps into, all in one file
 * (`out/kaykit/kit.kaykit`, laid out as `KitFile` in renderers/tower3d/src/kitfile.ts) that the bundle embeds.
 *
 * It measures from renderers/tower3d/kaykit, the files of those models copied from the KayKit Bits Bundle 1 (CC0) in
 * the bundle's own layout. When the office takes a model that folder lacks, `vendor` copies the models it uses from a
 * full bundle (https://kaylousberg.itch.io/) over it.
 *
 *   tsx scripts/tower3d-kit.ts                      build out/kaykit/kit.kaykit
 *   tsx scripts/tower3d-kit.ts vendor <bundle>      replace renderers/tower3d/kaykit with the models the office uses
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fit, worldBox, type Vec3 } from '../renderers/kaykit/src/catalog.ts'
import { flatFile } from '../renderers/kaykit/src/files.ts'
import { measureKit, sourceFiles } from '../renderers/kaykit/src/measure.ts'
import { PROPS } from '../renderers/tower3d/src/dress.ts'
import type { KitFile } from '../renderers/tower3d/src/kitfile.ts'
import { CITY_MODELS, PREFABS, type Prefab, type PrefabItem } from '../renderers/tower3d/src/zones.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const VENDORED = path.join(REPO, 'renderers/tower3d/kaykit')
const SCENES = path.join(REPO, 'renderers/kaykit/scenes')
const OUT = path.join(REPO, 'renderers/tower3d/out/kaykit')
const { positionals } = parseArgs({ allowPositionals: true })

/** Below this a placed model is stepped over (rugs, a tray): it bumps nobody. */
const LOW = 0.25
/** A model whose base is higher than this stands on something else, inside that thing's footprint. */
const RAISED = 0.1

const flats = await Promise.all(PREFABS.map(async (name) => {
  const flat = await flatFile(path.join(SCENES, name))
  const extras = (['boxes', 'labels', 'lamps'] as const).filter((k) => flat[k]?.length)
  if (extras.length) throw new Error(`${name}: the office draws a prefab's models only, and it has ${extras.join(', ')}`)
  return [name, flat.items.map(({ model, at, turn, scale, parts }): PrefabItem => ({ model, at, turn: turn ?? 0, scale: scale ?? 1, parts }))] as const
}))

const ids = [...new Set([...Object.keys(PROPS), ...CITY_MODELS, ...flats.flatMap(([, items]) => items.map((it) => it.model))])].sort()

const VENDORED_README = `# KayKit models

The models Tower 3D draws, copied unchanged from the KayKit Bits Bundle 1 (1.1) by Kay Lousberg
(www.kaylousberg.com, https://kaylousberg.itch.io/), in the bundle's own layout. They are CC0: \`License.txt\` is
the bundle's.

\`npm run tower3d\` measures them into the renderer's kit. When the office takes a model this folder lacks, copy
the models it uses from a full bundle: \`tsx scripts/tower3d-kit.ts vendor <bundle>\`.
`

/** Replaces the vendored folder with the files measuring `ids` reads from the bundle at `bundle`, its license and a README. */
function vendor(bundle: string) {
  if (!existsSync(bundle)) throw new Error(`no KayKit Bits bundle at ${bundle}`)
  rmSync(VENDORED, { recursive: true, force: true })
  const files = [...sourceFiles(bundle, ids), 'License.txt']
  for (const file of files) {
    mkdirSync(path.dirname(path.join(VENDORED, file)), { recursive: true })
    copyFileSync(path.join(bundle, file), path.join(VENDORED, file))
  }
  writeFileSync(path.join(VENDORED, 'README.md'), VENDORED_README)
  console.log(`${ids.length} KayKit models, ${files.length} files → ${path.relative(REPO, VENDORED)}`)
}

if (positionals[0] === 'vendor') {
  if (!positionals[1]) throw new Error('vendor <bundle>: the KayKit Bits Bundle 1 folder to copy from')
  vendor(path.resolve(positionals[1]))
  process.exit(0)
}
if (positionals.length) throw new Error(`unknown verb ${positionals[0]}: tsx scripts/tower3d-kit.ts [vendor <bundle>]`)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const ATLASES = path.join(OUT, 'atlas')
const kit = measureKit(VENDORED, ATLASES, ids)
const byId = new Map(kit.catalog.models.map((m) => [m.id, m]))

/** The floor a placed model takes, in its prefab's frame, if it is one a walker bumps into. */
function footprint(it: PrefabItem) {
  const f = fit(byId.get(it.model)!)
  const s: Vec3 = Array.isArray(it.scale) ? it.scale : [it.scale, it.scale, it.scale]
  const b = worldBox(f.min, f.max, it.at, it.turn, s)
  if (b.max[1] - b.min[1] < LOW || b.min[1] > RAISED) return []
  return [{ minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] }]
}

const prefabs: Record<string, Prefab> = Object.fromEntries(flats.map(([name, items]) => [name, { items, footprint: items.flatMap(footprint) }]))
const meshes = Buffer.concat([Buffer.from(kit.floats.buffer), Buffer.from(kit.ints.buffer)])
const atlases = Object.entries(kit.catalog.packs).flatMap(([pack, info]) => info.atlases.map((name) => ({ key: `${pack}/${name}`, png: readFileSync(path.join(ATLASES, pack, `${name}.png`)) })))
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
console.log(`${kit.catalog.models.length} KayKit models, ${PREFABS.length} prefabs, ${(file.length / 1024).toFixed(0)} KB → ${path.relative(REPO, OUT)}/kit.kaykit`)
