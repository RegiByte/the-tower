import { ICON, keptTrayTitles, type Mount, mountKeptTray } from '/lib/view.js'

/**
 * `tower/tray`, a collection in a floor's row of trays: its count, unfolding to its newest items, each opened where the
 * renderer displays it. A collection's own extension may draw its tray its way, with a view on that one collection.
 */
export const mount: Mount = (host, ctx) => mountKeptTray(host, ctx, 'tower/tray', { icon: ICON.collection, titles: keptTrayTitles })
