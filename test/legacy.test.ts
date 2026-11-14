import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { configProblems } from '../src/config-check.ts'
import { LEGACY, Manifest, streamFolder } from '../src/shared/extensions.ts'
import { readingStreams } from '../src/bridge/rate-limits.ts'
import { VIEW_ALIASES } from '../src/shared/views.ts'
import type { Config } from '../src/shared/model.ts'

const config = (over: Partial<Config> & Record<string, unknown>): Config => ({ argv: ['claude'], projects: {}, ...over }) as Config

test('tower config check fails the quota probe\'s old spelling, with the line to write', () => {
  const problems = (probes: unknown) => configProblems(config({ projects: { lab: { name: 'lab', hub: '/', repos: [] } }, probes } as never)).filter((p) => p.key.startsWith('probes'))
  assert.deepEqual(problems({ quota: { off: true, every: '1h' } }), [
    { level: 'fail', key: 'probes', problem: 'probes is the quota extension\'s old spelling, read by nothing since 2.0: write "extensions": { "quota": {"off":true,"settings":{"every":"1h"}} } and remove probes' },
  ])
  assert.deepEqual(problems({ mine: { every: '10m' } }), [{ level: 'fail', key: 'probes', problem: "probes is the quota extension's old spelling, read by nothing since 2.0: remove it" }])
})

test('LEGACY names a view alias for each retired view, and a moved stream keeps its old folder', () => {
  for (const e of LEGACY) if (e.kind === 'view') assert.ok(VIEW_ALIASES[e.old], e.old)
  assert.equal(streamFolder('quota.reads'), 'probe.quota', 'a moved stream keeps its old folder')
  assert.equal(streamFolder('pulse.beats'), 'pulse.beats')
})

test("the core folds the readings a manifest declares, from the manifest alone", () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'extensions', 'quota', 'extension.json'), 'utf8')))
  const [stream, ...more] = readingStreams([manifest, manifest])
  assert.deepEqual([stream.folder, more.length], ['probe.quota', 0], 'once per folder, the folder the stream kept')
  const limits = [{ kind: 'seven_day', percentUsed: 9 }]
  assert.deepEqual(stream.reading('u', { ms: 1, answer: {}, limits, unavailable: false }), { ms: 1, answer: {}, limits, unavailable: false })
  assert.equal(stream.reading('f', { ms: 1, error: 'x' }), undefined)
  assert.deepEqual(readingStreams([{ ...manifest, streams: { reads: { ...manifest.streams!.reads, scope: 'project' } } }]), [], 'the account is read in a system stream')
})
