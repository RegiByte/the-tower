/**
 * The tower process as a system of braided resources, each started once its dependencies have and halted before them
 * (decision `spine`). The core's pieces:
 *
 *   core:config     the config's path and the system root's, and the config as the file holds it now
 *   core:system     the live view of every log, stream, collection and daemon (src/system.ts), and who hears it change
 *   core:probes     the probes' runner (src/probes.ts)
 *   core:publisher  the board, and the clients of `GET /board` (publisher.ts)
 *   core:dispatch   every verb's handler (dispatch.ts)
 *   core:slots      the policies' runner, which acts through the verbs (src/policies.ts)
 *   core:http       the renderer API on the config's port (http.ts)
 */
import { defineResource, type StartedResource } from 'braided'
import { runPolicies } from '../policies.ts'
import { runProbes } from '../probes.ts'
import { configPath, systemPaths } from '../shared/paths.ts'
import { readConfig, watchSystem } from '../system.ts'
import type { Answer } from './answers.ts'
import { dispatch } from './dispatch.ts'
import { httpOf } from './http.ts'
import { publisher } from './publisher.ts'

/** The config is read again on every call: the user edits it at any time, and every read sees the edit. */
export const config = defineResource({
  start: () => {
    const paths = systemPaths(configPath())
    return { paths, read: () => readConfig(paths.config) }
  },
  halt: () => {},
})

export const system = defineResource({
  dependencies: ['core:config'],
  start: async ({ 'core:config': { paths } }: { 'core:config': StartedResource<typeof config> }) => {
    const listeners = new Set<() => void>()
    const live = await watchSystem(paths, () => {
      for (const listener of listeners) listener()
    })
    /** Calls `listener` after anything the system holds changes, until the returned function is called. */
    const onChange = (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
    return { ...live, onChange }
  },
  halt: (live) => live.stop(),
})

export const probes = defineResource({
  dependencies: ['core:config', 'core:system'],
  start: ({ 'core:config': { paths, read }, 'core:system': live }: { 'core:config': StartedResource<typeof config>; 'core:system': StartedResource<typeof system> }) =>
    runProbes(paths, read, live.sessions, live.probes),
  halt: ({ stop }) => stop(),
})

export const slots = defineResource({
  dependencies: ['core:dispatch', 'core:publisher'],
  start: ({ 'core:dispatch': { handlers }, 'core:publisher': { board } }: { 'core:dispatch': StartedResource<typeof dispatch>; 'core:publisher': StartedResource<typeof publisher> }) =>
    runPolicies(board, {
      run: (input) => handlers['policy/run'](input) as Promise<Answer>,
      pass: (input) => handlers['policy/pass'](input) as Promise<Answer>,
    }),
  halt: ({ stop }) => stop(),
})

/** The tower's system: the core's resources by name. */
export const tower = () => {
  const resources = {
    'core:config': config,
    'core:system': system,
    'core:probes': probes,
    'core:publisher': publisher,
    'core:dispatch': dispatch,
    'core:slots': slots,
    'core:http': httpOf(),
  }
  return resources
}
