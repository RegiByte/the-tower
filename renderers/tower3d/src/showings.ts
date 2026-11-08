import type { Card, GalleryShowing } from './api.ts'

/** How many of a floor's last showings its gallery holds. */
const GALLERY_SHOWINGS = 12

/**
 * A floor's gallery from its history (`historyOf`): its last showings, any worker's, on duty or not, newest first. A
 * worker carried on by a resume holds its showings under the card that carries them now, so each is counted once.
 */
export const galleryOf = (history: Card[]): GalleryShowing[] =>
  history
    .filter((card) => !card.continuedBy)
    .flatMap((card) => card.shown.map((shown) => ({ worker: { id: card.id, callsign: card.callsign }, shown })))
    .sort((a, b) => b.shown.at - a.shown.at)
    .slice(0, GALLERY_SHOWINGS)
