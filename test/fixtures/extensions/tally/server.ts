import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = () => ({
  answers: {
    'pulse/beat.kept': () => ({ heard: 7 }),
    'tower/discard.record': ({ name, tips }: { name: string; tips: unknown[] }) =>
      name.startsWith('keep')
        ? { t: 'error', code: 'refused', message: `${name} is one tally keeps` }
        : { note: `tally counted ${tips.length} ${tips.length === 1 ? 'tip' : 'tips'}` },
  },
})

export default start
