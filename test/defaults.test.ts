import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, type Session } from '../src/bridge/facts.ts'
import { claudeDefaults } from '../src/bridge/defaults.ts'
import { launchFlags } from '../src/shared/launch.ts'
import { fixture } from './replay.ts'

const NONE = { model: undefined, effort: undefined }

/** A recorded session launched as `flags` ask, its argv's own `--model haiku` swapped for them, its main loop's last step at `steppedAt`. */
function launchedAs(name: string, flags: string[], steppedAt: number): Session {
  const log = fixture(name)
  const argv = log.header.argv.flatMap((arg, i, all) => (arg === '--model' ? flags : all[i - 1] === '--model' ? [] : [arg]))
  return { header: { ...log.header, argv }, facts: { ...factsOf(log), steppedAt } }
}

test('launchFlags: reads the launch\'s model and effort before its prompt, never the config\'s', () => {
  assert.deepEqual(launchFlags(['claude', '--model', 'opus', '--name', 'A-1', '--effort', 'low', '--', 'go']), { model: undefined, effort: 'low' })
  assert.deepEqual(launchFlags(['claude', '--name', 'A-1', '--model', 'sonnet', '--effort', 'max']), { model: 'sonnet', effort: 'max' })
  assert.deepEqual(launchFlags(['claude', '--name', 'A-1', '--resume', 'c1', '--', 'go']), { model: undefined, effort: undefined })
})

test('claudeDefaults: the latest step of the spawns that asked for neither tells both, a `/model` pick included', () => {
  const plain = launchedAs('compact-auto', [], 1)
  assert.deepEqual(claudeDefaults([plain]), { model: 'claude-haiku-5-5', effort: 'medium' })
  const picked = { ...plain, facts: { ...plain.facts, model: 'claude-opus-5-5', effort: 'high', steppedAt: 3 } }
  assert.deepEqual(claudeDefaults([plain, picked]), { model: 'claude-opus-5-5', effort: 'high' })
})

test('claudeDefaults: a spawn that asked for an effort still tells the model; the effort is told only on the default model', () => {
  const plain = launchedAs('compact-auto', [], 1)
  const effortAsked = launchedAs('compact-manual', ['--effort', 'high'], 2)
  effortAsked.facts.model = 'claude-opus-5-5'
  assert.deepEqual(claudeDefaults([plain, effortAsked]), { model: 'claude-opus-5-5', effort: undefined })
  const otherModel = launchedAs('compact-manual', ['--model', 'sonnet'], 2)
  otherModel.facts.model = 'claude-sonnet-5-5'
  otherModel.facts.effort = 'low'
  assert.deepEqual(claudeDefaults([plain, otherModel]), { model: 'claude-haiku-5-5', effort: 'medium' })
  const defaultModel = launchedAs('compact-manual', ['--model', 'haiku'], 2)
  defaultModel.facts.effort = 'low'
  assert.deepEqual(claudeDefaults([plain, defaultModel]), { model: 'claude-haiku-5-5', effort: 'low' })
})

test('claudeDefaults: a flag asked for, a resume, or no step yet tells nothing; a step with no effort leaves it unknown', () => {
  const recorded = (name: string) => claudeDefaults([fixture(name)].map((log) => ({ header: log.header, facts: factsOf(log) })))
  assert.deepEqual(recorded('compact-auto'), NONE)
  assert.deepEqual(recorded('resumed'), NONE)
  assert.deepEqual(recorded('trust-dialog'), NONE)
  assert.deepEqual(claudeDefaults([launchedAs('tool-turn', [], 1)]), { model: 'claude-haiku-4-5-20251001', effort: undefined })
})

test('claudeDefaults: a spawn that asked for haiku does not erase the effort default', () => {
  const plain = launchedAs('compact-auto', [], 1)
  const haiku = launchedAs('compact-manual', ['--model', 'haiku'], 2)
  haiku.facts.model = 'claude-haiku-4-5-20251001'
  haiku.facts.effort = undefined
  assert.deepEqual(claudeDefaults([plain, haiku]), { model: 'claude-haiku-5-5', effort: 'medium' })
})
