/** Binary assets, built beside the pages by esbuild's `file` loader: each import is the file's URL, relative to the page. */
declare module '*.glb' {
  const url: string
  export default url
}
declare module '*.webm' {
  const url: string
  export default url
}
declare module '*.kaykit' {
  const url: string
  export default url
}
