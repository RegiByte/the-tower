import assert from 'node:assert/strict'
import { test } from 'node:test'
import { documentHtml, markdownHtml, safeHref } from '../src/shared/markdown.ts'

/** What an answer may carry to the page: the payloads of the brief's audit, and the ways around a scheme check. */
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src="x" onerror="alert(1)">',
  '<img src="https://example.com/track.png?leak=1">',
  '<a href="javascript:parent.document.title=\'PWNED\'">raw anchor</a>',
  '<meta http-equiv="refresh" content="3;url=https://example.com">',
  '<style>body{background:red !important}</style>',
  '<iframe src="https://example.com"></iframe>',
  '<svg onload="alert(1)"></svg>',
  '<details open ontoggle="alert(1)"><summary>x</summary></details>',
  '[click me js](javascript:alert(document.domain))',
  '[js entity](&#106;avascript:alert(1))',
  '[js colon entity](javascript&#58;alert(1))',
  '[js spaced]( javascript:alert(1))',
  '[js angle](<javascript:alert(1)>)',
  '[js case](JaVaScRiPt:alert(1))',
  '[js tab](java\tscript:alert(1))',
  '[data](data:text/html,<script>alert(1)</script>)',
  '[vb](vbscript:msgbox(1))',
  '<javascript:alert(1)>',
  '![remote](https://example.com/track.png?leak=1)',
  '![protocol relative](//example.com/track.png)',
  '![data](data:image/svg+xml,<svg onload=alert(1)>)',
  '![js](javascript:alert(1))',
  '[![nested](https://example.com/x.png)](javascript:alert(1))',
  '[title](https://example.com "a\\" onmouseover=\\"alert(1)")',
  '| a | <img src=x onerror=alert(1)> |\n|---|---|\n| <style>x</style> | [y](javascript:alert(1)) |',
  '- [ ] task <b onclick="alert(1)">bold</b>',
  '```html\n<script>alert(1)</script>\n```',
  '`<img src=x onerror=alert(1)>`',
]

const TAGS = new Set(['p', 'a', 'img', 'em', 'strong', 'del', 'code', 'pre', 'ul', 'ol', 'li', 'input', 'blockquote', 'hr', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'button', 'span'])
const ATTRIBUTES = new Set(['href', 'src', 'alt', 'title', 'class', 'align', 'start', 'type', 'checked', 'disabled', 'target', 'rel', 'data-copy-code', 'aria-label'])

/** An attribute's value as a browser reads it. */
const unescaped = (value: string) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot);/gi, (_, ref: string) =>
    ref[0] === '#' ? String.fromCodePoint(Number(ref[1].toLowerCase() === 'x' ? `0${ref.slice(1)}` : ref.slice(1)))
      : ({ amp: '&', lt: '<', gt: '>', quot: '"' })[ref.toLowerCase()]!)

