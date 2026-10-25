import type { Card, Floor } from '../../../../src/bridge/board.ts'
import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = () => ({
  parse: { roles: (text) => ({ name: /^#\s+(.+)$/m.exec(text)?.[1] }) },
  folds: {
    floor: (_floor: Floor, { own }) => ({
      x: { options: own.collections.roles.map((i) => ({ value: i.id, label: (i.parsed as { name?: string }).name ?? i.tag })) },
    }),
    card: (_card: Card, { own }) => {
      const role = own.facts?.findLast((f) => f.name === 'role')?.value as string | undefined
      return role ? { x: { role }, badges: [{ label: role, tone: 'quiet' }] } : {}
    },
  },
  launch: async ({ project, fields, facts }, { collections }) => {
    const role = (fields?.role ?? facts.findLast((f) => f.name === 'role')?.value) as string | undefined
    return role ? { systemPrompt: [await collections.read(project, 'roles', role)] } : {}
  },
})

export default start
