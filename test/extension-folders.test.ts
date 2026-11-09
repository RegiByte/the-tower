import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
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

/** What the check says of plugins.claude for a copy of the plugin example with `change` made to it. */
const pluginProblems = async (change: (dir: string) => void) => {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'tower-plugin-')), 'handoff')
  cpSync(path.join(EXAMPLES, 'handoff'), dir, { recursive: true })
  change(dir)
  const { problems } = await checkFolder(dir, CONFIG, undefined)
  rmSync(path.dirname(dir), { recursive: true })
  return problems.map((p) => [p.level, p.path, p.message])
}

test('a plugins.claude that teaches nothing is a warning at its key, and the extension still loads', async () => {
  const warned = async (change: (dir: string) => void, message: RegExp) => {
    const problems = await pluginProblems(change)
    assert.deepEqual(problems.map(([level, at]) => [level, at]), [['warn', 'plugins.claude']])
    assert.match(String(problems[0][2]), message)
  }
  await warned((dir) => rmSync(path.join(dir, 'plugin'), { recursive: true }), /plugin is no folder of this extension.*: add the folder, or fix plugins\.claude$/)
  await warned((dir) => rmSync(path.join(dir, 'plugin', '.claude-plugin'), { recursive: true }), /plugin holds no \.claude-plugin\/plugin\.json.*: add one naming the plugin$/)
})

for (const dir of [...foldersIn(BUNDLED_DIR), ...foldersIn(EXAMPLES)]) {
  test(`${path.relative(path.join(import.meta.dirname, '..'), dir)} loads with no problem`, async () => {
    const { problems } = await checkFolder(dir, CONFIG, undefined)
    assert.deepEqual(problems, [])
  })
}
