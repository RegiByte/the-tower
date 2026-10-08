/** Binary assets, bundled as bytes by esbuild's `binary` loader. */
declare module '*.glb' {
  const bytes: Uint8Array
  export default bytes
}
declare module '*.webm' {
  const bytes: Uint8Array<ArrayBuffer>
  export default bytes
}
declare module '*.kaykit' {
  const bytes: Uint8Array<ArrayBuffer>
  export default bytes
}
