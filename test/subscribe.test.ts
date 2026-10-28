import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { subscribe } from '../src/subscribe.ts'

/** The paths a watch of `root`, ignoring its `.git/objects`, reports for a write there and a write beside it. */
const reported = async (root: string): Promise<string[]> => {
  const objects = path.join(root, '.git', 'objects')
  mkdirSync(objects, { recursive: true })
  const paths: string[] = []
  let saw: () => void = () => {}
  const sawSentinel = new Promise<void>((resolve) => (saw = resolve))
  const subscription = await subscribe(
    root,
    [objects],
    (changed) => {
      paths.push(...(changed ?? [root]))
      if (paths.includes(path.join(root, 'sentinel'))) saw()
    },
    (err) => assert.fail(err),
  )
  writeFileSync(path.join(objects, 'packed'), 'x')
  writeFileSync(path.join(root, 'sentinel'), 'x')
  await sawSentinel
  await subscription.close()
  return paths
}

for (const name of ['plain', 'my [old] {repo} *']) {
  test(`a watch of "${name}" reports no path below what it ignores, whatever glob characters its root holds`, async () => {
    const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tower-subscribe-')))
    try {
      const root = path.join(parent, name)
      const paths = await reported(root)
      assert.deepEqual(
        paths.filter((p) => p.startsWith(path.join(root, '.git', 'objects'))),
        [],
        'nothing below .git/objects',
      )
      assert.ok(paths.includes(path.join(root, 'sentinel')))
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
}