/** Each tag of `html` with its attributes as a browser reads them: text holds no `<` of its own once escaped. */
const tagsOf = (html: string) =>
  [...html.matchAll(/<\/?([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g)].map(([, name, rest]) => ({
    name: name.toLowerCase(),
    attributes: [...rest.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)].map(([, key, value]) => ({ key: key.toLowerCase(), value: unescaped(value ?? '') })),
  }))

const TOWER = 'http://127.0.0.1:4317/r/page/'

test('markdownHtml: every payload comes out as markdown tags alone, links to the web or the tower, images from the tower', () => {
  for (const payload of PAYLOADS) {
    const html = markdownHtml(payload)
    assert.equal(html.split('<').length - 1, tagsOf(html).length, `${payload}\n→ ${html}\na < that opens no tag the scan reads`)
    for (const { name, attributes } of tagsOf(html)) {
      assert.ok(TAGS.has(name), `${payload}\n→ ${html}\n<${name}> is not a markdown tag`)
      for (const { key, value } of attributes) {
        assert.ok(ATTRIBUTES.has(key), `${payload}\n→ ${html}\n${key} is not a markdown attribute`)
        if (key === 'href') assert.match(new URL(value, TOWER).protocol, /^(https?|mailto):$/, `${payload}\n→ ${html}`)
        if (key === 'target') assert.equal(value, '_blank', `${payload}\n→ ${html}`)
        if (key === 'src') assert.equal(new URL(value, TOWER).origin, new URL(TOWER).origin, `${payload}\n→ ${html}`)
      }
    }
  }
})

test('markdownHtml: raw HTML shows as its text, a refused link as its words, a remote image as a link to it', () => {
  assert.equal(markdownHtml('<style>body{}</style>'), '<p>&lt;style&gt;body{}&lt;/style&gt;</p>\n')
  assert.equal(markdownHtml('say <b>hi</b>'), '<p>say &lt;b&gt;hi&lt;/b&gt;</p>\n')
  assert.equal(markdownHtml('[click](javascript:alert(1))'), '<p>click</p>\n')
  assert.equal(markdownHtml('![chart](https://example.com/c.png)'), '<p><a href="https://example.com/c.png" target="_blank" rel="noopener noreferrer">chart</a></p>\n')
  assert.equal(markdownHtml('![chart](shots/c.png)'), '<p><img src="shots/c.png" alt="chart"></p>\n')
})

test('markdownHtml: markdown itself renders as before', () => {
  assert.equal(markdownHtml('## Plan\n\n**bold** and `code` [docs](https://example.com) [kb](kb/dist/tower.html)'),
    '<h2>Plan</h2>\n<p><strong>bold</strong> and <code>code</code> <a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a> <a href="kb/dist/tower.html" target="_blank" rel="noopener noreferrer">kb</a></p>\n')
  assert.equal(markdownHtml('| f | n |\n|---|--:|\n| a | 1 |'),
    '<table>\n<thead>\n<tr>\n<th>f</th>\n<th align="right">n</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>a</td>\n<td align="right">1</td>\n</tr>\n</tbody></table>\n')
})

test('markdownHtml: a fence is a figure with its syntax marked and a button to copy it', () => {
  assert.equal(markdownHtml('```typescript\nconst a = 1\n```'),
    '<figure class="code"><button type="button" data-copy-code aria-label="copy the code">copy</button><pre><code><span class="hljs-keyword">const</span> a = <span class="hljs-number">1</span></code></pre></figure>\n')
  assert.equal(markdownHtml('```\n<b>\n```'),
    '<figure class="code"><button type="button" data-copy-code aria-label="copy the code">copy</button><pre><code>&lt;b&gt;</code></pre></figure>\n')
})

test('documentHtml: raw HTML stays as written for a frame without scripts, markdown links never leave the web, relative images read beside the file', () => {
  const html = documentHtml('<details><summary>more</summary>kept</details>\n\n[js](javascript:alert(1)) [web](https://example.com) ![a](img/a.png) ![r](https://example.com/r.png)', '/shown/s1/tmp/notes/a.md')
  assert.match(html, /<details><summary>more<\/summary>kept<\/details>/)
  assert.equal(documentHtml('<a href="javascript:alert(1)">raw</a>', '/a.md'), '<p><a href="javascript:alert(1)">raw</a></p>\n', 'the frame contains raw HTML, not documentHtml')
  assert.match(html, /<p>js <a href="https:\/\/example.com">web<\/a> <img src="\/shown\/s1\/tmp\/notes\/img\/a.png" alt="a"> <img src="https:\/\/example.com\/r.png" alt="r"><\/p>/)
})

test('safeHref: http(s), mailto and relative paths only', () => {
  for (const href of ['https://example.com', 'http://127.0.0.1:4317/', 'mailto:a@b.c', 'notes/a.md', '../a.md', '/r/page/', '#top', '?q=1'])
    assert.equal(safeHref(href), true, href)
  for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'blob:http://x/1', 'http://['])
    assert.equal(safeHref(href), false, href)
})
