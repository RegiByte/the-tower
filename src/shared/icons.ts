import type { Gist } from './cards.ts'

/** An icon on a 16 unit grid, `class="icon"` (sized by design.css's `--icon-s`, `--icon-m`) and hidden from assistive tech. */
const icon = (paint: string, body: string) => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" ${paint}>${body}</svg>`
const stroke = (body: string, width = 1.3) => icon(`fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`, body)
const fill = (body: string) => icon('fill="currentColor"', body)

/**
 * The icons every renderer draws for the same things, as inline SVG in `currentColor`. The tower serves this module
 * as `/icons.js`. An icon-only control carries its name as `aria-label` and its tip as `data-tip`.
 */
export const ICON = {
  editor: stroke('<path d="M8 1.2 14 4.6v6.8L8 14.8 2 11.4V4.6z"/><path d="M2 4.6 8 8l6-3.4M8 8v6.8"/>'),
  finder: stroke('<path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.4 1.6h6a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/><path d="M1.5 6.5h13"/>'),
  github: fill('<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'),
  shell: stroke('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m4.5 6 2 2-2 2M8.5 10.5h3"/>', 1.4),
  settings: stroke('<path d="M6.9 1.5h2.2l.4 1.9 1.3.7 1.8-.7 1.1 1.9-1.4 1.3v1.5l1.4 1.3-1.1 1.9-1.8-.7-1.3.7-.4 1.9H6.9l-.4-1.9-1.3-.7-1.8.7-1.1-1.9 1.4-1.3V6.6L2.3 5.3l1.1-1.9 1.8.7 1.3-.7z"/><circle cx="8" cy="8" r="2"/>'),
  play: fill('<path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.1-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/>'),
  system: stroke('<circle cx="8" cy="8" r="5.8"/><path d="M8 2.2v11.6a5.8 5.8 0 0 0 0-11.6z" fill="currentColor"/>'),
  light: stroke('<circle cx="8" cy="8" r="3"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"/>'),
  dark: stroke('<path d="M13.6 10.2A5.9 5.9 0 0 1 5.8 2.4a5.9 5.9 0 1 0 7.8 7.8z"/>'),
  remote: stroke('<path d="M9 2h5v5M14 2 7 9M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/>', 1.4),
  close: stroke('<path d="m4 4 8 8M12 4l-8 8"/>', 1.6),
  info: stroke('<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4"/><circle cx="8" cy="4.9" r=".5" fill="currentColor"/>'),
  help: stroke('<circle cx="8" cy="8" r="6.2"/><path d="M6.1 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.9.7-.9 1.3v.3"/><circle cx="8" cy="11.6" r=".5" fill="currentColor"/>'),
  sidebar: stroke('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>'),
  draft: stroke('<path d="M10.8 2.2 13.8 5.2 5.5 13.5l-3.6.6.6-3.6z"/><path d="m9.3 3.7 3 3"/>'),
  branch: stroke('<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="4.5" r="1.5"/><path d="M4.5 5v6M11.5 6c0 3.2-7 2.3-7 5"/>'),
  thread: stroke('<path d="M2.5 3.5h11v7.5H7.2L4.2 13.5V11H2.5z"/>'),
  archive: stroke('<rect x="1.5" y="2.5" width="13" height="3.2" rx=".8"/><path d="M2.5 5.7v6.8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V5.7M6.5 8.5h3"/>'),
  collection: stroke('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 8h11M8 2.5v11"/>'),
  tidy: stroke('<path d="M9.4 2.4a1 1 0 0 1 1.4 0l2.8 2.8a1 1 0 0 1 0 1.4L7.2 13H4.6l-2.2-2.2a1 1 0 0 1 0-1.4z"/><path d="m5.6 6.2 4.2 4.2M7.2 13H14"/>'),
  hub: stroke('<path d="M2 7.5 8 2.5l6 5"/><path d="M3.8 6.2v7.3h8.4V6.2M6.6 13.5v-3.6h2.8v3.6"/>'),
  repo: stroke('<path d="M3.5 12.2V3a.5.5 0 0 1 .5-.5h8.5v8.4H4.8a1.3 1.3 0 0 0 0 2.6h7.7"/>'),
  resume: stroke('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M12 1.8v3H9"/>', 1.4),
  plus: stroke('<path d="M8 3v10M3 8h10"/>', 1.6),
  caret: stroke('<path d="m4 6 4 4 4-4"/>', 1.6),
  check: stroke('<path d="m3.5 8.5 3 3 6-7"/>', 2),
  warn: stroke('<path d="M7.1 2.6a1 1 0 0 1 1.8 0l5.4 9.9a1 1 0 0 1-.9 1.5H2.6a1 1 0 0 1-.9-1.5z"/><path d="M8 6.3v3.2"/><circle cx="8" cy="11.6" r=".5" fill="currentColor"/>'),
  compact: stroke('<path d="M3 4h10M3 8h10M3 12h10"/>'),
  answer: stroke('<path d="M3.5 2.5v5a2.5 2.5 0 0 0 2.5 2.5h7"/><path d="m10.5 7.5 2.5 2.5-2.5 2.5"/>', 1.4),
  prompt: stroke('<path d="m5.5 3.5 4.5 4.5-4.5 4.5"/>', 1.8),
  page: stroke('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 5.5h13"/>'),
  doc: stroke('<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5"/>'),
  globe: stroke('<circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c-3.2 3.4-3.2 9 0 12.4M8 1.8c3.2 3.4 3.2 9 0 12.4"/>'),
  tower: stroke('<path d="M4 14.5V2.5h8v12M2.5 14.5h11"/><path d="M6 5h1M9 5h1M6 8h1M9 8h1M6 11h1M9 11h1"/>', 1.4),
}

/** A remote's icon: GitHub's mark for github.com, an outward arrow for any other host. */
export const originIcon = (url: string) => (new URL(url).hostname === 'github.com' ? ICON.github : ICON.remote)

/** A shelf entry's icon by its kind. */
export const SHELF_ICON = { html: ICON.page, md: ICON.doc, url: ICON.globe, link: ICON.remote, renderer: ICON.tower }

/** The icon a gist's kind draws before its words, for `GIST_MARK`'s text marks (cards.ts). */
export const GIST_ICON: Record<Gist['kind'], string> = {
  broken: ICON.close, blocked: ICON.warn, asks: ICON.warn, compacts: ICON.compact, runs: ICON.settings, answer: ICON.answer, prompt: ICON.prompt,
}

/** The marks shared words carry as text (`⎇ tower/odin-07`, cards.ts), each with the icon drawn in its place. */
const MARK_ICON: Record<string, string> = { '⎇': ICON.branch, '◇': ICON.thread, '▤': ICON.archive }

/** Escaped html of shared words with their marks drawn as icons: a mark stands alone between spaces or at an edge. */
export const withIcons = (html: string) => html.replace(/(?<=^|\s)[⎇◇▤](?=\s|$)/g, (mark) => MARK_ICON[mark])
