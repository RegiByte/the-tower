import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { CONTRACT, MODEL_NAMES, missing } from '../renderers/tower3d/src/contract.ts'

const ASSETS = path.join(import.meta.dirname, '..', 'renderers', 'tower3d', 'assets')

/** The node and material names in a binary glTF, read from its JSON chunk. */
function namesIn(file: string) {
  const glb = readFileSync(file)
  assert.equal(glb.toString('ascii', 0, 4), 'glTF', `${file} is not a binary glTF`)
  const length = glb.readUInt32LE(12)
  assert.equal(glb.toString('ascii', 16, 20), 'JSON', `${file} has no JSON chunk first`)
  const json = JSON.parse(glb.toString('utf8', 20, 20 + length)) as { nodes?: { name?: string }[]; materials?: { name?: string }[] }
  const named = (xs: { name?: string }[] = []) => xs.flatMap((x) => (x.name ? [x.name] : []))
  return { nodes: named(json.nodes), materials: named(json.materials) }
}

for (const name of MODEL_NAMES) {
  test(`${name}.glb keeps its contract`, () => {
    assert.deepEqual(missing(CONTRACT[name], namesIn(path.join(ASSETS, `${name}.glb`))), [])
  })
}
