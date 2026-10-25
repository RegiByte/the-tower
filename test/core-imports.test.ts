import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const REPO = path.join(import.meta.dirname, '..')
const SRC = path.join(REPO, 'src')
const EXTENSIONS = path.join(REPO, 'extensions')

/** Every module specifier a file names: static imports, `export … from`, side-effect imports and dynamic imports. */
const SPECIFIERS = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm

test('nothing under src/ imports an extension: a replaced extension would leave the bundled one running inside the core', () => {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|js|mjs)$/.test(f))
  const reaching = files.flatMap((file) => {
    const text = readFileSync(path.join(SRC, file), 'utf8')
    return [...text.matchAll(SPECIFIERS)]
      .map((m) => m[2])
      .filter((spec) => spec.startsWith('.') && path.resolve(SRC, path.dirname(file), spec).startsWith(EXTENSIONS + path.sep))
      .map((spec) => `src/${file} imports ${spec}`)
  })
  assert.deepEqual(reaching, [], `the core reaches an extension's source; pass what it needs in, or read it over the API:\n${reaching.join('\n')}`)
})
