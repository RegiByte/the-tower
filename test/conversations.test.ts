import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationsOf, latestSaved } from '../src/bridge/conversation.ts'
import type { LogEvent } from '../src/shared/model.ts'
import { fixture } from './replay.ts'

test('/clear moves a session to a new conversation, each with its own prompt and answer', () => {
  assert.deepEqual(conversationsOf(fixture('clear')), [
    { id: '526186c3-7066-4691-9d1c-065cdc2d62a8', at: 5.751, resumed: false, saved: true, prompt: 'reply with exactly the word PONG and nothing else', answer: 'PONG' },
    { id: '8c9fb546-abf3-4905-9965-c35b35401235', at: 10.118, resumed: false, saved: true, prompt: 'reply with exactly the word PING and nothing else', answer: 'PING' },
  ])
})

test('a cleared conversation is not saved until it is prompted: a resume continues the one before', () => {
  const log = fixture('clear')
  const cleared = conversationsOf({ ...log, events: log.events.filter((e) => e[0] < 11) })
  assert.deepEqual(cleared.map((c) => c.saved), [true, false])
  assert.equal(latestSaved(cleared)?.id, '526186c3-7066-4691-9d1c-065cdc2d62a8')
})

test('a resumed conversation is saved before it is prompted', () => {
  const log = fixture('resumed')
  const [conversation] = conversationsOf({ ...log, events: log.events.filter((e) => e[0] < 14) })
  assert.deepEqual(conversation, { id: '02daf4de-444e-400c-81aa-cde27b45acc2', at: 0.627, resumed: true, saved: true })
})

/** The last prompt of `interrupts` (158.609, "Reply with just the word ok.") as a background task's notification. */
const asNotification = (event: LogEvent): LogEvent =>
  event[0] === 158.609 && event[1] === 'h' && event[2].hook_event_name === 'prompt.submit'
    ? [event[0], 'h', { ...event[2], text: '<task-notification>done</task-notification>', origin: { kind: 'task-notification' } }]
    : event

test('a prompt the harness injects is not the user’s prompt', () => {
  const log = fixture('interrupts')
  assert.equal(conversationsOf(log)[0].prompt, 'Reply with just the word ok.')
  assert.equal(
    conversationsOf({ ...log, events: log.events.map(asNotification) })[0].prompt,
    'Use the Write tool to create the file /Users/developer/mc-deny-probe.txt containing the word hi.',
  )
})

test("a background subagent's task notification is not the user's prompt, and the answer to it is the conversation's answer", () => {
  assert.deepEqual(conversationsOf(fixture('subagent-background')), [
    {
      id: 'a3278695-e9c0-4bf6-aa09-fa077f323bf1',
      at: 0.772,
      resumed: false,
      saved: true,
      prompt: 'Use the Agent tool to start one general-purpose subagent with this task: read facts.txt, then more.txt, then last.txt with the Read tool, one file per message, waiting for each before the next, then report all three. When it returns, tell me in one sentence what it found.',
      answer: 'The agent found three related facts: a lighthouse at Saint Ives was painted red in 1902, its keeper was Thomas, and the lamp burned whale oil.',
    },
  ])
})

test('Esc mid-answer: what Claude wrote before it is the conversation’s answer', () => {
  const { answer } = conversationsOf(fixture('interrupt-says'))[0]
  assert.ok(answer!.startsWith("Now I'll write an 800-word story inspired by this fact about the red lighthouse."))
  assert.ok(answer!.endsWith('Thomas supposed that was the point—white lighthouses dot'))
})
