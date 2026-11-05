/**
 * highlight.js as `src/shared/highlight.ts` uses it. The package's own types name the DOM's library, so reading them
 * would give every generic module the DOM's types, though highlighting runs anywhere.
 */
export type LanguageFn = (hljs: unknown) => unknown
declare const hljs: {
  registerLanguage(name: string, language: LanguageFn): void
  getLanguage(name: string): unknown
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string }
  newInstance(): typeof hljs
} & LanguageFn
export default hljs
