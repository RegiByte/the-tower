/** The library's `/lib/chrome.js`: toasts, tooltips and the confirm dialog. */
export {
  /** @provisional */ ask,
  /** @provisional */ asking,
  /** @provisional */ closeOnBackdrop,
} from '../shared/ask.ts'
export {
  placeOnOpen,
  watchTips,
} from '../shared/tips.ts'
export {
  /** @provisional */ closableNoticer,
  /** @provisional */ noticer,
  toaster,
  toastsCss,
} from '../shared/toasts.ts'
export type {
  /** @provisional */ Notice,
} from '../shared/toasts.ts'
