import { esc } from '/lib/words.js'
import { SCENES } from './scenes.js'

/**
 * The playground: every `tower-*` element and shared behavior the tower serves, each a scene drawn from fixture data in
 * a frame per theme and scheme, for the people and agents developing the tower. No scene reads the board.
 *
 * Two ways to run it, said in its URL:
 * - on a tower, at `/r/playground/` (a sandbox adds it to its config): one frame per theme the extensions offer the
 *   page (`board.offeredThemes.page`, read once), the page's own look first, each in light and dark;
 * - `?alone`, served by `tool:lib-ui` with no tower behind it: the default look only, which the page says.
 *
 * The query narrows the grid: `?scene=menu,dialog`, `?theme=aqua` (`default` for the page's own look),
 * `?scheme=dark`; `?bare` draws the one frame they leave over the whole window, at its top left, so a driver's
 * coordinates are the scene's.
 *
 * A door for agents, `window.playground`:
 *   playground.ready()                    resolves once every frame has loaded and wired its scene
 *   playground.scenes()                   each scene drawn: its id, title and the steps it offers
 *   playground.cells()                    each frame drawn: its scene, theme and scheme
 *   playground.cell(scene, theme, scheme) the frame's document (theme `default` and scheme `light` when left out)
 *   playground.act(scene, step, ...args)  runs a scene's step in each of its frames drawn, awaited: what each returned,
 *                                         with its theme and scheme; a step that throws fails the call, naming its frame.
 *                                         Only one frame holds focus at a time: a step reading focus is read true in the
 *                                         last frame it ran in, so read focus with the query narrowed to one frame
 *
 * A scene that can't be drawn (its module missing or failing, a query matching no frame, or a `?bare` matching more
 * than one) fails `ready()` and every member that waits on it, and says why on the page.
 *
 * @import { Scene, Steps } from './scenes.js'
 */

/** @typedef {{ id: string | null, title: string }} Theme */
/** @typedef {{ scene: Scene, theme: Theme, scheme: 'light' | 'dark', frame: HTMLIFrameElement, steps: Promise<Steps> }} Cell */

const query = new URLSearchParams(location.search)
const alone = query.has('alone')
const bare = query.has('bare')
const listed = (/** @type {string} */ name) => query.get(name)?.split(',').filter(Boolean)

/** The page's own look, the one theme a playground with no tower behind it draws. */
const DEFAULT = /** @type {Theme} */ ({ id: null, title: 'Default' })

/** `/tower.js`, loaded only on a tower: alone, nothing answers it. @returns {Promise<void>} */
const towerLoaded = () =>
  new Promise((loaded, failed) => {
    const script = Object.assign(document.createElement('script'), { src: '/tower.js' })
    script.onload = () => loaded()
    script.onerror = () => failed(new Error('No tower answered /tower.js: open the playground at /r/playground/ on a tower, or add ?alone to draw the default look with none'))
    document.head.append(script)
  })

/** The themes the extensions offer the page, the page's own look first, read once from the board. @returns {Promise<Theme[]>} */
const offeredThemes = async () => {
  await towerLoaded()
  return new Promise((read) => {
    const off = tower.subscribe((board) => {
      read([DEFAULT, ...(board.offeredThemes.page ?? []).map((t) => ({ id: t.id, title: t.title }))])
      queueMicrotask(() => off())
    })
  })
}

/** A scene's module, `scenes/<id>.js`, as a frame imports it. */
const sceneUrl = (/** @type {Scene} */ scene) => new URL(`scenes/${scene.id}.js`, location.href).href

/** Throws for a scene its frame couldn't import as the playground does: its file is named by its id and exports it as `scene`. */
const checkFiles = (/** @type {Scene[]} */ scenes) =>
  Promise.all(
    scenes.map(async (s) => {
      const module = await import(sceneUrl(s)).catch(() => undefined)
      if (module?.scene !== s) throw new Error(`The scene ${s.id} is not what scenes/${s.id}.js exports as \`scene\`: a scene's module is named by its id`)
    }),
  )

