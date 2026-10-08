/** The viewer asked their system for less motion: lights pulse once, and the camera cuts where it would fly. */
export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
