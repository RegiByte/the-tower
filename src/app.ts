/**
 * `tower app`: the tower as a Mac app, opt-in beside the browser (decision `macos-app`). Builds `apps/macos` into
 * `apps/macos/out/` with the Swift compiler when its sources changed since the last build, renders its icon from
 * `apps/macos/icon.svg` with Quick Look when that changed, writes the config it serves into its Info.plist, signs it
 * for this machine alone, and opens it. The app is a window over the tower's routes, started apart from it (`tower
 * up`), and holds no capability or process of its own (`apps/macos/Sources`).
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { CliError } from './cli-error.ts'
import { REPO } from './machine.ts'
import { fnv1a } from './shared/hash.ts'
import { DEFAULT_CONFIG, type SystemPaths } from './shared/paths.ts'

const run = promisify(execFile)

const SOURCES = path.join(REPO, 'apps', 'macos', 'Sources')
const ICON = path.join(REPO, 'apps', 'macos', 'icon.svg')
const OUT = path.join(REPO, 'apps', 'macos', 'out')

/** One app per system: the default config's is Tower, another's is named after its system root. */
const appName = (config: string): string => (config === DEFAULT_CONFIG ? 'Tower' : `Tower (${path.basename(path.dirname(config))})`)

const escapeXml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')

const infoPlist = (name: string, config: string): string => {
  const keys: Record<string, string> = {
    CFBundleExecutable: 'Tower',
    CFBundleIconFile: 'AppIcon',
    CFBundleIdentifier: `local.tower.app.${fnv1a(`${REPO}\n${config}`).toString(16)}`,
    CFBundleName: 'Tower',
    CFBundleDisplayName: name,
    CFBundlePackageType: 'APPL',
    LSMinimumSystemVersion: '14.0',
    NSHighResolutionCapable: 'true',
    TowerConfig: config,
  }
  const entries = Object.entries(keys).map(([key, value]) => `  <key>${key}</key>\n  ${value === 'true' ? '<true/>' : `<string>${escapeXml(value)}</string>`}`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${entries.join('\n')}\n</dict>\n</plist>\n`
}

/** The Swift compiler with the macOS SDK, through xcrun, which finds both. */
const swiftc = async (args: string[]) => {
  await run('xcrun', ['--find', 'swiftc']).catch(() => {
    throw new CliError('No Swift compiler: tower app builds the Mac app with it', 'xcode-select --install')
  })
  await run('xcrun', ['swiftc', ...args]).catch((err) => {
    throw new CliError(`The Mac app didn't build:\n${err.stderr || err.message}`)
  })
}

/** Each size an icon set holds, by its file name. */
const ICON_SIZES = [16, 32, 128, 256, 512].flatMap((px) => [[`icon_${px}x${px}.png`, px], [`icon_${px}x${px}@2x.png`, px * 2]] as const)

/** The icon as an .icns: the SVG drawn at 1024 by Quick Look, scaled to every size of an icon set by sips. */
const renderIcon = async (icns: string) => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'tower-icon-'))
  await run('qlmanage', ['-t', '-s', '1024', '-o', work, ICON])
  const drawn = path.join(work, `${path.basename(ICON)}.png`)
  const set = path.join(work, 'AppIcon.iconset')
  mkdirSync(set)
  for (const [name, px] of ICON_SIZES) await run('sips', ['-z', String(px), String(px), drawn, '--out', path.join(set, name)])
  await run('iconutil', ['-c', 'icns', set, '-o', icns])
  rmSync(work, { recursive: true })
}

/** Builds this system's app when its sources, its icon or its Info.plist changed, then opens it; says what it did. */
export const openApp = async (paths: SystemPaths): Promise<string> => {
  if (process.platform !== 'darwin') throw new CliError('tower app is a Mac app: the tower page runs in any browser')
  const name = appName(paths.config)
  const app = path.join(OUT, `${name}.app`)
  const binary = path.join(app, 'Contents', 'MacOS', 'Tower')
  const plistFile = path.join(app, 'Contents', 'Info.plist')
  const sources = readdirSync(SOURCES).filter((f) => f.endsWith('.swift')).map((f) => path.join(SOURCES, f))
  const built = existsSync(binary) ? statSync(binary).mtimeMs : 0
  const stale = sources.some((f) => statSync(f).mtimeMs > built)
  const icns = path.join(app, 'Contents', 'Resources', 'AppIcon.icns')
  const iconStale = !existsSync(icns) || statSync(ICON).mtimeMs > statSync(icns).mtimeMs
  const plist = infoPlist(name, paths.config)
  const plistChanged = !existsSync(plistFile) || readFileSync(plistFile, 'utf8') !== plist
  if (stale) {
    mkdirSync(path.dirname(binary), { recursive: true })
    console.log(`Building ${app}…`)
    await swiftc(['-O', '-swift-version', '5', '-o', binary, ...sources])
  }
  if (iconStale) {
    mkdirSync(path.dirname(icns), { recursive: true })
    await renderIcon(icns)
  }
  if (plistChanged) writeFileSync(plistFile, plist)
  const changed = stale || iconStale || plistChanged
  if (changed) {
    await run('codesign', ['--force', '--sign', '-', app])
    // The Dock and Finder keep an app's icon until its bundle's date moves.
    utimesSync(app, new Date(), new Date())
  }
  // pgrep reads a pattern: an app named after its system root has parentheses in its path.
  const running = (await run('pgrep', ['-f', binary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')]).catch(() => ({ stdout: '' }))).stdout.trim() !== ''
  await run('open', [app])
  if (changed && running) return `${name} was already open, on its earlier build: quit it (⌘Q) and run tower app again for this one`
  return `${name}: ${app}`
}
