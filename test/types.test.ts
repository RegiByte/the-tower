import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { Manifest } from '../src/shared/extensions.ts'
import { libraryUrls } from '../src/tower/served.ts'
import { advice, packagesNamed, writeTypes } from '../src/types.ts'
import { REPO, typecheck } from './library.ts'

const FIXTURE = path.join(import.meta.dirname, 'outside')
const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tower-types-')))
const cache = path.join(scratch, 'cache')

after(() => rmSync(scratch, { recursive: true }))

/** A folder outside the checkout as an author has it: the extension, `@types/node` installed, `tower types` run. */
const outsideFolder = (name: string): string => {
  const folder = path.join(scratch, name)
  cpSync(FIXTURE, folder, { recursive: true })
  for (const dep of ['@types/node', 'undici-types']) cpSync(path.join(REPO, 'node_modules', dep), path.join(folder, 'node_modules', dep), { recursive: true })
  writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({ extends: './.tower/tsconfig.json' }))
  writeTypes(cache, folder)
  return folder
}

const filesOf = (folder: string) => Object.fromEntries(readdirSync(folder, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => [path.relative(folder, path.join(e.parentPath, e.name)), readFileSync(path.join(e.parentPath, e.name), 'utf8')]))

const written = (folder: string) => filesOf(path.join(folder, '.tower'))

test('the outside fixture is an extension, and imports from every library module', () => {
  Manifest.parse(JSON.parse(readFileSync(path.join(FIXTURE, 'extension.json'), 'utf8')))
  const text = Object.values(filesOf(FIXTURE)).join('\n')
  assert.deepEqual(libraryUrls().filter((url) => !text.includes(`from '${url}'`)), [])
})

test('an extension typechecks against the emitted tree alone, every declaration checked, nothing read from the checkout', () => {
  const folder = outsideFolder('alone')
  const { errors, files } = typecheck(path.join(folder, 'tsconfig.json'))
  assert.equal(errors, '')
  assert.deepEqual(files.filter((file) => !file.startsWith(folder) && !/\/lib\.[\w.]+\.d\.ts$/.test(file)), [])
  assert.ok(files.some((file) => file.includes('/.tower/types/node_modules/zod/')), 'the tree holds zod')
})

test('a mistake against a library type is caught outside the checkout', () => {
  const folder = outsideFolder('mistake')
  writeFileSync(path.join(folder, 'mistake.ts'), "import { esc } from '/lib/words.js'\nexport const count: number = esc('a')\n")
  assert.match(typecheck(path.join(folder, 'tsconfig.json')).errors, /mistake\.ts.*TS2322/)
})

test('tower types gives identical files, built twice or refreshed', () => {
  const folder = outsideFolder('twice')
  const first = written(folder)
  writeTypes(cache, folder)
  assert.deepEqual(written(folder), first)
  rmSync(cache, { recursive: true })
  writeTypes(cache, folder)
  assert.deepEqual(written(folder), first)
})

test('tower types keeps .tower out of git, and an author who changes its .gitignore commits the vendored packages too', () => {
  const folder = outsideFolder('committed')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, encoding: 'utf8' })
  git('init', '-q')
  writeFileSync(path.join(folder, '.gitignore'), 'node_modules\n')
  git('add', '-A')
  assert.ok(!git('ls-files').includes('.tower/'))
  writeFileSync(path.join(folder, '.tower', '.gitignore'), '!node_modules\n')
  writeTypes(cache, folder)
  git('add', '-A')
  assert.ok(git('ls-files').includes('.tower/types/node_modules/zod/package.json'))
  assert.ok(!git('ls-files').split('\n').some((file) => file.startsWith('node_modules/')))
})

test('tower types keeps one version of the code in its cache', () => {
  const folder = outsideFolder('cached')
  const types = path.join(cache, 'types')
  cpSync(path.join(folder, '.tower', 'types'), path.join(types, 'older'), { recursive: true })
  rmSync(path.join(types, readdirSync(types).find((name) => name !== 'older')!), { recursive: true })
  writeTypes(cache, folder)
  assert.equal(readdirSync(types).length, 1)
  assert.ok(!readdirSync(types).includes('older'))
})

test('advice says what a folder its tsconfig lacks, and warns of paths that replace the extended ones', () => {
  const folder = mkdtempSync(path.join(scratch, 'advice-'))
  const paths = { '/lib/*.js': ['./.tower/types/src/lib/*.d.ts'] }
  assert.match(advice(folder, paths)[0]!, /Write a tsconfig\.json/)
  writeFileSync(path.join(folder, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }')
  assert.match(advice(folder, paths)[0]!, /Add to the folder's tsconfig\.json/)
  writeFileSync(path.join(folder, 'tsconfig.json'), '{ "extends": "./.tower/tsconfig.json", "compilerOptions": { "paths": { "x": ["y"] } } }')
  const said = advice(folder, paths)
  assert.match(said[0]!, /has paths/)
  assert.equal(said[1], '  "/lib/*.js": ["./.tower/types/src/lib/*.d.ts"],')
})

test('packagesNamed reads what a declaration imports, nothing else', () => {
  const declaration = `/** import { nope } from 'in-a-comment' */
import type { z } from 'zod/v4';
import { Terminal } from "@xterm/xterm/lib";
export declare const a: import('marked').Token;
export declare const b: import('node:net').Socket;
export declare const c: Pick<Lines, 'from' | 'to'>;
/// <reference types="three" />
import { own } from './own.ts';
import { lib } from '/lib/words.js';
`
  assert.deepEqual(packagesNamed(declaration).sort(), ['@xterm/xterm', 'marked', 'three', 'zod'])
})
