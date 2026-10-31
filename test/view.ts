import type { SystemView } from '../src/bridge/board.ts'
import type { Config } from '../src/shared/model.ts'

/** A system with nothing in it under `config`, with `over` set. */
export const viewOf = (config: Config, over: Partial<SystemView> = {}): SystemView => ({
  config,
  sessions: [],
  host: undefined,
  processes: [],
  peers: [],
  shells: [],
  items: [],
  repos: new Map(),
  logFiles: new Map(),
  readings: [],
  streams: [],
  extensions: [],
  stores: [],
  paths: { config: '/config.json', collections: '/c' },
  keeps: [],
  viewers: {},
  now: 0,
  ...over,
})
