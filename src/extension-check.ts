/**
 * The author's loop, before any tower runs an extension: `tower extensions check <dir>` reads a folder's manifest as the
 * tower would, resolves it against the running tower's registry, and starts it in a throwaway process to say whether
 * `start` returns what the manifest declares (`mismatch`); `tower extensions freeze <dir>` writes its `contract.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { contractOf, goneFrom, parseContract, readOne, replacementProblem, type LoadProblem } from './bridge/extensions.ts'
import { CliError } from './cli-error.ts'
import { BUNDLED_DIR, CONTRACT_FILE, foundIn, MANIFEST_FILE } from './extensions.ts'
import { runProcess } from './run.ts'
import { API_VERSION } from './shared/api.ts'
import { BUNDLED, capabilityOf, Manifest, meets, type ExtensionView } from './shared/extensions.ts'
import type { Config } from './shared/model.ts'

/** What the throwaway start says: `{mismatch?}`, why its server module can't be imported, or why start threw. */
export type StartVerdict = { mismatch?: string } | { unloadable: string } | { threw: string }

const REPO = path.join(import.meta.dirname, '..')
const START_SCRIPT = path.join(import.meta.dirname, 'extension-start.ts')

/** The throwaway start's own 10 s, and room for node and tsx to load. */
const START_PROCESS_MS = 30_000

const problem = (level: LoadProblem['level'], code: LoadProblem['code'], message: string, at?: string): LoadProblem => ({ lane: 'load', level, code, message, ...(at && { path: at }) })

/** What the running tower's registry says of a manifest: another provider of its capability, what it requires missing, down or out of range. */
export const runningProblems = (manifest: Manifest, id: string, views: ExtensionView[]): LoadProblem[] => {
  const cap = capabilityOf(manifest)
  const providerOf = (needed: string) => views.find((v) => v.provides === needed && v.state !== 'off' && v.id !== id)
  const other = providerOf(cap)
  return [
    ...(other ? [problem('error', 'conflict', `${other.id} provides ${cap} in the running tower: set extensions.${other.id}.off to replace it`)] : []),
    ...Object.entries(manifest.requires).flatMap(([needed, version]): LoadProblem[] => {
      if (needed === 'tower') return []
      const provider = providerOf(needed)
      if (!provider) return [problem('error', 'unmet', `requires ${needed}, which no extension of the running tower provides`, `requires.${needed}`)]
      if (!meets(provider.version, version)) return [problem('error', 'unmet', `requires ${needed} ${version}; ${provider.id} provides ${provider.version}`, `requires.${needed}`)]
      return provider.state === 'started' ? [] : [problem('error', 'skipped', `requires ${needed}, which is ${provider.state} in the running tower`, `requires.${needed}`)]
    }),
    ...Object.entries(manifest.wants ?? {}).flatMap(([wanted, version]) => {
      const provider = providerOf(wanted)
      return provider?.state === 'started' && meets(provider.version, version) ? [] : [problem('info', 'unmet', `wants ${wanted} ${version}, which the running tower doesn't run: it would run without it`, `wants.${wanted}`)]
    }),
  ]
}

/** `start` run in a throwaway process, its verdict as problems. */
const startProblems = async (dir: string, settings: unknown): Promise<LoadProblem[]> => {
  const ran = await runProcess([process.execPath, '--import', 'tsx', START_SCRIPT, dir, JSON.stringify(settings ?? null)], { cwd: REPO, timeoutMs: START_PROCESS_MS })
  const line = ran.stdout.trim().split('\n').at(-1)
  if (ran.exit !== 0 || !line) return [problem('error', 'failed', `its start couldn't be checked: ${ran.timedOut ? 'timed out' : `exit ${ran.exit}`}: ${ran.stderr.trim().split('\n').at(-1) ?? ''}`)]
  const verdict: StartVerdict = JSON.parse(line)
  if ('unloadable' in verdict) return [problem('error', 'unloadable', `its server can't be imported, so the tower can't start it: ${verdict.unloadable}`)]
  if ('threw' in verdict) return [problem('warn', 'threw', `start threw with a ctx that reaches nothing, so its names are unchecked: ${verdict.threw}`)]
  return verdict.mismatch ? [problem('error', 'mismatch', verdict.mismatch)] : []
}

/**
 * Every problem the tower would find in the folder: its manifest and settings (the config's, when it names the
 * extension), its contract and, replacing a bundled capability, the bundled one's; against the running tower's
 * registry when `views` are given; then its start. A manifest that doesn't load isn't started; one that does is answered with them.
 */
export const checkFolder = async (dir: string, config: Config, views: ExtensionView[] | undefined): Promise<{ id: string; problems: LoadProblem[]; manifest?: Manifest }> => {
  const raw = JSON.parse(readFileSync(path.join(dir, MANIFEST_FILE), 'utf8')) as { id?: unknown }
  const id = typeof raw.id === 'string' ? raw.id : path.basename(dir)
  const bundled = (BUNDLED as readonly string[]).includes(id) && path.resolve(dir) === path.join(BUNDLED_DIR, id)
  const found = foundIn(id, bundled, dir)
  const read = readOne(found, { ...config.extensions?.[id], path: dir }, API_VERSION)
  if (!read.manifest || read.problems.some((p) => p.level === 'error')) return { id, problems: read.problems }
  const cap = capabilityOf(read.manifest)
  const replaced = (BUNDLED as readonly string[]).includes(cap) ? replacementProblem(read.manifest, found, foundIn(cap, true, path.join(BUNDLED_DIR, cap))) : undefined
  const problems = [...read.problems, ...(replaced ? [replaced] : []), ...(views ? runningProblems(read.manifest, id, views) : [])]
  return { id, problems: [...problems, ...(await startProblems(dir, read.settings))], manifest: read.manifest }
}

/**
 * Writes the folder's `contract.json`: its capability's names at its major, its client modules' exports among them.
 * Refused while its manifest or a client module doesn't parse, or while the contract there holds names gone from it
 * at the same major.
 */
export const freezeFolder = (dir: string): { file: string; names: number; major: number; provides: string } => {
  const parsed = Manifest.safeParse(JSON.parse(readFileSync(path.join(dir, MANIFEST_FILE), 'utf8')))
  if (!parsed.success) throw new CliError(`${MANIFEST_FILE} doesn't parse: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'tower extensions check <dir> says each problem')
  const manifest = parsed.data
  const file = path.join(dir, CONTRACT_FILE)
  const { contract: held, client } = foundIn(manifest.id, false, dir)
  const unreadable = Object.keys(client?.unreadable ?? {})
  if (unreadable.length) throw new CliError(`${unreadable.join(', ')} doesn't parse, so its exports can't be frozen`, 'tower extensions check <dir> says why')
  const before = held === undefined ? undefined : parseContract(held)
  const gone = before && typeof before !== 'string' ? goneFrom(before, manifest, client) : []
  const contract = contractOf(manifest, client)
  if (gone.length) throw new CliError(`${gone.join(', ')} would leave the contract at major ${contract.major}`, 'put them back, or move the major of version and say what to use instead in its CHANGELOG.md')
  writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`)
  return { file, names: contract.names.length, major: contract.major, provides: contract.provides }
}
