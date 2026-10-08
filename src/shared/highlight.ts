/**
 * Code as html with its syntax marked: highlight.js classes (`hljs-keyword`, `hljs-string`, …) that `highlightCss`
 * colours from the design's `--syn-*` tokens. Bundled into whatever imports it, so nothing is fetched.
 */
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import clojure from 'highlight.js/lib/languages/clojure'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { LanguageFn } from 'highlight.js'
import { esc } from './cards.ts'

/** A grammar for each fence language `langOf` names. */
const GRAMMARS: Record<string, LanguageFn> = {
  ts: typescript, tsx: typescript, js: javascript, jsx: javascript, json, md: markdown, html: xml, css, py: python, sh: bash,
  clojure, go, rust, ruby, java, sql, yaml,
}

/** Fence languages as people write them, by the `GRAMMARS` key each means. */
const FENCES: Record<string, string> = {
  typescript: 'ts', javascript: 'js', mjs: 'js', cjs: 'js', jsonc: 'json', markdown: 'md', xml: 'html', svg: 'html', python: 'py',
  bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', clj: 'clojure', cljs: 'clojure', edn: 'clojure', rs: 'rust', rb: 'ruby', yml: 'yaml',
}

/** The language a markdown fence's info string names, as `highlightLines` takes it; none when no grammar knows it. */
export const fenceLang = (info: string | undefined): string => {
  const name = (info ?? '').trim().split(/\s/)[0].toLowerCase()
  return GRAMMARS[name] ? name : (FENCES[name] ?? '')
}

const highlighter = hljs.newInstance()
for (const [name, grammar] of Object.entries(GRAMMARS)) highlighter.registerLanguage(name, grammar)

const TAG = /<span class="[^"]*">|<\/span>|\n/g

/** highlight.js html cut at its newlines, each line closing the spans still open and the next opening them again. */
function splitLines(html: string): string[] {
  const lines: string[] = []
  const open: string[] = []
  let line = ''
  let at = 0
  for (const m of html.matchAll(TAG)) {
    line += html.slice(at, m.index)
    at = m.index + m[0].length
    if (m[0] === '\n') {
      lines.push(line + '</span>'.repeat(open.length))
      line = open.join('')
    } else if (m[0] === '</span>') {
      open.pop()
      line += m[0]
    } else {
      open.push(m[0])
      line += m[0]
    }
  }
  return [...lines, line + html.slice(at)]
}

/** Lines of code in a fence language, as html with their syntax marked: one pass over them all. Escaped text when no grammar knows the language. */
export function highlightLines(lines: string[], lang: string): string[] {
  if (!GRAMMARS[lang]) return lines.map(esc)
  return splitLines(highlighter.highlight(lines.join('\n'), { language: lang, ignoreIllegals: true }).value)
}

/** The syntax colours of highlighted code under `scope`, a selector. */
export const highlightCss = (scope: string) => `${scope} :is(.hljs-keyword, .hljs-selector-tag, .hljs-name, .hljs-doctag) { color: var(--syn-keyword); }
${scope} :is(.hljs-string, .hljs-code, .hljs-template-tag, .hljs-selector-attr, .hljs-selector-pseudo) { color: var(--syn-string); }
${scope} :is(.hljs-number, .hljs-literal, .hljs-symbol, .hljs-bullet) { color: var(--syn-number); }
${scope} :is(.hljs-comment, .hljs-quote) { color: var(--syn-comment); font-style: italic; }
${scope} :is(.hljs-title, .hljs-section) { color: var(--syn-title); }
${scope} :is(.hljs-type, .hljs-built_in, .hljs-title.class_, .hljs-selector-class, .hljs-selector-id) { color: var(--syn-type); }
${scope} :is(.hljs-attr, .hljs-attribute, .hljs-property, .hljs-variable.language_) { color: var(--syn-attr); }
${scope} :is(.hljs-regexp, .hljs-link, .hljs-meta) { color: var(--syn-regexp); }
${scope} :is(.hljs-section, .hljs-strong) { font-weight: 700; } ${scope} .hljs-emphasis { font-style: italic; }
${scope} .hljs-subst { color: var(--ink); }
`
