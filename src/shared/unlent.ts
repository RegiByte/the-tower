/** A kit member a renderer doesn't lend: calling it fails, naming it. */
export const unlent = (member: string) => () => {
  throw new Error(`this renderer lends no ${member}: what uses kit.${member} runs where a renderer's kit holds it`)
}
