/** The library's `/lib/chrome.js`: toasts, tooltips, the confirm dialog and popovers closed by a press in a frame. */
export {
  ask,
  asking,
  /** @provisional */ closeOnBackdrop,
} from '../shared/ask.ts'
export {
  closePopoversOnFramePress,
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
