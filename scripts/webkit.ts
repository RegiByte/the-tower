/**
 * A WebKit check for renderers: the WKWebView Tower.app runs on, in an invisible window, driven by real AppKit events.
 * Headless `drive` is Chrome, and WebKit differs where frames, focus and events meet (it calls no listener in a
 * document that can't run scripts, which the page's own Chrome checks never saw). Steps run in order once the page
 * has loaded; the page's navigations a link starts, and windows it opens, are printed as they happen:
 *
 *   npm run tool:webkit -- <url> [--size 1280x800] step…
 *     --eval '<js>'   evaluate in the page, awaited; prints the result as JSON (fails the run on a throw)
 *     --click <x,y>   press and release the left button at the page's CSS pixels x,y: a real click, with user activation
 *     --key <chord>   press a key where focus is: a key with any of Meta+, Ctrl+, Alt+, Shift+ before it (Meta+k, Escape)
 *     --wait <ms>     wait in real time
 *     --shot <file>   save a PNG of the page
 *
 *   npm run tool:webkit -- "$TOWER_URL/#<id>" --wait 1500 --eval 'frames[0].scrollY' --click 400,300 --eval 'location.hash'
 *
 * Coordinates for a click inside a frame are the frame's rect plus the element's within it, read with an --eval first.
 * The harness (`webkit.swift`) is compiled once per change to it, into the cache (`~/.tower/cache` is never read).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const source = path.join(import.meta.dirname, 'webkit.swift')
const cache = path.join(os.tmpdir(), 'tower-webkit')
const binary = path.join(cache, createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16))

if (!existsSync(binary)) {
  mkdirSync(cache, { recursive: true })
  execFileSync('xcrun', ['swiftc', '-O', '-swift-version', '5', source, '-o', binary], { stdio: 'inherit' })
}
process.exitCode = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' }).status ?? 1
