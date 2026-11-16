/**
 * The panel routes `npm run tool:frames` takes through Tower 3D's door: open each kind of panel the way a user does,
 * work it, close it. Each `snap` is a stage: `state()` (without the real-time fps and frame ms, and what the last frame
 * drew), `dom` (a hash of each panel shown, its normalized markup in `texts`, which frames keeps beside the recording)
 * and `events`, the events Tower 3D's loops handled since the stage before, as `<loop>:<event>→<effects>`. A route
 * whose thing the board lacks is left out; a step that throws is recorded as `<name>:error` and the walk goes on, and a
 * stage whose panels were still changing after 3 s of real time carries an `error` saying so.
 *
 * Each route ends with one Escape and a `<route>-closed` stage, the way a user leaves it, then starts the next from
 * walking with no panel open, so one changing leaves the others' stages alone; the leaving routes at the end, on
 * `leaving` alone, leave by the next board instead of an Escape. Extend it at the end, so older recordings still line
 * up stage by stage.
 *
 * One stage waits on the real clock: `stats-open` waits up to 10 s for the tower to answer the Stats read, so the
 * answer and the stats it draws are that stage's; a sandbox slower than that moves them to a later stage.
 *
 * Not reached: the landing, the watch panel and the board-lost banner (no fixture board shows them), the settings
 * panel, a desk's Reviews tab with a thread on it, and a draft edited (closing an edited draft saves it).
 */
