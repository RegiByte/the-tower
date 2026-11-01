/**
 * The platforms the tower runs on and the little each does its own way (decision `platforms`): macOS, and Linux
 * under WSL 2. The rest of the tower is the same on both: `ps`, `lsof`, PTYs, sockets and file watches.
 */
import { execFile, spawn } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

export type Platform = {
  name: string
  /** The `ps` flag that prints a process's environment after its command: BSD's `-E`, procps's `e`. */
  psEnvironment: string
  /** What installs a command-line tool the tower needs, for the doctor's fix. */
  installs: (tool: string) => string
  /** What brings git up to the version the tower needs, for the doctor's fix. */
  newerGit: string
  /** Opens a URL in the user's browser. */
  openUrl: (url: string) => Promise<void>
  /** Shows `target` selected in the desktop's file manager. */
  reveal: (target: string) => Promise<void>
}

const run = promisify(execFile)

/**
 * Starts a Windows program from WSL and waits only for it to start: explorer.exe exits 1 even when it did what it
 * was asked, so its status says nothing. A program that can't start (interop off, no explorer.exe) still fails.
 */
const startWindows = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'ignore', detached: true })
    child.once('error', reject)
    child.once('spawn', () => (child.unref(), resolve()))
  })

const MACOS: Platform = {
  name: 'macOS',
  psEnvironment: '-E',
  installs: () => 'xcode-select --install',
  newerGit: 'brew install git, or update the Command Line Tools: xcode-select --install',
  openUrl: async (url) => void (await run('open', [url])),
  reveal: async (target) => void (await run('open', ['-R', target])),
}

const WSL: Platform = {
  name: 'WSL',
  psEnvironment: 'e',
  installs: (tool) => `sudo apt install ${tool}`,
  newerGit: 'sudo add-apt-repository ppa:git-core/ppa && sudo apt install git',
  openUrl: (url) => startWindows('explorer.exe', [url]),
  reveal: async (target) => startWindows('explorer.exe', [`/select,${(await run('wslpath', ['-w', target])).stdout.trim()}`]),
}

/** WSL's kernels name themselves `…-microsoft-standard-WSL2`. */
const isWsl = (): boolean => process.platform === 'linux' && /microsoft/i.test(os.release())

/** The platform the tower runs on here, `undefined` on one it doesn't run on, which the doctor fails. */
export const detected = (): Platform | undefined => (process.platform === 'darwin' ? MACOS : isWsl() ? WSL : undefined)

/** The platform the tower runs on here; on any other, only the doctor runs. */
export const platform = (): Platform => {
  const here = detected()
  if (here === undefined) throw new Error(`${process.platform} (${os.release()}): the tower runs on macOS and WSL 2 only, as tower doctor says`)
  return here
}
