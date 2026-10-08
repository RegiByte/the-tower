/**
 * Input a viewer's terminal sends without anyone typing: SGR mouse reports (every move, with any-motion
 * tracking on), focus in/out, and answers to Claude's terminal queries (primary and secondary device
 * attributes, kitty keyboard flags, cursor position, and DCS replies such as XTVERSION).
 */
const UNTYPED = /^\x1b(\[<\d+;\d+;\d+[Mm]|\[[IO]|\[[?>][\d;]*[cu]|\[\d+;\d+R|P)/

/** Keys and pastes: something a person did at the keyboard. */
export const isTyped = (input: string): boolean => !UNTYPED.test(input)
