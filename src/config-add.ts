/**
 * Adding a key to the config through the API (`config/add`): the one way the tower writes the file the user otherwise
 * edits by hand. A key is added only where the config holds none, so nothing the user wrote is overwritten, and the
 * config with it is checked the way `tower config check` checks it: a fail it would bring is refused, with its key and
 * what to fix; fails it already had are the user's to fix, and don't hold back an addition. The file is read, checked
 * and written in one synchronous step, so two additions in the tower never interleave, and moved into place whole.
 */
import { realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { configProblems, type ConfigProblem } from './config-check.ts'
import { apiError, isApiError, type ApiError } from './shared/api.ts'
import type { Config } from './shared/model.ts'
import { readConfig } from './system.ts'

/** Names a key path can't hold: they reach an object's prototype, not a key of its own. */
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The key path as `tower config check` prints one: `projects.my-app`. */
export const keyName = (key: readonly string[]): string => key.join('.')

type Added = { t: 'added'; config: Config }

/**
 * `config` with `value` at `key`, a new object every step down, or why it can't hold it: a parent that isn't an object,
 * or the key already there. Pure.
 */
export const withKey = (config: Config, key: readonly string[], value: unknown): Added | ApiError => {
  const unsafe = key.find((k) => UNSAFE.has(k))
  if (unsafe !== undefined) return apiError('invalid', `key: "${unsafe}" can't name a config key`)
  const step = (at: Record<string, unknown>, i: number): Record<string, unknown> | ApiError => {
    const k = key[i]
    if (i === key.length - 1) return Object.hasOwn(at, k) ? apiError('exists', `${keyName(key)} is already in the config: change it there`) : { ...at, [k]: value }
    const below = Object.hasOwn(at, k) ? at[k] : {}
    if (!isObject(below)) return apiError('refused', `${keyName(key.slice(0, i + 1))} holds no object to add ${keyName(key)} under`)
    const next = step(below, i + 1)
    return isApiError(next) ? next : { ...at, [k]: next }
  }
  const next = step(config as unknown as Record<string, unknown>, 0)
  return isApiError(next) ? next : { t: 'added', config: next as unknown as Config }
}

const problemKey = (p: ConfigProblem) => `${p.key}\n${p.problem}`

/** The fails `after` has that `before` didn't: what an addition would break. Pure but for reading extensions' folders. */
export const newFails = (before: Config, after: Config): ConfigProblem[] => {
  const had = new Set(configProblems(before).filter((p) => p.level === 'fail').map(problemKey))
  return configProblems(after).filter((p) => p.level === 'fail' && !had.has(problemKey(p)))
}

/**
 * Adds `value` at `key` to the config file, refused as `withKey` and `newFails` say. Writes beside the file's real path,
 * so a config that is a link keeps being one, with the file's mode, then moves the new text into place whole.
 */
export const addToConfig = (file: string, key: readonly string[], value: unknown): ApiError | undefined => {
  const before = readConfig(file)
  const added = withKey(before, key, value)
  if (added.t === 'error') return added
  const after = added.config
  const fails = newFails(before, after)
  if (fails.length) return apiError('config', `${keyName(key)} would leave the config failing ${fails.map((p) => `${p.key}: ${p.problem}`).join('; ')}`)
  const real = realpathSync(file)
  const temp = path.join(path.dirname(real), `.${path.basename(real)}.${process.pid}.${Date.now()}`)
  writeFileSync(temp, `${JSON.stringify(after, null, 2)}\n`, { mode: statSync(real).mode & 0o777 })
  renameSync(temp, real)
  return undefined
}
