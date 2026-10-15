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

/** macOS 26 (Darwin 25) masks an app icon into its own shape; an earlier one draws the icon as the file has it. */
const masksIcons = Number(os.release().split('.')[0]) >= 25

/** Apple's continuous-corner rounded rect (the squircle UIBezierPath draws) at x, y, size s and corner radius r. */
const squircle = (x: number, y: number, s: number, r: number): string => {
  const [a, b, c, d, e, f] = [1.52866483, 1.08849323, 0.86840689, 0.63149399, 0.37282392, 0.169059].map((k) => k * r)
  const g = 0.074911 * r
  const [x1, y1] = [x + s, y + s]
  return [
    `M${x + a},${y}H${x1 - a}C${x1 - b},${y} ${x1 - c},${y} ${x1 - d},${y + g}C${x1 - e},${y + f} ${x1 - f},${y + e} ${x1 - g},${y + d}C${x1},${y + c} ${x1},${y + b} ${x1},${y + a}`,
    `V${y1 - a}C${x1},${y1 - b} ${x1},${y1 - c} ${x1 - g},${y1 - d}C${x1 - f},${y1 - e} ${x1 - e},${y1 - f} ${x1 - d},${y1 - g}C${x1 - c},${y1} ${x1 - b},${y1} ${x1 - a},${y1}`,
    `H${x + a}C${x + b},${y1} ${x + c},${y1} ${x + d},${y1 - g}C${x + e},${y1 - f} ${x + f},${y1 - e} ${x + g},${y1 - d}C${x},${y1 - c} ${x},${y1 - b} ${x},${y1 - a}`,
    `V${y + a}C${x},${y + b} ${x},${y + c} ${x + g},${y + d}C${x + f},${y + e} ${x + e},${y + f} ${x + d},${y + g}C${x + c},${y} ${x + b},${y} ${x + a},${y}Z`,
  ].join('')
}

/** The full-bleed icon on Apple's grid for a macOS that doesn't mask it: in the 824 square at 100..924 of the 1024
 *  canvas, clipped to its rounded rect (radius 185.4), over a soft shadow below it, stacked rects in place of a blur
 *  filter, which sips doesn't draw. */
const onIconGrid = (svg: string): string => {
  const shadow = Array.from({ length: 12 }, (_, i) => {
    const k = (i + 1) / 2
    return `<path d="${squircle(100 - k, 104 + k, 824 + 2 * k, 185.4 + k)}" opacity=".03"/>`
  })
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="icon-grid"><path d="${squircle(100, 100, 824, 185.4)}"/></clipPath></defs>
  ${shadow.join('')}
  <g clip-path="url(#icon-grid)">${svg.replace('<svg width="1024" height="1024"', '<svg x="100" y="100" width="824" height="824"')}</g>
</svg>`
}

/** The icon as an .icns: the SVG drawn at 1024, scaled to every size of an icon set by sips. Full bleed it is drawn by
 *  Quick Look; on Apple's grid, where macOS doesn't mask it, by sips, which keeps the corners transparent where Quick
 *  Look fills them white. */
const renderIcon = async (icns: string) => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'tower-icon-'))
  const drawn = path.join(work, `${path.basename(ICON)}.png`)
  if (masksIcons) await run('qlmanage', ['-t', '-s', '1024', '-o', work, ICON])
  else {
    const source = path.join(work, path.basename(ICON))
    writeFileSync(source, onIconGrid(readFileSync(ICON, 'utf8')))
    await run('sips', ['-s', 'format', 'png', source, '--out', drawn])
  }
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
  // How the icon is drawn lives here: a change to this file draws it again too.
  const iconStale = !existsSync(icns) || [ICON, import.meta.filename].some((f) => statSync(f).mtimeMs > statSync(icns).mtimeMs)
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
