/** The library's `/lib/changes.js`: the Changes panel, its reads and its line picking. */
export {
  changedFiles,
  fileKey,
  isFolded,
  livePick,
  marksToggled,
  picked,
  spanned,
  spotSelector,
  watchPickDrag,
} from '../shared/changes-lines.ts'
export {
  keepingFileTop,
  keepingViewedFileTop,
} from '../shared/changes-panel.ts'
export {
  CHANGES_POLL_MS,
  changesFailure,
  changesHandlers,
  changesOf,
  changesPath,
  noChanges,
  readChanges,
  scopeOf,
} from '../shared/changes-reads.ts'
export type {
  LinePick,
} from '../shared/changes-lines.ts'
export type {
  ChangesEvent,
  /** @provisional */ ChangesRead,
  ChangesScope,
} from '../shared/changes-reads.ts'
export type {
  /** @provisional */ DiffFile,
  RepoChanges,
} from '../shared/repo-changes.ts'
export type {
  DiffLayout,
} from '../shared/viewer.ts'
