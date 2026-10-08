/**
 * The settings every renderer offers in one small popover: pure views from a viewer's settings to html, and one
 * stylesheet (`settingsCss`). Each setting stays where it lives: the ring in `tower.store` under `RING_KEY`, how the
 * brief draws prompts and answers under `BRIEF_MARKDOWN_KEY` (`/brief.js`), the viewer's appearance with tower.js (`tower.prefs`), notifications with the browser. A renderer composes the
 * sections it offers with `settingsHtml`, draws it in a `popover` element of class `settings-pop` (`placeOnOpen` of
 * tips.ts stands it by its button) and wires, by the attribute on the element clicked:
 *
 *   data-alerts-ask              ask the browser to allow notifications
 *   data-ring-choice="<ring>"    how often a wait rings (`RINGS`), kept under `RING_KEY`
 *   data-sound-play="<sound>"    play a sound of `SOUNDS` the way the renderer rings
 *   data-brief-markdown="<m>"    prompts and answers rendered or raw (`BRIEF_MARKDOWNS`), kept under `BRIEF_MARKDOWN_KEY`
 *
 * The appearance is data: `PREF_SECTIONS` describes each setting of `tower.prefs`, `prefSections` draws them, and
 * `wirePrefs(popover, tower.prefs.set)` wires every one, so a setting added here reaches every renderer with no wiring
 * of its own. A renderer draws the popover again when `tower.prefs.on` says the record changed.
 *
 * Every control carries its `data-tip`. The tower serves this module as `/settings.js`.
 */
import type { SchemeChoice } from './shelf-page.ts'
import { BRIEF_MARKDOWNS, BRIEF_MARKDOWN_LABEL, BRIEF_MARKDOWN_MEANS, type BriefMarkdown } from './brief.ts'
import { REMIND_MS, RINGS, esc, type Ring, type Sound } from './cards.ts'
import { ICON } from './icons.ts'
import { GENERIC_FACES, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES, faceFamily, type Prefs } from './prefs.ts'
import { type } from './design.ts'

/** Notifications as the browser allows them: `default` until it has asked the viewer. */
export type Alerts = 'default' | 'granted' | 'denied'

export const ALERTS_NAME: Record<Alerts, string> = { default: 'Off', granted: 'On', denied: 'Blocked' }
export const ALERTS_MEANS: Record<Alerts, string> = {
  default: 'this browser has not been asked to show the tower’s notifications',
  granted: 'a notification whenever a worker starts waiting on you or shows you something',
  denied: 'this browser blocks the tower’s notifications: allow them in its settings for this site, then reload',
}

export const RING_LABEL: Record<Ring, string> = { once: 'Once', remind: 'Remind', off: 'Off' }
export const RING_MEANS: Record<Ring, string> = {
  once: 'a sound as a worker starts waiting on you',
  remind: `a sound as a worker starts waiting on you, and again every ${REMIND_MS / 1000} s while a wait goes unwatched`,
  off: 'no sound',
}

export const SOUND_LABEL: Record<Sound, string> = { question: 'Question', done: 'Answer' }
export const SOUND_MEANS: Record<Sound, string> = {
  question: 'play the sound of a wait to answer: a screen, a tool to allow or a failure',
  done: 'play the sound of an answer to read',
}

export const SCHEME_CHOICES: SchemeChoice[] = ['', 'light', 'dark']
export const SCHEME_LABEL: Record<SchemeChoice, string> = { '': 'System', light: 'Light', dark: 'Dark' }
export const SCHEME_MEANS: Record<SchemeChoice, string> = {
  '': 'colours follow this computer’s appearance',
  light: 'paper and ink, whatever the system shows',
  dark: 'a deep green-grey, whatever the system shows',
}
const SCHEME_ICON: Record<SchemeChoice, string> = { '': ICON.system, light: ICON.light, dark: ICON.dark }

const section = (title: string, aside: string, body: string) =>
  `<section><h3 class="eyebrow">${title}<small>${aside}</small></h3>${body}</section>`

/** One choice of a segmented control: `attr` its data attribute, its value `value`. */
const choice = (attr: string, value: string | number, label: string, tip: string, on: boolean) =>
  `<button class="${on ? 'on' : ''}" ${attr}="${esc(String(value))}" aria-pressed="${on}" data-tip="${esc(tip)}">${label}</button>`

