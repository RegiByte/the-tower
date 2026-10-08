/**
 * The settings every renderer offers in one small popover: pure views from a viewer's settings to html, and one
 * stylesheet (`settingsCss`). Each setting stays where it lives: the ring in `tower.store` under `RING_KEY`, how the
 * brief draws prompts and answers under `BRIEF_MARKDOWN_KEY` (`/brief.js`), the scheme with tower.js (`tower.schemeChoice`, `tower.chooseScheme`), notifications with the browser. A renderer composes the
 * sections it offers with `settingsHtml`, draws it in a `popover` element of class `settings-pop` (`placeOnOpen` of
 * tips.ts stands it by its button) and wires, by the attribute on the element clicked:
 *
 *   data-alerts-ask              ask the browser to allow notifications
 *   data-ring-choice="<ring>"    how often a wait rings (`RINGS`), kept under `RING_KEY`
 *   data-sound-play="<sound>"    play a sound of `SOUNDS` the way the renderer rings
 *   data-scheme-choice="<c>"     the colour scheme: '' follows the system, or light, or dark (`tower.chooseScheme`)
 *   data-brief-markdown="<m>"    prompts and answers rendered or raw (`BRIEF_MARKDOWNS`), kept under `BRIEF_MARKDOWN_KEY`
 *
 * Every control carries its `data-tip`. The tower serves this module as `/settings.js`.
 */
import type { SchemeChoice } from './shelf-page.ts'
import { BRIEF_MARKDOWNS, BRIEF_MARKDOWN_LABEL, BRIEF_MARKDOWN_MEANS, type BriefMarkdown } from './brief.ts'
import { REMIND_MS, RINGS, esc, type Ring, type Sound } from './cards.ts'
import { ICON } from './icons.ts'

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
  `<section><h3>${title}<small>${aside}</small></h3>${body}</section>`

/** One choice of a segmented control: `attr` its data attribute, its value `value`. */
const choice = (attr: string, value: string, label: string, tip: string, on: boolean) =>
  `<button class="${on ? 'on' : ''}" ${attr}="${esc(value)}" aria-pressed="${on}" data-tip="${esc(tip)}">${label}</button>`

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

/** The colour scheme: the system's, light or dark. */
export const themeSection = (scheme: SchemeChoice) =>
  section('Theme', 'colours of every panel',
    `<div class="seg" role="group" aria-label="theme">${SCHEME_CHOICES.map((c) =>
      choice('data-scheme-choice', c, `${SCHEME_ICON[c]}${SCHEME_LABEL[c]}`, SCHEME_MEANS[c], c === scheme)).join('')}</div>`)

/** How the brief draws prompts and answers: markdown rendered, or as written. */
export const markdownSection = (markdown: BriefMarkdown) =>
  section('Brief', 'prompts and answers',
    `<div class="seg" role="group" aria-label="brief">${BRIEF_MARKDOWNS.map((m) =>
      choice('data-brief-markdown', m, BRIEF_MARKDOWN_LABEL[m], BRIEF_MARKDOWN_MEANS[m], m === markdown)).join('')}</div>`)

/** The popover's content: the sections a renderer offers, in order. */
export const settingsHtml = (sections: string[]) => `<div class="settings"><h2>Settings</h2>${sections.join('')}</div>`

/** The popover's look, under `.settings-pop` (the popover element) and `.settings` (its content). */
export const settingsCss = `
.settings-pop { position: fixed; inset: auto; margin: 0; padding: 0; white-space: normal; text-align: left; width: min(300px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow: auto;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--ink); box-shadow: var(--shadow-pop); }
.settings { font: 13px/1.45 var(--ui); }
.settings h2 { margin: 0; padding: 13px 14px 9px; font: 800 13px/1 var(--display); letter-spacing: .08em; text-transform: uppercase; }
.settings section { display: grid; gap: 8px; padding: 10px 14px 13px; border-top: 1px solid var(--line); }
.settings h3 { display: flex; align-items: baseline; gap: 8px; margin: 0; font: 800 11px/1 var(--display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.settings h3 small { font: 400 11px/1 var(--ui); letter-spacing: 0; text-transform: none; color: var(--faint); }
.settings .now { margin: 0; color: var(--muted); font-size: 12px; }
.settings .now b { color: var(--ink); } .settings .now.denied b { color: var(--broken-text); }
.settings .row { display: flex; flex-wrap: wrap; gap: 6px; }
.settings .row button { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; font-size: 12px; }
.settings .seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--radius); background: var(--sunk); }
.settings .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 6px; border: 0; border-radius: 4px;
  background: none; color: var(--muted); font: 700 12px/1.3 var(--ui); cursor: pointer; }
.settings .seg button:hover { color: var(--ink); }
.settings .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px #0003; }
.settings svg { width: 12px; height: 12px; flex: none; }
`
