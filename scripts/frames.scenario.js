/**
 * The walk `npm run tool:frames` takes through Tower 3D's door on every fixture board, evaluated in the page as is.
 * Each `snap` is a stage: `state()` (without the real-time fps and frame ms, and what the last frame drew) and `shot()`. A step that throws is
 * recorded as `<name>:error` and the walk goes on, so a missing thing shows up as a difference rather than a crash.
 *
 * Extend it at the end, so older recordings still line up stage by stage; a recording made before the change has
 * fewer stages, and `compare` reports the extra ones as new.
 */
(async () => {
  const t = window.tower3d
  await t.ready()
  t.capture()
  const out = []
  const snap = (name) => {
    const s = t.state()
    delete s.fps
    delete s.frameMs
    delete s.drawn
    out.push({ name, state: s, png: t.shot() })
  }
  const tryDo = (name, f) => {
    try {
      f()
    } catch (e) {
      out.push({ name: `${name}:error`, error: e.message })
    }
  }
  /** Stand `d` m from the target on the side facing where the walker stands now, then aim at it. */
  const near = (target, d) => {
    const l = t.locate(target)
    const w = t.state().walker
    const len = Math.hypot(w.x - l.x, w.z - l.z) || 1
    t.teleport({ level: l.level, x: l.x + ((w.x - l.x) / len) * d, z: l.z + ((w.z - l.z) / len) * d })
    t.step(1)
    return t.aimAt(target)
  }

  t.step(1); snap('start')
  tryDo('aim-elevator', () => near({ kind: 'elevator' }, 2)); t.step(1); snap('aimed-elevator')
  t.drive({ ahead: 1 }); t.step(45); t.drive(undefined); t.step(1); snap('walked')
  t.teleport({ level: 0, x: 0, z: 6, yaw: 0.4 }); t.step(5); snap('teleported')
  t.key('Digit1'); t.step(30); snap('floor1')
  t.step(90); snap('floor1-settled')
  t.key('KeyN'); t.step(60); snap('next-waiting')
  t.key('KeyN'); t.step(60); snap('next-waiting-again')
  const waiter = t.state().panel?.id
  t.key('Escape'); t.step(60); snap('back')
  t.capture()
  if (waiter) {
    tryDo('aim-tile', () => near({ kind: 'tile', id: waiter }, 3)); t.step(1); snap('aimed-tile')
    tryDo('use-tile', () => t.press('use')); t.step(60); snap('tile-open')
    t.key('Escape'); t.step(60); t.capture(); snap('tile-closed')
    tryDo('aim-desk', () => {
      const l = t.locate({ kind: 'desk', id: waiter })
      t.teleport({ level: l.level, x: l.x, z: l.z + 1.5 })
      t.step(1)
      t.aimAt({ kind: 'desk', id: waiter })
    }); t.step(1); snap('aimed-desk')
    tryDo('brief-desk', () => t.press('brief')); t.step(60); snap('desk-brief')
    t.key('Escape'); t.step(60); t.capture(); snap('desk-closed')
  }
  t.key('KeyH'); t.step(120); snap('overview')
  t.key('KeyH'); t.step(60); snap('left-overview')
  t.key('KeyR'); t.step(60); snap('roof')
  tryDo('aim-dj', () => near({ kind: 'dj' }, 2)); t.step(1); snap('aimed-dj')
  t.key('KeyM'); t.step(10); snap('directory')
  t.key('Escape'); t.step(10)
  const open = t.acts('station').find((a) => a.open)
  if (open) {
    tryDo('aim-station', () => {
      const l = t.locate(open)
      t.teleport({ level: l.level, x: l.x, z: l.z - 3.5, yaw: 0 })
      t.step(1)
      t.aimAt(open)
    }); t.step(1); snap('aimed-station')
  }
  const cork = t.acts('cork')[0]
  if (cork) {
    t.capture()
    const facing = (target, dz, yaw) => {
      const l = t.locate(target)
      t.teleport({ level: l.level, x: l.x, z: l.z + dz, yaw })
      t.step(1)
      t.aimAt(target)
    }
    tryDo('aim-cork', () => facing(cork, 3.2, Math.PI)); t.step(1); snap('aimed-cork')
    const note = t.acts('note').find((a) => a.project === cork.project)
    if (note) {
      tryDo('aim-note', () => t.aimAt(note)); t.step(1); snap('aimed-note')
      tryDo('take-note', () => t.press('use')); t.step(40); snap('carrying')
      const desk = t.acts('station').find((a) => a.open && a.project === cork.project)
      if (desk) (tryDo('aim-open-desk', () => facing(desk, -3.5, 0)), t.step(40), snap('open-desk-carrying'))
      tryDo('put-back', () => (facing(cork, 3.2, Math.PI), t.press('use'))); t.step(150); snap('put-back')
    }
  }
  const picture = t.acts('picture')[0]
  if (picture) {
    t.capture()
    tryDo('aim-picture', () => {
      const l = t.locate(picture)
      t.teleport({ level: l.level, x: l.x - 2, z: l.z + 4.5, yaw: Math.PI })
      t.step(1)
      t.aimAt(picture)
    }); t.step(1); snap('aimed-picture')
    tryDo('look-picture', () => t.press('use')); t.step(5); snap('picture-open')
    t.key('Escape'); t.step(10); t.capture()
    let advanced = false
    try {
      t.advance()
      advanced = true
    } catch {}
    if (advanced) (t.step(60), snap('shown-held'), t.step(360), snap('shown-hung'))
  }
  const leftover = t.acts('leftover')[0]
  if (leftover) {
    t.capture()
    tryDo('aim-leftover', () => near(leftover, 3)); t.step(1); snap('aimed-leftover')
    const desk = t.acts('floor').find((a) => t.locate(a).level === t.locate(leftover).level)
    tryDo('open-floor-panel', () => (near(desk, 2), t.press('use'))); t.step(5); snap('floor-panel')
  }
  const video = t.acts('picture').find((a) => /\.(mp4|webm)$/.test(a.target))
  if (video) {
    t.key('Escape'); t.step(10); t.capture()
    await t.pictured()
    tryDo('aim-video', () => {
      const l = t.locate(video)
      t.teleport({ level: l.level, x: l.x, z: l.z + 3, yaw: Math.PI })
      t.step(1)
      t.aimAt(video)
    }); t.step(1); snap('video-hung')
  }
  t.key('Escape'); t.step(10); t.capture()
  tryDo('roof-party', () => {
    const dj = t.locate({ kind: 'dj' })
    t.teleport({ level: dj.level, x: -19, z: 4 - dj.z, yaw: Math.PI - 0.75, pitch: -0.3 })
  }); t.step(2); snap('roof-party')
  t.step(600); snap('roof-party-later')
  const papers = t.acts('papers')[0]
  if (papers) {
    t.key('Escape'); t.step(10); t.capture()
    tryDo('see-pair', () => {
      const l = t.locate({ kind: 'desk', id: papers.id })
      t.teleport({ level: l.level, x: l.x - 0.4, z: l.z - 3.4, yaw: 0, pitch: -0.18 })
    }); t.step(2); snap('pair')
    tryDo('aim-papers', () => {
      const l = t.locate(papers)
      t.teleport({ level: l.level, x: l.x + 0.5, z: l.z - 1.6, yaw: -0.3, pitch: -0.6 })
      t.step(1)
      t.aimAt(papers)
    }); t.step(1); snap('aimed-papers')
  }
  const slot = t.acts('thread')[0]
  if (slot) {
    tryDo('aim-pigeonhole', () => {
      const l = t.locate(slot)
      t.teleport({ level: l.level, x: l.x + 1.5, z: l.z, yaw: -Math.PI / 2, pitch: -0.3 })
      t.step(1)
      t.aimAt(slot)
    }); t.step(1); snap('aimed-pigeonhole')
  }
  if (papers) {
    t.key('Escape'); t.step(10); t.capture()
    const desk = { kind: 'desk', id: papers.id }
    tryDo('author-changes', () => {
      const l = t.locate(desk)
      t.teleport({ level: l.level, x: l.x, z: l.z + 1.5 })
      t.step(1)
      t.aimAt(desk)
      t.press('use')
      document.querySelector('#desk-tabs [data-tab=changes]').click()
    })
    await new Promise((resolve) => setTimeout(resolve))
    t.step(5); snap('desk-changes')
    tryDo('pick-lines', () => {
      const numbers = () => [...document.querySelectorAll('#desk-changes td.ln[data-pick]')].filter((td) => td.cellIndex === 1)
      numbers()[3].click()
      numbers()[5].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
      if (!document.querySelector('#desk-changes [data-pick-text]')) throw new Error('no note box under the picked lines')
    }); t.step(1); snap('desk-picked')
  }
  const cabinet = t.acts('arcade')[0]
  if (cabinet) {
    t.key('Escape'); t.step(10); t.capture()
    tryDo('aim-cabinet', () => {
      const l = t.locate(cabinet)
      t.teleport({ level: l.level, x: l.x, z: l.z - 2.2, yaw: 0 })
      t.step(1)
      t.aimAt(cabinet)
    }); t.step(1); snap('aimed-cabinet')
    tryDo('play', () => t.press('use')); t.step(60); snap('playing')
    tryDo('stop-playing', () => document.querySelector('#game-head [data-act=close]').click()); t.step(60); snap('stopped-playing')
  }
  const binder = t.acts('binder').at(-1)
  if (binder) {
    t.key('Escape'); t.step(10); t.capture()
    tryDo('aim-binder', () => {
      const l = t.locate(binder)
      t.teleport({ level: l.level, x: l.x, z: l.z - 1.1, yaw: 0, pitch: -0.6 })
      t.step(1)
      t.aimAt(binder)
    }); t.step(1); snap('aimed-binder')
    tryDo('open-logbook', () => t.press('use'))
    await new Promise((resolve) => setTimeout(resolve))
    t.step(5); snap('logbook')
    const past = document.querySelector('#desk-brief [data-replay]:not([data-replay=""])')
    if (past) {
      past.click(); t.step(5); snap('replaying')
      t.key('Escape'); t.step(5); snap('replay-ended')
    }
    t.key('Escape'); t.step(10)
  }
  const drawer = t.acts('drawer')[0]
  if (drawer) {
    t.capture()
    tryDo('aim-drawer', () => {
      const l = t.locate(drawer)
      t.teleport({ level: l.level, x: l.x + 1.6, z: l.z + 0.5, yaw: -Math.PI / 2 - 0.3, pitch: -0.4 })
      t.step(1)
      t.aimAt(drawer)
    }); t.step(1); snap('aimed-drawer')
    tryDo('pull-drawer', () => t.press('use')); t.step(60); snap('drawer-pulled')
    tryDo('open-folder', () => document.querySelector('#side [data-logbook]').click())
    await new Promise((resolve) => setTimeout(resolve))
    t.step(5); snap('folder-logbook')
    t.key('Escape'); t.step(10)
  }
  return out
})()
