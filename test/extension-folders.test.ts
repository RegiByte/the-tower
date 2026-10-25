import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { checkFolder } from '../src/extension-check.ts'
import { BUNDLED_DIR } from '../src/extensions.ts'
import type { Config } from '../src/shared/model.ts'

/**
 * Every bundled extension and every example under `examples/extensions/` loads as `tower extensions check` reads it:
 * its manifest, its contract and its start. An example that stops loading fails here, before a user copies it.
 */

const EXAMPLES = path.join(import.meta.dirname, '..', 'examples', 'extensions')

const foldersIn = (root: string) =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))

const CONFIG: Config = { argv: ['claude'], projects: {} }

for (const dir of [...foldersIn(BUNDLED_DIR), ...foldersIn(EXAMPLES)]) {
  test(`${path.relative(path.join(import.meta.dirname, '..'), dir)} loads with no problem`, async () => {
    const { problems } = await checkFolder(dir, CONFIG, undefined)
    assert.deepEqual(problems, [])
  })
}
