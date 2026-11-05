/** The library's `/lib/layout.js`: regions, contributions ranked and fitted, views picked, locations and display. */
export {
  actionId,
  actionWords,
  addedActions,
  badgesOf,
  /** @provisional */ commandUrl,
  /** @provisional */ exemptionsOf,
  /** @provisional */ glyphOf,
  /** @provisional */ headRanked,
  /** @provisional */ isCommand,
  isFresh,
  /** @provisional */ lineId,
  offeredIds,
  rankedActions,
  /** @provisional */ rankedBadges,
  rankedLines,
} from '../shared/adds.ts'
export {
  fill,
} from '../shared/fill.ts'
export {
  /** @provisional */ overflowOf,
} from '../shared/regions.ts'
export {
  /** @provisional */ runCommandWith,
} from '../shared/run-command.ts'
export {
  /** @provisional */ busOf,
  declaredLayout,
  /** @provisional */ displayed,
  /** @provisional */ hashOf,
  layoutKey,
  layoutOf,
  /** @provisional */ locationOf,
  /** @provisional */ offeredIn,
  /** @provisional */ openable,
  /** @provisional */ ordered,
  /** @provisional */ paneShows,
  /** @provisional */ pickView,
  /** @provisional */ shortHashOf,
  /** @provisional */ shownOf,
  usableConfigLayout,
  /** @provisional */ viewOn,
  viewsOf,
} from '../shared/views.ts'
export type {
  /** @provisional */ Glyph,
  /** @provisional */ HeadItem,
  Ranked,
} from '../shared/adds.ts'
export type {
  Hold,
  /** @provisional */ KitMember,
  Layout,
  LayoutEntry,
  /** @provisional */ Overflow,
  /** @provisional */ Region,
  /** @provisional */ Scale,
} from '../shared/regions.ts'
