/** The part of OpenTUI's Solid renderer the TUI plugin calls. opencode's TUI provides the module at runtime. */
declare module '@opentui/solid' {
  type Node = object
  export function createElement(tag: string): Node
  export function setProp<T>(node: Node, name: string, value: T, previous?: T): T
  export function insert(parent: Node, value: Node | string): Node
  export function effect<T>(fn: (previous?: T) => T, init?: T): void
}
