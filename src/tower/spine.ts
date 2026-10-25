/**
 * The tower process as a system of braided resources, each started once its dependencies have and halted before them
 * (decision `spine`). The core's pieces:
 *
 *   core:config     the config's path and the system root's, and the config as the file holds it now
 *   core:system     the live view of every log, stream, collection and daemon (src/system.ts), and who hears it change
 *   core:publisher  the board, and the clients of `GET /board` (publisher.ts)
 *   core:dispatch   every verb's handler (dispatch.ts)
 *   core:slots      the slot loop: the extensions' slots, the policies' among them (src/slots.ts)
 *   core:http       the renderer API on the config's port (http.ts)
 *   core:extensions what the board and `GET /extensions` show of the extensions (extensions.ts)
 *
 * and one resource per extension the config and the checkout declare, `x:<cap>`, beside them (extensions.ts).
 */
import { defineResource, type StartedSystem, type StartedResource } from 'braided'
import { configNow } from '../bridge/legacy.ts'
import { configPath, systemPaths } from '../shared/paths.ts'
import { extensionSlots, runSlots } from '../slots.ts'
import { readConfig, watchSystem } from '../system.ts'
import { dispatch } from './dispatch.ts'
import { extensions, type ExtensionsResource } from './extensions.ts'
import { httpServer } from './http.ts'
import { publisher, type PublisherResource } from './publisher.ts'

/**
 * The config is read again on every call: the user edits it at any time, and every read sees the edit. Its old
 * spellings are read where they are now (`configNow`).
 */
export const config = defineResource({
  start: () => {
    const paths = systemPaths(configPath())
    return { paths, read: () => configNow(readConfig(paths.config)) }
  },
  halt: () => {},
})
export type ConfigResource = StartedResource<typeof config>

export const system = defineResource({
  dependencies: ['core:config'],
  start: async ({ 'core:config': { paths } }: { 'core:config': ConfigResource }) => {
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
export type SystemResource = StartedResource<typeof system>

type SlotsDeps = { 'core:config': ConfigResource; 'core:publisher': PublisherResource; 'core:extensions': ExtensionsResource }

export const slots = defineResource({
  dependencies: ['core:config', 'core:publisher', 'core:extensions'],
  start: ({ 'core:config': { read }, 'core:publisher': { board }, 'core:extensions': holder }: SlotsDeps) => runSlots([extensionSlots(holder, read, board)]),
  halt: ({ stop }) => stop(),
})
export type SlotsResource = StartedResource<typeof slots>

/** The tower's system: the core's resources by name. */
export const tower = () => ({
  'core:config': config,
  'core:system': system,
  'core:extensions': extensions,
  'core:publisher': publisher,
  'core:dispatch': dispatch,
  'core:slots': slots,
  'core:http': httpServer,
})
export type TowerResources = ReturnType<typeof tower>
export type TowerSystem = StartedSystem<TowerResources>
