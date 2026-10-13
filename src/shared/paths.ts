import os from 'node:os'
import path from 'node:path'

export type SystemPaths = {
  config: string
  sessions: string
  /** `<project>/<collection>/<item>`: the files of every project's collections. */
  collections: string
  /** What is computed from the stored state and kept to skip computing it again: safe to delete at any time. */
  cache: string
  /**
   * Logs of facts the tower observes that belong to no session, one writer each: `system/<stream>/YYYY-MM.jsonl`, the
   * system's (`probe.quota`), and `projects/<project>/<stream>/…`, a project's (`runs`, `approvals`).
   */
  streams: string
  control: string
  hooks: string
  terms: string
  /** What the host, the terms daemon and the tower print, when `tower up` starts them. */
  hostLog: string
  termsLog: string
  towerLog: string
  /** The pid of the host, the terms daemon and the tower, written by `tower up` when it starts them, removed by `tower down`. */
  hostPid: string
  termsPid: string
  towerPid: string
}

/** The config every `tower` reads when TOWER_CONFIG names none. */
export const DEFAULT_CONFIG = path.join(os.homedir(), '.tower', 'config.json')

export const configPath = (): string => process.env.TOWER_CONFIG ?? DEFAULT_CONFIG

export const systemPaths = (config: string): SystemPaths => {
  const root = path.dirname(path.resolve(config))
  return {
    config: path.resolve(config),
    sessions: path.join(root, 'sessions'),
    collections: path.join(root, 'collections'),
    cache: path.join(root, 'cache'),
    streams: path.join(root, 'streams'),
    control: path.join(root, 'control.sock'),
    hooks: path.join(root, 'hooks.sock'),
    terms: path.join(root, 'terms.sock'),
    hostLog: path.join(root, 'host.log'),
    termsLog: path.join(root, 'terms.log'),
    towerLog: path.join(root, 'tower.log'),
    hostPid: path.join(root, 'host.pid'),
    termsPid: path.join(root, 'terms.pid'),
    towerPid: path.join(root, 'tower.pid'),
  }
}

/** Where a project's collections are, one directory each. */
export const projectCollectionsPath = (paths: SystemPaths, project: string): string => path.join(paths.collections, project)

export const sessionLogPath = (paths: SystemPaths, id: string): string => path.join(paths.sessions, `${id}.jsonl`)

/** The directory of the system's streams, one directory each. */
export const systemStreamsPath = (paths: SystemPaths): string => path.join(paths.streams, 'system')

/** The directory of every project's streams: `<project>/<stream>/`, one directory each. */
export const projectsStreamsPath = (paths: SystemPaths): string => path.join(paths.streams, 'projects')

/** The directory of a project's stream. */
export const projectStreamPath = (paths: SystemPaths, project: string, stream: string): string => path.join(projectsStreamsPath(paths), project, stream)