(async () => {
  const t = window.tower3d
  /**
   * The panels beside the world, by element id: each shown one is a stage's DOM fact. Toasts are left out: they leave
   * on the real clock, so whether one is still up at a stage depends on how long the walk took to get there.
   */
  const PANELS = ['prompt', 'elevator', 'shell-pick', 'rail', 'side', 'hud', 'settings', 'desk', 'doc', 'draft', 'game', 'paused', 'spawn', 'landing', 'watch', 'keys-sheet', 'board-error', 'fade']
  /**
   * The attributes a panel's markup is compared by: what it says and is, not where it is drawn or what it loads.
   * `data-since` is a real time a read landed at, and the "ago" written from it is left out with it.
   */
  const KEPT = /^(id|class|role|type|title|placeholder|disabled|checked|open|popovertarget|data-(?!since$).*|aria-.*)$/

  await t.ready()
  t.capture()
  const out = []
  let seen = t.events().at(-1)?.n ?? 0

  /** `el` and what it holds, one line each: tags with their kept attributes, text, an input's value. Icons, frames' and canvases' insides are left out. */
  const markup = (el, depth = 0, lines = []) => {
    const pad = '  '.repeat(depth)
    if (el.nodeType === Node.TEXT_NODE) {
      const text = el.textContent.replace(/\s+/g, ' ').trim()
      if (text) lines.push(pad + JSON.stringify(text))
      return lines
    }
    if (el.nodeType !== Node.ELEMENT_NODE || !el.checkVisibility()) return lines
    const attrs = [...el.attributes].filter((a) => KEPT.test(a.name)).map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    if ('value' in el && (el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select')) attrs.push(`value=${JSON.stringify(el.value)}`)
    lines.push(`${pad}<${el.localName}${attrs.length ? ' ' + attrs.sort().join(' ') : ''}>`)
    if (el.localName !== 'svg' && el.localName !== 'iframe' && el.localName !== 'canvas' && !el.hasAttribute('data-since')) for (const c of el.childNodes) markup(c, depth + 1, lines)
    return lines
  }
  /** FNV-1a, 32 bits, as hex. */
  const hash = (text) => {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
    return (h >>> 0).toString(16).padStart(8, '0')
  }
  const panels = () => {
    const texts = {}
    for (const id of PANELS) {
      const el = document.getElementById(id)
      if (el?.checkVisibility()) texts[id] = markup(el).join('\n')
    }
    return texts
  }

  const snap = (name) => {
    const s = t.state()
    delete s.fps
    delete s.frameMs
    delete s.drawn
    const texts = panels()
    const records = t.events(seen)
    seen = records.at(-1)?.n ?? seen
    const events = records.map((r) => `${r.loop}:${r.event.type}→${r.effects.map((f) => f.type).join(',')}`)
    out.push({ name, state: s, dom: Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, hash(text)])), texts, events, ...(unsettled && { error: 'the panels kept changing for 3 s' }) })
    unsettled = false
  }
  const tryDo = (name, f) => {
    try {
      f()
      return true
    } catch (e) {
      out.push({ name: `${name}:error`, error: e.message })
      return false
    }
  }
  /** Whether the last `settle` gave up: the next stage says so. */
  let unsettled = false
  /** Waits, in real time and up to 3 s, until the panels are drawn the same over 150 ms: what a read fills in arrives after its reply. */
  const settle = async () => {
    let last = ''
    let still = 0
    for (let waited = 0; still < 3 && waited < 3000; waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const now = JSON.stringify(panels())
      still = now === last ? still + 1 : 0
      last = now
    }
    if (still < 3) unsettled = true
  }
  /**
   * Waits, in real time and up to 10 s, for the app to handle one of `types` since the last stage: a read the tower
   * answers on its own clock then lands in the stage that opened it, not in whichever stage is running when it does.
   * A page that sends no such event waits the 10 s, and an answer slower than that still lands in a later stage.
   */
  const answered = async (types) => {
    for (let waited = 0; waited < 10000; waited += 50) {
      if (t.events(seen).some((r) => r.loop === 'app' && types.includes(r.event.type))) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
  /** Stands within reach of `target` (beside it, on the floor or the deck) and aims at it; throws if no spot reaches it. */
  const reach = (target) => {
    const l = t.locate(target)
    for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5]]) {
      for (const y of [0, 3.3]) {
        t.teleport({ level: l.level, x: l.x + dx, z: l.z + dz, y })
        t.step(1)
        let aimed
        try {
          aimed = t.aimAt(target)
        } catch {}
        if (aimed && same(aimed, target)) return
      }
    }
    throw new Error(`no spot beside ${JSON.stringify(target)} aims at it`)
  }
  /** Runs `verb` on `target` from within reach. */
  const use = (target, verb = 'use') => (reach(target), t.press(verb))
  const click = (selector) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`nothing matches ${selector}`)
    el.click()
  }
  /** Back to walking, no panel open, the pointer captured: where every route starts. */
  const walking = async () => {
    for (let i = 0; i < 4 && (t.state().panel || t.state().view !== 'walk'); i++) (t.key('Escape'), t.step(10))
    const spawn = document.getElementById('spawn')
    if (spawn.open) spawn.close()
    await settle()
    t.step(30)
    t.capture()
  }
  /** Leaves a route as a user does, one Escape, and records what that left; then back to walking. */
  const closed = async (route) => {
    t.key('Escape'); t.step(30); await settle(); snap(`${route}-closed`)
    await walking()
  }

  t.step(1)
  snap('start')

  if (t.state().counts.desks) {
    t.key('KeyN'); t.step(10); snap('desk-going')
    t.step(120); await settle(); snap('desk-open')
    for (const tab of ['brief', 'changes', 'reviews', 'screen']) {
      if (!document.querySelector(`#desk-tabs [data-tab=${tab}]`)) continue
      tryDo(`desk-tab-${tab}`, () => click(`#desk-tabs [data-tab=${tab}]`)); t.step(5); await settle(); snap(`desk-tab-${tab}`)
    }
    if (document.querySelector('#desk-tabs [data-tab^="shown:"]')) {
      tryDo('desk-tab-shown', () => click('#desk-tabs [data-tab^="shown:"]')); t.step(5); await settle(); snap('desk-tab-shown')
    }
    await closed('desk')
  }

  const shell = t.acts('shell')[0]
  if (shell) {
    tryDo('shell', () => use(shell)); t.step(60); await settle(); snap('shell-open')
    await closed('shell')
  }

  const floor = t.acts('floor')[0]
  if (floor) {
    tryDo('shell-pick', () => use(floor, 'shell')); t.step(5); await settle(); snap('shell-pick')
    await closed('shell-pick')
    tryDo('floor', () => use(floor)); t.step(5); await settle(); snap('floor-panel')
    const tray = document.querySelector('#side [data-tray]')?.dataset.tray
    if (tray) {
      tryDo('floor-tray', () => click(`#side [data-tray="${tray}"]`)); t.step(5); await settle(); snap('floor-tray')
      if (document.querySelector('#side [data-kept]')) {
        tryDo('kept', () => click('#side [data-kept]')); t.step(5); await settle(); snap('kept-open')
      }
    }
    await closed(t.state().panel?.kind === 'floor' ? 'floor' : 'kept')
    tryDo('floor-again', () => use(floor)); t.step(5)
    if (document.querySelector('#side [data-archive]')) {
      tryDo('archive', () => click('#side [data-archive]')); t.step(5); await settle(); snap('archive')
    }
    await closed('archive')
  }

  const shelf = t.acts('shelf')[0]
  if (shelf) {
    tryDo('shelf', () => use(shelf)); t.step(5); await settle(); snap('shelf-doc')
    await closed('shelf-doc')
  }

  const shown = t.acts('shown')[0]
  if (shown) {
    tryDo('shown', () => use(shown)); t.step(60); await settle(); snap('showing')
    await closed('showing')
  }

  const picture = t.acts('picture').find((a) => !/\.(mp4|webm)$/.test(a.target))
  if (picture) {
    tryDo('picture', () => use(picture)); t.step(5); await settle(); snap('picture-open')
    await closed('picture')
  }

  const guest = t.acts('guest')[0]
  if (guest) {
    tryDo('logbook', () => use(guest, 'brief')); t.step(5); await settle(); snap('logbook')
    if (document.querySelector('#logbook-tabs [data-tab=screen]')) {
      tryDo('logbook-screen', () => click('#logbook-tabs [data-tab=screen]')); t.step(5); await settle(); snap('logbook-screen')
    }
    await closed('logbook')
  }

  const binder = t.acts('binder')[0]
  if (binder) {
    tryDo('binder', () => use(binder)); t.step(5); await settle(); snap('binder')
    const past = document.querySelector('#desk-brief [data-replay]:not([data-replay=""])')
    if (past) {
      past.click(); t.step(5); await settle(); snap('replaying')
      t.key('Escape'); t.step(5); await settle(); snap('replay-ended')
    }
    await closed('binder')
  }

  const cabinet = t.acts('arcade')[0]
  if (cabinet) {
    tryDo('game', () => use(cabinet)); t.step(60); await settle(); snap('game-open')
    tryDo('game-close', () => click('#game-head [data-act=close]')); t.step(60); snap('game-closed')
    await walking()
  }

  const note = t.acts('note')[0]
  const handTo = note && t.acts('desk').find((d) => t.acts('binder').some((b) => b.id === d.id) && t.locate(d).level === t.locate(note).level)
  if (note && handTo) {
    tryDo('carry', () => use(note)); t.step(40); snap('carrying')
    const hireAt = t.acts('station').find((a) => a.open && a.project === note.project)
    if (hireAt) {
      tryDo('spawn-on-note', () => use(hireAt, 'spawn')); t.step(5); await settle(); snap('spawn-on-note')
      tryDo('spawn-on-note-cancel', () => click('#spawn [data-close=cancel]')); t.step(5); await settle(); snap('spawn-on-note-cancelled')
    }
    tryDo('hand', () => use(handTo, 'hand')); t.step(60); await settle(); snap('handed')
    if (t.state().carrying) {
      const cork = t.acts('cork').find((c) => c.project === note.project)
      tryDo('put-back', () => use(cork)); t.step(150); await settle(); snap('put-back')
    }
    await walking()
  }

  const station = t.acts('station').find((a) => a.open)
  if (station) {
    tryDo('spawn', () => use(station, 'spawn')); t.step(5); await settle(); snap('spawn-open')
    tryDo('spawn-cancel', () => click('#spawn [data-close=cancel]')); t.step(5); await settle(); snap('spawn-cancelled')
    await walking()
  }

  const elevator = t.acts('elevator')[0]
  if (elevator) {
    tryDo('elevator', () => use(elevator)); t.step(5); await settle(); snap('elevator-open')
    const to = [...document.querySelectorAll('#elevator [data-ride]')].find((b) => !b.classList.contains('here'))?.dataset.ride
    if (to !== undefined) {
      tryDo('ride', () => click(`#elevator [data-ride="${to}"]`)); t.step(30); snap('riding')
      t.step(600); await settle(); snap('rode')
    }
    await closed('elevator')
  }

  const stats = t.acts('stats')[0]
  if (stats) {
    tryDo('stats', () => use(stats)); t.step(5); await answered(['stats/landed', 'stats/failed']); await settle(); snap('stats-open')
    await closed('stats')
  }

  const drawer = t.acts('drawer')[0]
  if (drawer) {
    tryDo('drawer', () => use(drawer)); t.step(60); await settle(); snap('drawer')
    if (document.querySelector('#side [data-logbook]')) {
      tryDo('folder', () => click('#side [data-logbook]')); t.step(5); await settle(); snap('folder-logbook')
    }
    await closed('drawer')
  }

  const slot = t.acts('thread')[0]
  if (slot) {
    tryDo('thread', () => use(slot, 'thread')); t.step(5); await settle(); snap('thread')
    await closed('thread')
  }

  const draft = t.acts('note')[0]
  if (draft) {
    tryDo('draft', () => use(draft, 'brief')); t.step(5); await settle(); snap('draft-open')
    await closed('draft')
  }

  /**
   * On `leaving`, each panel whose subject can leave, opened on a board that holds its subject and kept open across the
   * next board, which doesn't: `<route>-left` shows whether it closed. The board after brings every subject back.
   */
  if (new URLSearchParams(location.search).get('board') === 'leaving') {
    const leaves = async (route, open) => {
      tryDo(`${route}-leaving`, open); t.step(60); await settle(); snap(`${route}-before-leaving`)
      t.advance(); t.step(60); await settle(); snap(`${route}-left`)
      t.advance(); t.step(60); await walking()
    }
    await leaves('desk', () => use(t.acts('desk')[0]))
    await leaves('shell', () => use(t.acts('shell')[0]))
    await leaves('doc', () => use(t.acts('shelf')[0]))
    await leaves('thread', () => use(t.acts('thread')[0], 'thread'))
    await leaves('drawer', () => use(t.acts('drawer')[0]))
    await leaves('picture', () => use(t.acts('picture')[0]))
    await leaves('game', () => use(t.acts('arcade')[0]))
  }

  return out
})()
