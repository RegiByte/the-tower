/** The library's `/lib/chrome.js`: toasts, tooltips and the confirm dialog. */
export {
  ask,
  asking,
  /** @provisional */ closeOnBackdrop,
} from '../shared/ask.ts'
export {
  placeOnOpen,
  watchTips,
} from '../shared/tips.ts'
export {
  closableNoticer,
  /** @provisional */ noticer,
  toaster,
  toastsCss,
} from '../shared/toasts.ts'
export type {
  Notice,
} from '../shared/toasts.ts'
