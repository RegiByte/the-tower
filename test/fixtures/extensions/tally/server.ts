import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = () => ({
  answers: {
    'pulse/beat.kept': () => ({ heard: 7 }),
  },
})

export default start
