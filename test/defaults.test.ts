import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, type Session } from '../src/bridge/facts.ts'
import { runtimeDefaults } from '../src/bridge/defaults.ts'
import { launchOf } from '../src/shared/launch.ts'
import { fixture } from './replay.ts'

const NONE = { model: undefined, effort: undefined }

/** A recorded session launched as `flags` ask, its argv's own `--model haiku` swapped for them, its main loop's last step at `steppedAt`. */
function launchedAs(name: string, flags: string[], steppedAt: number): Session {
  const log = fixture(name)
  const argv = log.header.argv.flatMap((arg, i, all) => (arg === '--model' ? flags : all[i - 1] === '--model' ? [] : [arg]))
  return { header: { ...log.header, argv }, facts: { ...factsOf(log), steppedAt } }
}

test('launchOf: reads what the composer placed after the config\'s argv, never the config\'s own flags', () => {
  assert.deepEqual(launchOf(['claude', '--model', 'opus', '--name', 'A-1', '--effort', 'low', '--', 'go']), { name: 'A-1', resume: undefined, model: undefined, effort: 'low', prompt: 'go' })
  assert.deepEqual(launchOf(['claude', '--name', 'A-1', '--model', 'sonnet', '--effort', 'max']), { name: 'A-1', resume: undefined, model: 'sonnet', effort: 'max', prompt: undefined })
  assert.deepEqual(launchOf(['claude', '--name', 'A-1', '--resume', 'c1', '--', 'go']), { name: 'A-1', resume: 'c1', model: undefined, effort: undefined, prompt: 'go' })
})

test('runtimeDefaults: the latest step of the spawns that asked for neither tells both, a `/model` pick included', () => {
  const plain = launchedAs('compact-auto', [], 1)
  assert.deepEqual(runtimeDefaults([plain], 'claude'), { model: 'claude-haiku-5-5', effort: 'medium' })
  const picked = { ...plain, facts: { ...plain.facts, model: 'claude-opus-5-5', effort: 'high', steppedAt: 3 } }
  assert.deepEqual(runtimeDefaults([plain, picked], 'claude'), { model: 'claude-opus-5-5', effort: 'high' })
})

test('runtimeDefaults: a spawn that asked for an effort still tells the model; the effort is told only on the default model', () => {
  const plain = launchedAs('compact-auto', [], 1)
  const effortAsked = launchedAs('compact-manual', ['--effort', 'high'], 2)
  effortAsked.facts.model = 'claude-opus-5-5'
  assert.deepEqual(runtimeDefaults([plain, effortAsked], 'claude'), { model: 'claude-opus-5-5', effort: undefined })
  const otherModel = launchedAs('compact-manual', ['--model', 'sonnet'], 2)
  otherModel.facts.model = 'claude-sonnet-5-5'
  otherModel.facts.effort = 'low'
  assert.deepEqual(runtimeDefaults([plain, otherModel], 'claude'), { model: 'claude-haiku-5-5', effort: 'medium' })
  const defaultModel = launchedAs('compact-manual', ['--model', 'haiku'], 2)
  defaultModel.facts.effort = 'low'
  assert.deepEqual(runtimeDefaults([plain, defaultModel], 'claude'), { model: 'claude-haiku-5-5', effort: 'low' })
})

test('runtimeDefaults: a flag asked for, a resume, or no step yet tells nothing; a step with no effort leaves it unknown', () => {
  const recorded = (name: string) => runtimeDefaults([fixture(name)].map((log) => ({ header: log.header, facts: factsOf(log) })), 'claude')
  assert.deepEqual(recorded('compact-auto'), NONE)
  assert.deepEqual(recorded('resumed'), NONE)
  assert.deepEqual(recorded('trust-dialog'), NONE)
  assert.deepEqual(runtimeDefaults([launchedAs('tool-turn', [], 1)], 'claude'), { model: 'claude-haiku-4-5-20251001', effort: undefined })
})

test('runtimeDefaults: a spawn that asked for haiku does not erase the effort default', () => {
  const plain = launchedAs('compact-auto', [], 1)
  const haiku = launchedAs('compact-manual', ['--model', 'haiku'], 2)
  haiku.facts.model = 'claude-haiku-4-5-20251001'
  haiku.facts.effort = undefined
  assert.deepEqual(runtimeDefaults([plain, haiku], 'claude'), { model: 'claude-haiku-5-5', effort: 'medium' })
})
