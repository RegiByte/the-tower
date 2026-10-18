import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SHELL = path.join(path.dirname(fileURLToPath(import.meta.url)), "shell.html");
const CHROMES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** The mermaid module the page imports, so diagrams are parsed by the release that draws them. */
const mermaidUrl = () => fs.readFileSync(SHELL, "utf8").match(/import mermaid from "([^"]+)"/)[1];

const chrome = () => {
  const found = [process.env.CHROME, ...CHROMES].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error(`no Chrome found: set CHROME to a Chrome or Chromium binary (looked in ${CHROMES.join(", ")})`);
  return found;
};

/**
 * Each diagram that mermaid refuses, with its error, parsed in headless Chrome: mermaid parses only in a browser.
 * The page fetches mermaid from its CDN, so this needs the network.
 */
export function brokenDiagrams(sources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-diagrams-"));
  const page = path.join(dir, "check.html");
  const data = JSON.stringify(sources).replace(/</g, "\\u003c");
  fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><pre id="out"></pre>
<script id="sources" type="application/json">${data}</script>
<script type="module">
const out = document.getElementById("out");
try {
  const { default: mermaid } = await import(${JSON.stringify(mermaidUrl())});
  const broken = [];
  for (const { where, source } of JSON.parse(document.getElementById("sources").textContent)) {
    try { await mermaid.parse(source); } catch (err) { broken.push({ where, error: String(err.message ?? err).split("\\n").slice(0, 4).join(" ") }); }
  }
  out.textContent = "KB-DIAGRAMS " + JSON.stringify({ broken });
} catch (err) {
  out.textContent = "KB-DIAGRAMS " + JSON.stringify({ failed: String(err.message ?? err) });
}
</script>`);
  try {
    const run = spawnSync(chrome(), ["--headless=new", "--disable-gpu", "--virtual-time-budget=30000", "--dump-dom", `file://${page}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 120_000 });
    const line = (run.stdout ?? "").match(/KB-DIAGRAMS (\{.*\})<\/pre>/);
    if (!line) throw new Error("the check page reported nothing: mermaid did not load in time");
    const result = JSON.parse(line[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    if (result.failed) throw new Error(`mermaid did not load: ${result.failed}`);
    return result.broken;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
