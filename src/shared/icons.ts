/**
 * The icons every renderer draws for the same things, as inline SVG in `currentColor`. The tower serves this module
 * as `/icons.js`.
 */
export const ICON = {
  editor: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.2 14 4.6v6.8L8 14.8 2 11.4V4.6z"/><path d="M2 4.6 8 8l6-3.4M8 8v6.8"/></svg>',
  finder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.4 1.6h6a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/><path d="M1.5 6.5h13"/></svg>',
  github: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  shell: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m4.5 6 2 2-2 2M8.5 10.5h3"/></svg>',
  remote: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h5v5M14 2 7 9M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/></svg>',
}

/** A remote's icon: GitHub's mark for github.com, an outward arrow for any other host. */
export const originIcon = (url: string) => (new URL(url).hostname === 'github.com' ? ICON.github : ICON.remote)

/** A shelf entry's glyph by its kind. */
export const SHELF_ICON = { html: '▣', md: '▤', url: '◳', link: '↗', renderer: '◰' }
