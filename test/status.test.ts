import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOTING, nextState } from '../src/bridge/status.ts'
import { fixture, timeline } from './replay.ts'

test('a turn the API rejects fails, with no Stop to end it', () => {
  assert.deepEqual(timeline(fixture('api-error')), [
    ['idle', 1.161],
    ['working', 14.402],
    ['failed', 15.308],
    ['exited', 37.469],
  ])
})

test('tool turns run to done', () => {
  assert.deepEqual(timeline(fixture('tool-turn')), [
    ['idle', 0.852],
    ['working', 10.343],
    ['done', 18.298],
    ['working', 39.53],
    ['done', 43.595],
    ['exited', 247.364],
  ])
})

test('Esc and a denied permission leave the session idle', () => {
  assert.deepEqual(timeline(fixture('interrupts')), [
    ['idle', 106.883],
    ['working', 123.264],
    ['idle', 127.448],
    ['working', 130.444],
    ['needs_input', 132.475],
    ['idle', 154.643],
    ['working', 158.627],
    ['done', 159.731],
    ['exited', 176.73],
  ])
})

test('a session blocked on the trust dialog, then an answered permission prompt: it waits on you, then works on through PostToolUse to done', () => {
  assert.deepEqual(timeline(fixture('permission-answered')), [
    ['blocked', 0.312],
    ['idle', 18.656],
    ['working', 18.717],
    ['needs_input', 21.405],
    ['working', 48.929],
    ['done', 50.09],
    ['exited', 84.059],
  ])
})

test('a resumed session boots idle on its old conversation', () => {
  assert.deepEqual(timeline(fixture('resumed')), [
    ['idle', 0.627],
    ['working', 14.761],
    ['done', 16.505],
    ['exited', 90.744],
  ])
})

test('a manual /compact works between turns and leaves the session idle', () => {
  assert.deepEqual(timeline(fixture('compact-manual')), [
    ['idle', 0.796],
    ['working', 2.085],
    ['done', 3.146],
    ['working', 7.471],
    ['idle', 21.574],
    ['exited', 25.908],
  ])
})

test('an automatic compaction mid-turn keeps the turn working', () => {
  assert.deepEqual(timeline(fixture('compact-auto')), [
    ['idle', 0.761],
    ['working', 2.114],
    ['done', 93.18],
    ['exited', 98.131],
  ])
})

test("Claude's workspace trust dialog blocks the session until it is answered and Claude starts", () => {
  assert.deepEqual(timeline(fixture('trust-dialog')), [
    ['blocked', 0.281],
    ['idle', 23.675],
    ['exited', 44.965],
  ])
  const events = fixture('trust-dialog').events
  assert.equal(events.filter((e) => e[0] < 23.675).reduce(nextState, BOOTING).blocked, 'trust')
})

test("Claude's first-run setup blocks the session on login until it exits", () => {
  const events = fixture('login-screen').events
  assert.deepEqual(timeline(fixture('login-screen')), [
    ['blocked', 0.917],
    ['exited', 32.963],
  ])
  assert.equal(events.slice(0, -1).reduce(nextState, BOOTING).blocked, 'login')
})

test('a permission answered No abandons the tool call: the session is idle, then a new prompt runs to done', () => {
  assert.deepEqual(timeline(fixture('permission-denied')), [
    ['blocked', 0.298],
    ['idle', 9.522],
    ['working', 9.571],
    ['needs_input', 12.283],
    ['idle', 22.536],
    ['working', 41.346],
    ['done', 42.637],
    ['exited', 49.375],
  ])
})

test('a tool call that fails keeps the turn working through PostToolUseFailure to done', () => {
  assert.deepEqual(timeline(fixture('tool-error')), [
    ['idle', 0.825],
    ['working', 0.893],
    ['done', 4.937],
    ['exited', 12.802],
  ])
})

test('Esc after Claude has said something in the turn leaves the session idle', () => {
  assert.deepEqual(timeline(fixture('interrupt-says')), [
    ['idle', 0.679],
    ['working', 0.729],
    ['idle', 6.194],
    ['exited', 21.067],
  ])
})

test("a background subagent's tool calls after the main loop's Stop leave the session watching until it wakes it", () => {
  assert.deepEqual(timeline(fixture('subagent-background')), [
    ['idle', 0.772],
    ['working', 0.865],
    ['watching', 6.556],
    ['working', 12.03],
    ['done', 13.941],
    ['exited', 34.473],
  ])
})

test('a background shell keeps the session watching until its notification wakes a turn that ends done', () => {
  assert.deepEqual(timeline(fixture('background-shell')), [
    ['blocked', 0.344],
    ['idle', 23.245],
    ['working', 23.374],
    ['watching', 32.447],
    ['working', 43.974],
    ['done', 47.22],
    ['exited', 67.405],
  ])
})

test('a Monitor wakes a turn per event and keeps the session watching until its command exits', () => {
  assert.deepEqual(timeline(fixture('monitor')), [
    ['idle', 0.777],
    ['working', 0.918],
    ['watching', 9.312],
    ['working', 14.389],
    ['watching', 15.539],
    ['working', 20.221],
    ['done', 21.477],
    ['exited', 52.363],
  ])
})

test("a /loop on an interval watches between its cron's turns until the cron is deleted", () => {
  assert.deepEqual(timeline(fixture('loop-cron')), [
    ['idle', 0.759],
    ['working', 0.937],
    ['watching', 12.427],
    ['working', 70.44],
    ['watching', 71.663],
    ['working', 130.514],
    ['watching', 131.521],
    ['working', 143.276],
    ['done', 147.308],
    ['exited', 262.108],
  ])
})

test('a self-paced /loop watches while a ScheduleWakeup is pending, and is done on the turn that schedules none', () => {
  assert.deepEqual(timeline(fixture('loop-wakeup')), [
    ['idle', 0.99],
    ['working', 1.071],
    ['watching', 14.747],
    ['working', 129.571],
    ['watching', 135.295],
    ['working', 249.829],
    ['done', 254.611],
    ['exited', 262.379],
  ])
})

test('a background task stopped from /tasks raises no event: the session stays watching until it exits', () => {
  assert.deepEqual(timeline(fixture('task-stopped')), [
    ['idle', 0.635],
    ['working', 0.684],
    ['watching', 7.857],
    ['exited', 220.096],
  ])
})
