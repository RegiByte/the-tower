/** What the playground's page puts on its window, for its own typecheck (`tsc -p renderers/playground`). */
declare global {
  /** The door for agents: the playground's module says each member. */
  var playground: {
    ready(): Promise<boolean>
    scenes(): Promise<{ id: string; title: string; steps: string[] }[]>
    cells(): { scene: string; theme: string; scheme: string }[]
    cell(scene: string, theme?: string, scheme?: string): Document
    act(scene: string, step: string, ...args: unknown[]): Promise<{ theme: string; scheme: string; value: unknown }[]>
  }
}
export {}
