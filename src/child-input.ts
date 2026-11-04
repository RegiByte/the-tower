import type { Writable } from 'node:stream'

/**
 * Writes `input` to a child's stdin and closes it. A child that exits before reading all of it breaks the pipe; the
 * pipe's error is heard and dropped, because an error event no one hears ends the tower, and nothing is lost by it: the
 * child's exit code and stderr still say why it stopped, through its `close`.
 */
export const endInput = (stdin: Writable, input: string) => void stdin.on('error', () => {}).end(input)
