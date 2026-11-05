import os from 'node:os'
import path from 'node:path'
import type { SystemPaths } from './model.ts'

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
    jobs: path.join(root, 'jobs'),
    control: path.join(root, 'control.sock'),
    hooks: path.join(root, 'hooks.sock'),
    terms: path.join(root, 'terms.sock'),
    jobsSocket: path.join(root, 'jobs.sock'),
    hostLog: path.join(root, 'host.log'),
    termsLog: path.join(root, 'terms.log'),
    jobsLog: path.join(root, 'jobs.log'),
    towerLog: path.join(root, 'tower.log'),
    hostPid: path.join(root, 'host.pid'),
    termsPid: path.join(root, 'terms.pid'),
    jobsPid: path.join(root, 'jobs.pid'),
    towerPid: path.join(root, 'tower.pid'),
  }
}

/** Where a project's collections are, one directory each. */
export const projectCollectionsPath = (paths: SystemPaths, project: string): string => path.join(paths.collections, project)

export const sessionLogPath = (paths: SystemPaths, id: string): string => path.join(paths.sessions, `${id}.jsonl`)

/** The directory of the system's streams, one directory each. */
export const systemStreamsPath = (paths: SystemPaths): string => path.join(paths.streams, 'system')

/** The directory of a system stream. */
export const systemStreamPath = (paths: SystemPaths, stream: string): string => path.join(systemStreamsPath(paths), stream)

/** The directory of every project's streams: `<project>/<stream>/`, one directory each. */
export const projectsStreamsPath = (paths: SystemPaths): string => path.join(paths.streams, 'projects')

/** The directory of a project's stream. */
export const projectStreamPath = (paths: SystemPaths, project: string, stream: string): string => path.join(projectsStreamsPath(paths), project, stream)
