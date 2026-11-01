import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promptRefusal } from '../src/bridge/composer.ts'
import { factsOf } from '../src/bridge/facts.ts'
import type { SessionLog } from '../src/shared/model.ts'
import { fixture } from './replay.ts'

/** Whether the session takes a prompt from outside its terminal at second `t` of its log, and why not. */
const refusalAt = (log: SessionLog, t: number) => {
  const { state, heldSince } = factsOf({ ...log, events: log.events.filter((e) => e[0] <= t) })
  return promptRefusal(state.status, heldSince) ?? 'at_prompt'
}

test('text typed into the composer after an answer holds it until a prompt or Ctrl+C empties it', () => {
  const log = fixture('composer-typed')
  assert.equal(refusalAt(log, 0.3), 'not_at_prompt', 'starting')
  assert.equal(refusalAt(log, 0.42), 'at_prompt', 'Claude started')
  assert.equal(refusalAt(log, 1), 'not_at_prompt', 'working')
  assert.equal(refusalAt(log, 3), 'at_prompt', 'done, nothing typed since')
  assert.equal(refusalAt(log, 3.75), 'composer_holds', 'submit/at-prompt typed PING and pressed Enter: not yet submitted')
  assert.equal(refusalAt(log, 6), 'at_prompt', 'PING answered')
  assert.equal(refusalAt(log, 8), 'composer_holds', '"half typed" sits in the composer')
  assert.equal(refusalAt(log, 9.5), 'at_prompt', 'Ctrl+C cleared it')
})

test('Shift+Tab at the prompt cycles the permission mode and fills nothing', () => {
  const log = fixture('composer-typed')
  const shifted = { ...log, events: [...log.events.filter((e) => e[0] <= 3), [3.1, 'i', '\x1b[Z'] as (typeof log.events)[number]] }
  assert.equal(refusalAt(shifted, 3.2), 'at_prompt')
})

test('an Esc before Claude streams puts the prompt back in the composer', () => {
  assert.equal(refusalAt(fixture('escaped-prompt'), 0.98), 'not_at_prompt')
  assert.equal(refusalAt(fixture('escaped-prompt'), 2), 'composer_holds')
})

test('an Esc after Claude streamed, and a denied permission, leave the composer empty', () => {
  const log = fixture('interrupts')
  assert.equal(refusalAt(log, 128), 'at_prompt', 'interrupted mid-story')
  assert.equal(refusalAt(log, 140), 'not_at_prompt', 'asks permission')
  assert.equal(refusalAt(log, 155), 'at_prompt', 'the permission denied')
  assert.equal(refusalAt(log, 158.6), 'composer_holds', 'a prompt typed, not yet submitted')
  assert.equal(refusalAt(log, 160), 'at_prompt', 'answered')
})

test('keys answering a permission dialog are not typed into the composer', () => {
  const log = fixture('permission-answered')
  assert.equal(refusalAt(log, 30), 'not_at_prompt')
  assert.equal(refusalAt(log, 51), 'at_prompt')
})

test('a slash command submitted from the composer empties it', () => {
  const log = fixture('clear')
  assert.equal(refusalAt(log, 9.5), 'composer_holds', '/clear typed')
  assert.equal(refusalAt(log, 10.5), 'at_prompt', 'the new conversation started')
})
