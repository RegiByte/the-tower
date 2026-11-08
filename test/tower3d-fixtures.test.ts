import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { FIXTURE_ZONE, FIXTURES_DIR, fixtureTexts } from '../scripts/tower3d-fixtures.ts'

test("Tower 3D's committed fixture boards are the ones the script builds", () => {
  process.env.TZ = FIXTURE_ZONE
  const committed = Object.fromEntries(readdirSync(FIXTURES_DIR).map((file) => [file, readFileSync(path.join(FIXTURES_DIR, file), 'utf8')]))
  assert.deepEqual(
    committed,
    fixtureTexts(),
    'renderers/tower3d/fixtures is stale: the bridge or a scenario in scripts/tower3d-fixtures.ts changed. Run `npm run tower3d:fixtures` and commit it.',
  )
})