/** Browser notifications: the state in words, and the button that asks while the browser hasn't. */
export const alertsSection = (alerts: Alerts) =>
  section('Alerts', 'browser notifications',
    `<p class="now ${alerts}"><b>${ALERTS_NAME[alerts]}</b> · ${esc(ALERTS_MEANS[alerts])}</p>` +
    (alerts === 'default' ? '<div class="row"><button data-alerts-ask data-tip="ask this browser to let the tower notify you">Turn on</button></div>' : ''))

/** How often a wait rings, and each sound to hear. */
export const soundSection = (ring: Ring) =>
  section('Sound', 'when a worker waits on you',
    `<div class="seg" role="group" aria-label="ring">${RINGS.map((r) => choice('data-ring-choice', r, RING_LABEL[r], RING_MEANS[r], r === ring)).join('')}</div>` +
    `<div class="row plays">${(['question', 'done'] as Sound[]).map((s) =>
      `<button data-sound-play="${s}" data-tip="${esc(SOUND_MEANS[s])}">${ICON.play}${SOUND_LABEL[s]}</button>`).join('')}</div>`)

/** @deprecated `prefSections` draws the scheme beside the rest of the viewer's appearance, wired by `wirePrefs`. */
export const themeSection = (scheme: SchemeChoice) =>
  section('Theme', 'colours of every panel',
    `<div class="seg" role="group" aria-label="theme">${SCHEME_CHOICES.map((c) =>
      choice('data-scheme-choice', c, `${SCHEME_ICON[c]}${SCHEME_LABEL[c]}`, SCHEME_MEANS[c], c === scheme)).join('')}</div>`)

/** How the brief draws prompts and answers: markdown rendered, or as written. */
export const markdownSection = (markdown: BriefMarkdown) =>
  section('Brief', 'prompts and answers',
    `<div class="seg" role="group" aria-label="brief">${BRIEF_MARKDOWNS.map((m) =>
      choice('data-brief-markdown', m, BRIEF_MARKDOWN_LABEL[m], BRIEF_MARKDOWN_MEANS[m], m === markdown)).join('')}</div>`)

/** One choice of a segmented setting: its value, the word on it, what it means, an icon before the word. */
export type PrefChoice = { value: string | number; label: string; means: string; icon?: string }

/** A setting of `tower.prefs`, drawn by its kind: a segmented choice, a face by name, a size in px. */
export type PrefSetting =
  | { kind: 'choice'; key: 'scheme' | 'motion' | 'contrast' | 'scale'; label?: string; choices: PrefChoice[] }
  | { kind: 'face'; key: 'ui' | 'display' | 'mono'; label: string; means: string; shipped: string; suggestions: string[] }
  | { kind: 'size'; key: 'termSize'; label: string; means: string; min: number; max: number }

export type PrefSection = { title: string; aside: string; settings: PrefSetting[] }

/** The first face of a stack of design.ts's `type`, by name: what shows when the viewer picks none. */
const shippedFace = (stack: string) => stack.split(',')[0].replace(/'/g, '')

export const PREF_SECTIONS: PrefSection[] = [
  {
    title: 'Theme', aside: 'colours of every panel',
    settings: [{ kind: 'choice', key: 'scheme', choices: SCHEME_CHOICES.map((c) => ({ value: c, label: SCHEME_LABEL[c], means: SCHEME_MEANS[c], icon: SCHEME_ICON[c] })) }],
  },
  {
    title: 'Type', aside: 'any face on this computer, by name',
    settings: [
      { kind: 'face', key: 'ui', label: 'Text', means: 'the face of every panel, list and document', shipped: shippedFace(type.ui),
        suggestions: ['system-ui', 'Inter', 'SF Pro Text', 'Helvetica Neue', 'Avenir Next', 'IBM Plex Sans', 'Verdana'] },
      { kind: 'face', key: 'display', label: 'Headings', means: 'the face of headings, signs and callsigns', shipped: shippedFace(type.display),
        suggestions: ['system-ui', 'Inter', 'Avenir Next', 'Futura', 'Helvetica Neue', 'IBM Plex Sans'] },
      { kind: 'face', key: 'mono', label: 'Code', means: 'the face of terminals and code', shipped: shippedFace(type.mono),
        suggestions: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'Fira Code', 'IBM Plex Mono', 'Cascadia Code', 'Source Code Pro'] },
      { kind: 'size', key: 'termSize', label: 'Terminal', ...TERM_SIZES,
        means: 'the terminal’s font while you drive a session, in px: a bigger font gives the session fewer columns and rows. A terminal you watch shrinks to fit, up to this size' },
    ],
  },
  {
    title: 'Accessibility', aside: 'over this computer’s settings',
    settings: [
      { kind: 'choice', key: 'motion', label: 'Motion', choices: [
        { value: '', label: 'System', means: 'animations follow this computer’s reduce motion setting' },
        { value: 'reduce', label: 'Reduce', means: 'every animation runs once and moves no further: blinking lamps settle, the camera cuts' },
        { value: 'full', label: 'Full', means: 'every animation, whatever this computer’s setting' },
      ] },
      { kind: 'choice', key: 'contrast', label: 'Contrast', choices: [
        { value: '', label: 'System', means: 'contrast follows this computer’s increase contrast setting' },
        { value: 'more', label: 'More', means: 'muted text closer to ink, and stronger lines' },
      ] },
      { kind: 'choice', key: 'scale', label: 'Text size', choices: PREF_CHOICES.scale.map((value) => ({ value, label: `${value}%`,
        means: `every panel’s text at ${value}% of this browser’s text size; terminals keep the Terminal size` })) },
    ],
  },
]

