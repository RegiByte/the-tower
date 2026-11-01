/**
 * The scene runner shared by the tools that photograph the tower page (`extension-shots.ts`, `stress.ts`): a scene
 * opens a hash of a running tower in headless Chrome, plays its steps and writes a PNG per colour scheme.
 *
 * A scene is `{ name, open?, steps?, crop?, pad?, size?, scale?, schemes? }`. `crop` is a selector, or several, whose
 * union (padded by `pad` CSS pixels, default 8, clamped to the page) is kept; without it the whole page is. `size` is
 * `WxH` (default 1280x800) and `scale` the device pixel ratio (default 2). `$VARs` are expanded in `open` and in every
 * step. Steps, and what each finds, are described in `extension-shots.ts`'s header.
 */
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Page, sleep, withPage } from './drive.ts'

export type Target = { text?: string; ms?: number }
export type Step =
  | ({ click: string } & Target)
  | ({ hover: string } & Target)
  | ({ until: string } & Target)
  | { key: string }
  | { type: string }
  | { eval: string }
  | { wait: number }
export type Scene = { name: string; open?: string; steps?: Step[]; crop?: string | string[]; pad?: number; size?: string; scale?: number; schemes?: string[] }

export async function until<T>(what: string, probe: () => Promise<T | undefined>, ms = 15000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    const found = await probe()
    if (found !== undefined) return found
  }
  throw new Error(`gave up waiting for ${what}`)
}

export const expand = (s: string, vars: Record<string, string>) => s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (m, name) => vars[name] ?? m)

/** The element a step names: the first the selector matches whose text holds `text`, when given. */
const matches = (css: string, text: string | undefined) =>
  `[...document.querySelectorAll(${JSON.stringify(css)})].filter((e) => ${JSON.stringify(text ?? '')} === '' || e.textContent.includes(${JSON.stringify(text ?? '')}))`

const find = (css: string, text: string | undefined) => `${matches(css, text)}[0]`

/** The first match with a box: a hidden duplicate of what a step names has none and is not what it means. */
const findShown = (css: string, text: string | undefined) => `${matches(css, text)}.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })`

const STEP_MS = 30000
const named = (css: string, { text }: Target) => `${css}${text ? ` holding "${text}"` : ''}`

/**
 * Moves the pointer to the middle of the element a step names that has a box, once it has settled: the same node in the same place on
 * two looks 250 ms apart, so a press doesn't land on a node the page is about to draw again.
 */
async function centre(page: Page, css: string, target: Target) {
  const box = `(async () => {
    const look = () => { const e = ${findShown(css, target.text)}; return e && [e, e.getBoundingClientRect()] }
    const first = look()
    if (!first) return null
    await new Promise((r) => setTimeout(r, 250))
    const second = look()
    if (!second || second[0] !== first[0] || ['x', 'y', 'width', 'height'].some((k) => second[1][k] !== first[1][k])) return null
    return [second[1].x + second[1].width / 2, second[1].y + second[1].height / 2]
  })()`
  const at = await until(named(css, target), async () => ((await page.eval(box)) as [number, number] | null) ?? undefined, target.ms ?? STEP_MS)
  await page.mouse(...at)
}

async function run(page: Page, step: Step) {
  if ('click' in step) {
    await centre(page, step.click, step)
    await page.press('left', true)
    await page.press('left', false)
  } else if ('hover' in step) await centre(page, step.hover, step)
  else if ('until' in step) await until(named(step.until, step), async () => ((await page.eval(`!!${find(step.until, step.text)}`)) ? true : undefined), step.ms ?? STEP_MS)
  else if ('key' in step) await page.key(step.key)
  else if ('type' in step) await page.type(step.type)
  else if ('eval' in step) await page.eval(step.eval)
  else await sleep(step.wait)
}

/** The union of the selectors' boxes, padded and kept inside the page. */
async function region(page: Page, crop: string[], pad: number, width: number, height: number) {
  const boxes = (await page.eval(`${JSON.stringify(crop)}.map((css) => { const e = document.querySelector(css); if (!e) return css; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })`)) as ([number, number, number, number] | string)[]
  const missing = boxes.filter((b) => typeof b === 'string')
  if (missing.length) throw new Error(`nothing to crop to: no element matches ${missing.join(', ')}`)
  const sides = boxes as [number, number, number, number][]
  const x = Math.max(0, Math.min(...sides.map((b) => b[0])) - pad)
  const y = Math.max(0, Math.min(...sides.map((b) => b[1])) - pad)
  const right = Math.min(width, Math.max(...sides.map((b) => b[2])) + pad)
  const bottom = Math.min(height, Math.max(...sides.map((b) => b[3])) + pad)
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Takes `scene` of the tower at `tower` in each of its schemes and writes `<out>/<name>-<scheme>.png`; `name` (default
 * the scene's) lets a caller prefix them. A failing step leaves a picture of the page as it failed in the system's temp
 * folder, named by `label`.
 */
export async function takeScene(tower: string, scene: Scene, vars: Record<string, string>, out: string, label: string, name = scene.name) {
  const [width, height] = (scene.size ?? '1280x800').split('x').map(Number)
  mkdirSync(out, { recursive: true })
  for (const scheme of scene.schemes ?? ['light', 'dark']) {
    await withPage(`${tower}/${expand(scene.open ?? '', vars)}`, { width, height, scale: scene.scale ?? 2, scheme }, async (page) => {
      for (const step of scene.steps ?? []) {
        await run(page, JSON.parse(expand(JSON.stringify(step), vars)) as Step).catch(async (err: Error) => {
          const seen = path.join(os.tmpdir(), `${label}-${scene.name}-${scheme}.png`)
          await page.shot(seen)
          throw new Error(`${scene.name} (${scheme}): ${err.message}. The page as it failed: ${seen}`)
        })
      }
      const file = path.join(out, `${name}-${scheme}.png`)
      if (scene.crop) await page.clip(file, await region(page, [scene.crop].flat(), scene.pad ?? 8, width, height))
      else await page.shot(file)
      if (page.errors.length) throw new Error(`${scene.name} (${scheme}): the page reported errors, above`)
      console.log(`${label}: ${path.basename(file)}`)
    })
  }
}