/** The theme's stylesheet, the page's themes picking it: none alone, where no tower serves them. */
const themeLink = (/** @type {Theme} */ theme) => (alone ? '' : `<link rel="stylesheet" href="/renderers/page/themes.css?theme=${encodeURIComponent(theme.id ?? '')}">`)

/** A frame's document: the design, the theme, the scene's markup, then its module wiring it, `steps` set at once so a failed import rejects it. */
const cellDoc = (/** @type {Scene} */ scene, /** @type {Theme} */ theme, /** @type {string} */ scheme) => `<!doctype html>
<html lang="en" data-scheme="${scheme}"><meta charset="utf-8">
<link rel="stylesheet" href="/design.css">${themeLink(theme)}
<style>@layer tower.page { body { margin: 0; padding: var(--sp-l); background: var(--bg); color: var(--ink); font: var(--fs-s)/1.4 var(--ui); } ${scene.css ?? ''} }</style>
<body>${scene.html()}
<script type="module">
window.steps = import(${JSON.stringify(sceneUrl(scene))}).then(({ scene }) => scene.wire(document, window))
</script>`

const themeKey = (/** @type {Theme} */ t) => t.id ?? 'default'
const label = (/** @type {Cell} */ c) => `${c.scene.id} in ${c.theme.title}, ${c.scheme}`
const root = /** @type {HTMLElement} */ (document.getElementById('grid'))

/** @type {Cell[]} */
const cells = []
/** @type {Scene[]} */
let scenes = []

/** The page's head and a section per scene, a frame per theme and scheme in it. */
const pageHtml = (/** @type {Theme[]} */ themes, /** @type {Theme[]} */ drawnThemes, /** @type {readonly string[]} */ schemes) => {
  const href = (/** @type {Record<string, string | null>} */ change) => {
    const next = new URLSearchParams(location.search)
    for (const [k, v] of Object.entries(change)) v === null ? next.delete(k) : next.set(k, v)
    return `?${next}`
  }
  const filter = (/** @type {string} */ name, /** @type {[string, string][]} */ options) =>
    [['', 'all'], ...options]
      .map(([value, label]) => `<a href="${esc(href({ [name]: value || null }))}"${(query.get(name) ?? '') === value ? ' aria-current="true"' : ''}>${esc(label)}</a>`)
      .join('')
  const mode = alone
    ? 'Alone, with no tower behind it: the default look only. On a tower (a sandbox adds it at /r/playground/), every theme the page is offered.'
    : `On this tower: ${themes.length} looks, each in light and dark.`
  return `<header><h1>Playground</h1><span class="mode">${esc(mode)}</span>
  <nav class="filters" aria-label="Scenes">${filter('scene', SCENES.map((s) => [s.id, s.title]))}</nav>
  <nav class="filters" aria-label="Themes">${filter('theme', themes.map((t) => [themeKey(t), t.title]))}</nav>
  <nav class="filters" aria-label="Schemes">${filter('scheme', [['light', 'Light'], ['dark', 'Dark']])}</nav></header>
  ${scenes
    .map((s) => `<section class="scene" data-scene="${s.id}"><h2>${esc(s.title)}</h2><p>${esc(s.about)}</p><div class="cells">${drawnThemes
      .flatMap((t) => schemes.map((scheme) => `<figure><figcaption>${esc(t.title)} · ${scheme}</figcaption><iframe data-theme="${themeKey(t)}" data-scheme="${scheme}" title="${esc(`${s.title}, ${t.title}, ${scheme}`)}" width="${s.size[0]}" height="${s.size[1]}"></iframe></figure>`))
      .join('')}</div></section>`)
    .join('')}`
}