/**
 * Whether a face is installed (or loaded by the page): text set in it measures otherwise than in each generic face
 * alone. A browser lists no installed faces, so this is how a name is checked.
 */
export function faceInstalled(name: string): boolean {
  if (GENERIC_FACES.includes(name)) return true
  const g = document.createElement('canvas').getContext('2d')!
  const width = (font: string) => ((g.font = font), g.measureText('mmmmmmmmmmlli1WQ@#').width)
  return ['monospace', 'serif', 'sans-serif'].some((base) => width(`72px ${faceFamily(name)}, ${base}`) !== width(`72px ${base}`))
}

const settingHtml = (setting: PrefSetting, prefs: Prefs, installed: (name: string) => boolean) => {
  const label = setting.label ? `<span class="lbl">${setting.label}</span>` : ''
  if (setting.kind === 'choice') {
    return `<div class="pref">${label}<div class="seg" role="group" aria-label="${esc(setting.label ?? setting.key)}">${setting.choices.map((c) =>
      choice(`data-pref="${setting.key}" data-pref-value`, c.value, `${c.icon ?? ''}${c.label}`, c.means, prefs[setting.key] === c.value)).join('')}</div></div>`
  }
  if (setting.kind === 'size') {
    return `<label class="pref">${label}<span class="size"><input type="number" data-pref="${setting.key}" min="${setting.min}" max="${setting.max}" step="1"
      value="${prefs[setting.key]}" data-tip="${esc(setting.means)}"> px</span></label>`
  }
  const picked = prefs[setting.key]
  const faces = setting.suggestions.filter(installed).map((f) => `<option value="${esc(f)}"></option>`).join('')
  const missing = picked && !installed(picked) ? `<small class="missing">not on this computer: ${esc(setting.shipped)} shows</small>` : ''
  return `<label class="pref">${label}<input data-pref="${setting.key}" value="${esc(picked)}" placeholder="${esc(setting.shipped)}" list="pref-${setting.key}-faces"
    spellcheck="false" autocomplete="off" data-tip="${esc(`${setting.means}: a face’s name, or empty for ${setting.shipped}`)}"></label><datalist id="pref-${setting.key}-faces">${faces}</datalist>${missing}`
}

/** The viewer's appearance, a section each of `PREF_SECTIONS`; `installed` says whether a face is on this computer (`faceInstalled`). */
export const prefSections = (prefs: Prefs, installed: (name: string) => boolean) =>
  PREF_SECTIONS.map((s) => section(s.title, s.aside, s.settings.map((setting) => settingHtml(setting, prefs, installed)).join('')))

/** What `wirePrefs` hands `set` for a control: a choice's value, a face's name trimmed, a size kept within its range. */
const prefValue = (el: HTMLElement): Partial<Prefs> => {
  const key = el.dataset.pref as keyof Prefs
  const value = el.dataset.prefValue
  if (value !== undefined) return { [key]: typeof PREFS_DEFAULT[key] === 'number' ? Number(value) : value }
  const input = el as HTMLInputElement
  if (input.type === 'number') return { [key]: Math.min(TERM_SIZES.max, Math.max(TERM_SIZES.min, Math.round(input.valueAsNumber || PREFS_DEFAULT.termSize))) }
  return { [key]: input.value.trim() }
}

