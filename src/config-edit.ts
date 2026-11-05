/**
 * Editing the config through the API (`config/add`, `config/append`, `config/set`, `config/remove`): the tower's own
 * writes to the file the user also edits by hand. The config has two writers, so an edit that replaces or deletes a
 * value takes `was`, the value the caller read at its key, and applies only while the key still holds it, the way
 * `compare-and-set!` swaps an atom: a change at another key never conflicts. An edit is refused when it would bring the
 * config any problem `tower config check` would name, a warning included, that it didn't have before; problems the
 * user already had are theirs to fix and don't hold an edit back. The file is read, edited, checked and written in one
 * synchronous step, so two edits in the tower never interleave, and moved into place whole.
 */
import { realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { configProblems, type ConfigProblem } from './config-check.ts'
import { apiError, isApiError, type ApiError } from './shared/api.ts'
import type { Config } from './shared/model.ts'
import { readConfig } from './system.ts'

/** Names a key path can't hold: they reach an object's prototype, not a key of its own. */
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

/** A key segment under an array: an element's index. */
const INDEX = /^\d+$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The key path, its segments joined by dots: `projects.my-app.repos.0`. */
export const keyName = (key: readonly string[]): string => key.join('.')

export type ConfigEdit =
  | { t: 'add'; key: readonly string[]; value: unknown }
  | { t: 'append'; key: readonly string[]; value: unknown }
  | { t: 'set'; key: readonly string[]; value: unknown; was: unknown }
  | { t: 'remove'; key: readonly string[]; was: unknown }

/** What an edit did, the config after it; `unchanged`, an append whose value the array already held. */
export type Edited = { t: 'added' | 'appended' | 'unchanged' | 'set' | 'removed'; config: Config }

const notFound = (key: readonly string[]) => apiError('not_found', `${keyName(key)} is not in the config: read it again (GET /config) for the keys it holds`)

/**
 * `config` with `value` at `key`, a new object every step down and objects missing on the way made, or why it can't
 * hold it: a parent that isn't an object, or the key already there. An array on the way is refused: `append` adds to one.
 */
const withKey = (config: Config, key: readonly string[], value: unknown): Config | ApiError => {
  const step = (at: unknown, i: number): Record<string, unknown> | ApiError => {
    const parent = keyName(key.slice(0, i)) || 'the config'
    if (Array.isArray(at)) return apiError('refused', `${parent} is an array: add to it with config/append`)
    if (!isObject(at)) return apiError('refused', `${parent} holds no object to add ${keyName(key)} under`)
    const k = key[i]
    if (i === key.length - 1) return Object.hasOwn(at, k) ? apiError('exists', `${keyName(key)} is already in the config: change it with config/set`) : { ...at, [k]: value }
    const next = step(Object.hasOwn(at, k) ? at[k] : {}, i + 1)
    return isApiError(next) ? next : { ...at, [k]: next }
  }
  return step(config, 0) as Config | ApiError
}

/** The value under `parent` at segment `k`: an own key of an object, or an index below an array's length. */
const childOf = (parent: unknown, k: string): { value: unknown } | undefined => {
  if (Array.isArray(parent)) return INDEX.test(k) && Number(k) < parent.length ? { value: parent[Number(k)] } : undefined
  return isObject(parent) && Object.hasOwn(parent, k) ? { value: parent[k] } : undefined
}

/** The value at `key`, when every segment of it is there. */
const valueAt = (config: Config, key: readonly string[]): { value: unknown } | undefined =>
  key.reduce<{ value: unknown } | undefined>((at, k) => at && childOf(at.value, k), { value: config })

/** `parent` with its child at `k` replaced by `value`, or removed when `value` is `undefined`: a new array or object. */
const replaced = (parent: unknown[] | Record<string, unknown>, k: string, value: unknown): unknown[] | Record<string, unknown> => {
  if (Array.isArray(parent)) return value === undefined ? parent.toSpliced(Number(k), 1) : parent.with(Number(k), value)
  if (value !== undefined) return { ...parent, [k]: value }
  const { [k]: _, ...rest } = parent
  return rest
}

/**
 * `config` with the value at an existing `key` changed by `change`: the value it holds now in, its replacement out
 * (`undefined` to remove it), or why not. Every segment must be there: an own key of an object, or an index below an
 * array's length.
 */
const atKey = (config: Config, key: readonly string[], change: (now: unknown) => unknown | ApiError): Config | ApiError => {
  const step = (at: unknown, i: number): unknown[] | Record<string, unknown> | ApiError => {
    const child = childOf(at, key[i])
    if (!child) return notFound(key)
    const next = i === key.length - 1 ? change(child.value) : step(child.value, i + 1)
    return isApiError(next) ? next : replaced(at as unknown[] | Record<string, unknown>, key[i], next)
  }
  return step(config, 0) as Config | ApiError
}

const changed = (key: readonly string[]) =>
  apiError('changed', `${keyName(key)} changed since it was read: read the config again (GET /config) and edit from what it holds now`)

/** `change`, applied only while the value at the key is still deep-equal to `was`. */
const unlessChanged = (key: readonly string[], was: unknown, change: (now: unknown) => unknown) => (now: unknown) => (isDeepStrictEqual(now, was) ? change(now) : changed(key))

const appended = (key: readonly string[], value: unknown) => (now: unknown) =>
  Array.isArray(now) ? [...now, value] : apiError('refused', `${keyName(key)} is no array: config/append adds to an array, config/set replaces a value`)

/** The edit applied to `config`, or why it can't be. Pure. */
export const edited = (config: Config, edit: ConfigEdit): Edited | ApiError => {
  const unsafe = edit.key.find((k) => UNSAFE.has(k))
  if (unsafe !== undefined) return apiError('invalid', `key: "${unsafe}" can't name a config key`)
  const as = (t: Edited['t'], next: Config | ApiError): Edited | ApiError => (isApiError(next) ? next : { t, config: next })
  switch (edit.t) {
    case 'add':
      return as('added', withKey(config, edit.key, edit.value))
    case 'append': {
      const held = valueAt(config, edit.key)?.value
      if (Array.isArray(held) && held.some((v) => isDeepStrictEqual(v, edit.value))) return { t: 'unchanged', config }
      return as('appended', atKey(config, edit.key, appended(edit.key, edit.value)))
    }
    case 'set':
      return as('set', atKey(config, edit.key, unlessChanged(edit.key, edit.was, () => edit.value)))
    case 'remove':
      return as('removed', atKey(config, edit.key, unlessChanged(edit.key, edit.was, () => undefined)))
  }
}

/**
 * A problem as an edit compares it: its key without array indexes, since removing an element renumbers the problems
 * after it. The problem's words name the value, so a problem that only moved still tells apart from a new one.
 */
const problemKey = (p: ConfigProblem) => `${p.level}\n${p.key.replace(/\[\d+\]/g, '[]')}\n${p.problem}`

/**
 * The problems `after` has that `before` didn't, of any level, counted as a multiset: what an edit would break. Pure
 * but for reading extensions' folders.
 */
export const newProblems = (before: Config, after: Config): ConfigProblem[] => {
  const had = new Map<string, number>()
  for (const p of configProblems(before)) had.set(problemKey(p), (had.get(problemKey(p)) ?? 0) + 1)
  return configProblems(after).filter((p) => {
    const left = had.get(problemKey(p)) ?? 0
    had.set(problemKey(p), left - 1)
    return left <= 0
  })
}

/** The edit, refused when it would bring a new problem, each named at its key. Pure but for reading extensions' folders. */
export const checkedEdit = (before: Config, edit: ConfigEdit): Edited | ApiError => {
  const done = edited(before, edit)
  if (isApiError(done) || done.t === 'unchanged') return done
  const problems = newProblems(before, done.config)
  if (!problems.length) return done
  const named = problems.map((p) => `${p.key}: ${p.problem}${p.level === 'warn' ? ' (a warning)' : ''}`).join('; ')
  return apiError('config', `${keyName(edit.key)} would bring the config new problems: ${named}`)
}

/**
 * Writes `config` to the file as JSON indented by two spaces, beside the file's real path, so a config that is a link
 * keeps being one, with the file's mode, then moves the new text into place whole.
 */
const writeConfig = (file: string, config: Config) => {
  const real = realpathSync(file)
  const temp = path.join(path.dirname(real), `.${path.basename(real)}.${process.pid}.${Date.now()}`)
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: statSync(real).mode & 0o777 })
  renameSync(temp, real)
}

/** Applies the edit to the config file, refused as `checkedEdit` says; an `unchanged` edit writes nothing. */
export const editConfig = (file: string, edit: ConfigEdit): Edited['t'] | ApiError => {
  const done = checkedEdit(readConfig(file), edit)
  if (isApiError(done)) return done
  if (done.t !== 'unchanged') writeConfig(file, done.config)
  return done.t
}
