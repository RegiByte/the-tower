import barGlb from '../assets/bar.glb'
import bookcaseGlb from '../assets/bookcase.glb'
import botGlb from '../assets/bot.glb'
import calicoGlb from '../assets/calico.glb'
import consoleGlb from '../assets/console.glb'
import couchGlb from '../assets/couch.glb'
import deskGlb from '../assets/desk.glb'
import djGlb from '../assets/dj.glb'
import film from '../assets/fixture.webm'
import handsGlb from '../assets/hands.glb'
import kioskGlb from '../assets/kiosk.glb'
import planeGlb from '../assets/plane.glb'
import tabbyGlb from '../assets/tabby.glb'
import tuxedoGlb from '../assets/tuxedo.glb'
import tvGlb from '../assets/tv.glb'
import wearGlb from '../assets/wear.glb'
import adventurersGlb from '../kaykit/Characters/adventurers.glb'
import largeGlb from '../kaykit/Characters/large.glb'
import mediumGlb from '../kaykit/Characters/medium.glb'
import largeClipsGlb from '../kaykit/Characters/rig_large.glb'
import mediumClipsGlb from '../kaykit/Characters/rig_medium.glb'
import kit from '../out/kaykit/kit.kaykit'
import partsGlb from '../parts/parts.glb'
import type { ModelName } from './contract.ts'

/**
 * The binary files the pages load, built beside them into `out/assets/` (esbuild's `file` loader) and fetched by URL,
 * relative to the page: a page framed at an opaque origin reads them too, as the tower serves a renderer's files with
 * CORS. This module imports nothing that builds, so the entry can start every fetch before the page's modules evaluate.
 */

export const MODEL_FILES: Record<ModelName, string> = { bar: barGlb, bookcase: bookcaseGlb, bot: botGlb, calico: calicoGlb, console: consoleGlb, couch: couchGlb, desk: deskGlb, dj: djGlb, hands: handsGlb, kiosk: kioskGlb, plane: planeGlb, tabby: tabbyGlb, tv: tvGlb, tuxedo: tuxedoGlb, wear: wearGlb }

export const CAST_FILES = { adventurers: adventurersGlb, parts: partsGlb, medium: mediumGlb, large: largeGlb, mediumClips: mediumClipsGlb, largeClips: largeClipsGlb }

export const KIT_FILE = kit

export const FILM_FILE = film

const fetched = new Map<string, Promise<ArrayBuffer>>()

/** A file's bytes, fetched once per page: a later ask for the same file gets the same buffer, so nothing may write to it. */
export function bytesOf(url: string): Promise<ArrayBuffer> {
  if (!fetched.has(url)) {
    fetched.set(
      url,
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
        return res.arrayBuffer()
      }),
    )
  }
  return fetched.get(url)!
}

/** Tower 3D's files, fetched while the page reads its settings: the models stage then parses what has arrived. */
export const prefetch = () => [...Object.values(MODEL_FILES), ...Object.values(CAST_FILES), KIT_FILE].forEach(bytesOf)