/**
 * Every setting `prefSections` draws in `el`: a choice on click, a field on change (Enter, or leaving it). A field
 * left by pressing on another control in `el` changes as that press ends, with the control's own choice: setting it at
 * once would redraw the popover under the pointer, and the press would land on nothing.
 */
export function wirePrefs(el: HTMLElement, set: (patch: Partial<Prefs>) => void) {
  let pressing = false
  let held: Partial<Prefs> = {}
  const release = () => {
    const patch = held
    held = {}
    if (Object.keys(patch).length) set(patch)
  }
  el.addEventListener('pointerdown', () => (pressing = true))
  el.ownerDocument.addEventListener('pointerup', () => pressing && ((pressing = false), setTimeout(release)))
  el.addEventListener('click', (e) => {
    const control = (e.target as Element).closest<HTMLElement>('[data-pref][data-pref-value]')
    if (control) (held = { ...held, ...prefValue(control) }), release()
  })
  el.addEventListener('change', (e) => {
    const control = (e.target as Element).closest<HTMLElement>('input[data-pref]')
    if (!control) return
    held = { ...held, ...prefValue(control) }
    if (!pressing) release()
  })
}

/** The popover's content: the sections a renderer offers, in order. */
export const settingsHtml = (sections: string[]) => `<div class="settings"><h2>Settings</h2>${sections.join('')}</div>`

/** The popover's look, under `.settings-pop` (the popover element) and `.settings` (its content). */
export const settingsCss = `
.settings-pop { position: fixed; inset: auto; margin: 0; padding: 0; white-space: normal; text-align: left; width: min(18.75rem, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow: auto;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--ink); box-shadow: var(--shadow-pop); }
.settings { font: var(--fs-m)/1.45 var(--ui); }
.settings h2 { margin: 0; padding: var(--sp-l) var(--sp-xl) var(--sp-m); font: 800 var(--fs-m)/1 var(--display); letter-spacing: .08em; text-transform: uppercase; }
.settings section { display: grid; gap: var(--sp-m); padding: var(--sp-l) var(--sp-xl); border-top: 1px solid var(--line); }
.settings h3 { display: flex; align-items: baseline; gap: var(--sp-m); margin: 0; }
.settings h3 small { font: 400 var(--fs-xs)/1 var(--ui); letter-spacing: 0; text-transform: none; color: var(--faint); }
.settings .now { margin: 0; color: var(--muted); font-size: var(--fs-s); }
.settings .now b { color: var(--ink); } .settings .now.denied b { color: var(--broken-text); }
.settings .row { display: flex; flex-wrap: wrap; gap: var(--sp-s); }
.settings .row button { display: inline-flex; align-items: center; gap: var(--sp-xs); padding: var(--sp-xs) var(--sp-l); font-size: var(--fs-s); }
.settings .seg { display: flex; gap: var(--sp-2xs); padding: var(--sp-2xs); border-radius: var(--radius); background: var(--sunk); }
.settings .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-xs); padding: var(--sp-xs) var(--sp-s); border: 0; border-radius: var(--radius);
  background: none; color: var(--muted); font: 700 var(--fs-s)/1.3 var(--ui); cursor: pointer; }
.settings .seg button:hover { color: var(--ink); }
.settings .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px #0003; }
.settings svg { width: 12px; height: 12px; flex: none; }
.settings .pref { display: grid; grid-template-columns: 4.75rem minmax(0, 1fr); align-items: center; gap: var(--sp-m); }
.settings .pref:not(:has(.lbl)) { grid-template-columns: minmax(0, 1fr); }
.settings .pref .lbl { color: var(--muted); font-size: var(--fs-s); }
.settings .pref input { width: 100%; min-width: 0; font: var(--fs-m)/1.3 var(--ui); color: var(--ink); background: var(--panel-2); border: 1px solid var(--line-strong);
  border-radius: var(--radius); padding: var(--sp-xs) var(--sp-m); }
.settings .pref input:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
.settings .pref input::placeholder { color: var(--faint); font-style: italic; }
.settings .pref input[data-pref=display] { font-family: var(--display); } .settings .pref input[data-pref=mono] { font-family: var(--mono); }
.settings .pref .size { display: flex; align-items: center; gap: var(--sp-s); color: var(--muted); font-size: var(--fs-s); }
.settings .pref .size input { width: 4rem; font-variant-numeric: tabular-nums; }
.settings .missing { margin: calc(-1 * var(--sp-xs)) 0 0 calc(4.75rem + var(--sp-m)); color: var(--needs-text); font-size: var(--fs-xs); }
`
