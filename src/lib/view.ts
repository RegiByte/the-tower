/** The library's `/lib/view.js`: a view's types and chrome, the host that mounts views, panels drawn and kept, controls pressed, files and items, icons, highlighted code. */
export {
  fileButtonsHtml,
  fileCall,
  fileSpansHtml,
} from '../shared/file-acts.ts'
export {
  highlightLines,
} from '../shared/highlight.ts'
export {
  GIST_ICON,
  ICON,
  originIcon,
  SHELF_ICON,
  withIcons,
} from '../shared/icons.ts'
export {
  collectionTrayHtml,
  deleteAsk,
  foldTrayHtml,
  itemFile,
  /** @provisional */ itemKind,
  itemPath,
  itemsCss,
  /** @provisional */ itemTextHtml,
  keptOf,
  keptTitles,
  /** @provisional */ keptTrayTitles,
  mountKeptTray,
  openItemOf,
  pressTrayHtml,
  /** @provisional */ readsText,
} from '../shared/items.ts'
export {
  failedHtml,
  settledHtml,
} from '../shared/panel-html.ts'
export {
  drawPanel,
  keepingFocus,
  /** @provisional */ keepShownTabs,
} from '../shared/panel-kit.ts'
export {
  panelsCss,
} from '../shared/panels-css.ts'
export {
  pressing,
} from '../shared/press.ts'
export {
  closeHtml,
  /** @provisional */ keyedTip,
  paintOnce,
  viewCss,
} from '../shared/view-parts.ts'
export {
  /** @provisional */ viewHost,
} from '../shared/view-host.ts'
export type {
  /** @provisional */ Fill,
  /** @provisional */ Fills,
  /** @provisional */ Hosted,
  /** @provisional */ HostDeps,
  /** @provisional */ Lent,
  /** @provisional */ Placed,
  /** @provisional */ ViewHost,
} from '../shared/view-host.ts'
export type {
  /** @provisional */ Bus,
  CommandKit,
  Kit,
  /** @provisional */ Location,
  Mount,
  /** @provisional */ Mounted,
  /** @provisional */ Pane,
  /** @provisional */ Placing,
  RegionHandle,
  /** @provisional */ RegionOptions,
  Tab,
  /** @provisional */ TabWords,
  /** @provisional */ View,
} from '../shared/views.ts'