/** What a frame's scene answers once it has loaded and wired it: its steps, or why it couldn't. @returns {Promise<Steps>} */
const wiredSteps = (/** @type {HTMLIFrameElement} */ frame, /** @type {string} */ what) =>
  new Promise((wired, failed) =>
    frame.addEventListener('load', () => {
      const steps = /** @type {Window & { steps?: Promise<Steps> }} */ (frame.contentWindow).steps
      if (!steps) return failed(new Error(`${what}: the frame's script never ran`))
      steps.then(wired, (/** @type {Error} */ err) => failed(new Error(`${what}: ${err.message}`)))
    }, { once: true }),
  )

/** Draws the grid the query asks for: every frame on the page, loading. */
async function draw() {
  const themes = alone ? [DEFAULT] : await offeredThemes()
  const wanted = { scenes: listed('scene'), themes: listed('theme'), schemes: listed('scheme') }
  scenes = SCENES.filter((s) => !wanted.scenes || wanted.scenes.includes(s.id))
  const drawnThemes = themes.filter((t) => !wanted.themes || wanted.themes.includes(themeKey(t)))
  const schemes = /** @type {const} */ (['light', 'dark']).filter((s) => !wanted.schemes || wanted.schemes.includes(s))
  const count = scenes.length * drawnThemes.length * schemes.length
  if (count === 0) throw new Error('The query matches no frame: the filters on the page list the scenes, themes and schemes drawn here')
  if (bare && count !== 1) throw new Error(`?bare draws one frame, and the query matches ${count}: narrow it to one scene, theme and scheme`)
  await checkFiles(scenes)

  if (bare) document.body.classList.add('bare')
  root.innerHTML = bare ? '<iframe></iframe>' : pageHtml(themes, drawnThemes, schemes)
  for (const scene of scenes)
    for (const theme of drawnThemes)
      for (const scheme of schemes) {
        const frame = /** @type {HTMLIFrameElement} */ (
          bare ? root.querySelector('iframe') : root.querySelector(`[data-scene="${scene.id}"] iframe[data-theme="${themeKey(theme)}"][data-scheme="${scheme}"]`)
        )
        const cell = { scene, theme, scheme, frame, steps: /** @type {Promise<Steps>} */ (Promise.resolve({})) }
        cell.steps = wiredSteps(frame, label(cell))
        cell.steps.catch(() => {})
        frame.srcdoc = cellDoc(scene, theme, scheme)
        cells.push(cell)
      }
}

/** Every frame on the page; it fails with why when the grid can't be drawn. */
const drawn = draw().catch((/** @type {Error} */ err) => {
  root.innerHTML = `<p class="failed">The playground can't draw: ${esc(err.message)}</p>`
  throw err
})

window.playground = {
  ready: async () => (await drawn, await Promise.all(cells.map((c) => c.steps)), true),
  scenes: async () => (await drawn, Promise.all(scenes.map(async (s) => ({ id: s.id, title: s.title, steps: Object.keys((await cells.find((c) => c.scene === s)?.steps) ?? {}) })))),
  cells: () => cells.map((c) => ({ scene: c.scene.id, theme: themeKey(c.theme), scheme: c.scheme })),
  cell: (scene, theme = 'default', scheme = 'light') => {
    const found = cells.find((c) => c.scene.id === scene && themeKey(c.theme) === theme && c.scheme === scheme)
    if (!found) throw new Error(`No frame draws ${scene} in ${theme}, ${scheme}: playground.cells() lists those drawn`)
    return /** @type {Document} */ (found.frame.contentDocument)
  },
  act: async (scene, step, ...args) => {
    await drawn
    const of = cells.filter((c) => c.scene.id === scene)
    if (!of.length) throw new Error(`No frame draws the scene ${scene}: playground.cells() lists those drawn`)
    const results = []
    for (const c of of) {
      const steps = await c.steps
      if (!steps[step]) throw new Error(`The scene ${scene} has no step ${step}: it offers ${Object.keys(steps).join(', ')}`)
      try {
        results.push({ theme: themeKey(c.theme), scheme: c.scheme, value: await steps[step](...args) })
      } catch (err) {
        throw new Error(`${label(c)}: ${/** @type {Error} */ (err).message}`)
      }
    }
    return results
  },
}
