import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WIKI_RE, REF_LINK_RE, heldInStore, mapProse, queryEntities, sortEntities, systemOf, systemUses,
} from "./model.mjs";

const SHELL = path.join(path.dirname(fileURLToPath(import.meta.url)), "shell.html");

const SHAPES = {
  box: (l) => `["${l}"]`, round: (l) => `("${l}")`, stadium: (l) => `(["${l}"])`, cylinder: (l) => `[("${l}")]`,
  parallelogram: (l) => `[/"${l}"/]`, subroutine: (l) => `[["${l}"]]`, hexagon: (l) => `{{"${l}"}}`,
};
const mermaidText = (s) => s.replace(/"/g, "#quot;").replace(/[<>]/g, (c) => (c === "<" ? "#lt;" : "#gt;"));
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function rollup(kb, id, focus) {
  const focusChain = new Set([focus, ...kb.graph.ancestors.get(focus)]);
  if (focusChain.has(id)) return id;
  const chain = [id, ...kb.graph.ancestors.get(id)];
  return chain.find((x) => focusChain.has(kb.entities.get(x).in)) ?? id;
}

function mapEdges(kb, focus, memberOf) {
  const edges = new Map();
  for (const e of kb.entities.values()) {
    for (const l of e.links) {
      const [ma, mb] = [memberOf(e.id), memberOf(l.to)];
      if (!ma && !mb) continue;
      if (ma && ma === mb) continue;
      const from = ma ?? rollup(kb, e.id, focus);
      const to = mb ?? rollup(kb, l.to, focus);
      if (from === to) continue;
      const key = `${from}\u0000${to}`;
      if (!edges.has(key)) edges.set(key, { from, to, verbs: new Set() });
      edges.get(key).verbs.add(l.verb);
    }
  }
  return [...edges.values()];
}

function flowchart(kb, nodes, edges, isMember) {
  const key = new Map(nodes.map((id, i) => [id, `n${i}`]));
  const lines = ["flowchart LR"];
  for (const id of nodes) {
    const e = kb.entities.get(id);
    lines.push(`  ${key.get(id)}${SHAPES[kb.typeById.get(e.type).shape](mermaidText(e.name))}:::${isMember(id) ? "member" : "neighbor"}`);
    lines.push(`  click ${key.get(id)} href "#/e/${id}"`);
  }
  for (const e of edges) {
    const label = e.verbs.size ? `|"${mermaidText([...e.verbs].join(", "))}"|` : "";
    lines.push(`  ${key.get(e.from)} -->${label} ${key.get(e.to)}`);
  }
  lines.push("  classDef neighbor stroke-dasharray: 4 3");
  return lines.join("\n");
}

function flowDiagram(kb, flow) {
  const involved = new Set(flow.fields.involves);
  const memberOf = (id) => [id, ...kb.graph.ancestors.get(id)].find((x) => involved.has(x)) ?? null;
  const edges = mapEdges(kb, flow.id, memberOf).filter((e) => involved.has(e.from) && involved.has(e.to));
  return flowchart(kb, [...involved], edges, () => true);
}

const flowsUnder = (kb, id) => kb.graph.children.get(id).map((c) => kb.entities.get(c)).filter((e) => e.type === "flow");


export function diagramFor(kb, focus) {
  const entity = kb.entities.get(focus);
  if (entity.type === "flow") return flowDiagram(kb, entity);
  if (flowsUnder(kb, focus).length) return null;
  const ancestors = kb.graph.ancestors;
  const childOf = (id) => [id, ...ancestors.get(id)].find((x) => kb.entities.get(x).in === focus) ?? null;
  let edges = mapEdges(kb, focus, childOf);
  let members = new Set(edges.flatMap((e) => [e.from, e.to]).filter((id) => kb.entities.get(id).in === focus));
  if (members.size === 0) {
    edges = mapEdges(kb, focus, (id) => (id === focus || ancestors.get(id).includes(focus) ? focus : null));
    members = new Set([focus]);
  }
  if (edges.length === 0) return null;
  return flowchart(kb, [...new Set(edges.flatMap((e) => [e.from, e.to]))], edges, (id) => members.has(id));
}

function lineage(kb, system) {
  const data = new Set();
  for (const e of kb.entities.values()) {
    if (systemOf(kb, e.id) !== system) continue;
    for (const l of e.links) if (heldInStore(kb, l.to)) data.add(l.to);
  }
  const edges = new Map();
  const add = (from, to) => edges.set(`${from}\u0000${to}`, { from, to, verbs: new Set() });
  for (const e of kb.entities.values()) {
    for (const l of e.links) {
      if (!data.has(l.to) && !(data.has(e.id) && heldInStore(kb, l.to))) continue;
      if (l.verb === "reads") add(l.to, e.id);
      else add(e.id, l.to);
    }
  }
  const list = [...edges.values()];
  const nodes = [...new Set(list.flatMap((e) => [e.from, e.to]))];
  return flowchart(kb, nodes, list, (id) => data.has(id) || systemOf(kb, id) === system);
}

const NODE_WIKI_RE = /\b([A-Za-z]\w*)(\s*[[({>]+"?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const FLOWCHART_RE = /^\s*(?:---[\s\S]*?---\s*)?(?:flowchart|graph)\b/;

const EDGE_LABEL_RE = /\|[^|\n]*\|/g;
const SUBGRAPH_RE = /^\s*subgraph\b/;

function linkDiagram(kb, text) {
  const name = (id, label) => mermaidText(label ?? kb.entities.get(id).name);
  const named = (s) => s.replace(WIKI_RE, (_, id, label) => name(id, label));
  const clicks = [];
  const linkNodes = (line) => named(line.replace(EDGE_LABEL_RE, named).replace(NODE_WIKI_RE, (_, key, open, id, label) => {
    clicks.push(`  click ${key} href "#/e/${id}"`);
    return `${key}${open}${name(id, label)}`;
  }));
  const linked = text.split("\n").map((line) => (SUBGRAPH_RE.test(line) ? named(line) : linkNodes(line))).join("\n");
  return FLOWCHART_RE.test(linked) && clicks.length ? `${linked}\n${clicks.join("\n")}` : linked;
}

const mermaidFence = (diagram) => `\`\`\`mermaid\n${diagram}\n\`\`\``;

function renderCode(kb, s) {
  if (s.lang === "kb-list") return listTable(kb, s.query);
  if (s.lang === "kb-lineage") return mermaidFence(lineage(kb, s.query.system));
  if (s.lang === "mermaid") return mermaidFence(linkDiagram(kb, s.content));
  return s.raw;
}

function listTable(kb, query) {
  const found = sortEntities(kb, queryEntities(kb, query));
  if (found.length === 0) return "_Nothing matches yet._";
  const type = query.type && kb.typeById.get(query.type);
  const fields = type ? Object.entries(type.fields).filter(([, f]) => f.kind !== "ids") : [];
  const fieldCell = (e, [name, f]) => {
    const v = e.fields[name];
    return v === undefined ? "" : f.kind === "id" ? `[${cell(kb.entities.get(v).name)}](#/e/${v})` : cell(v);
  };
  const head = ["Name", ...(type ? [] : ["Type"]), ...fields.map(([n]) => n), "Summary"];
  const rows = found.map((e) => [
    `[${cell(e.name)}](#/e/${e.id})`, ...(type ? [] : [e.type]), ...fields.map((f) => fieldCell(e, f)), cell(e.summary),
  ]);
  return [head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function renderBody(kb, urls, doc) {
  return doc.segments.map((s) => {
    if (s.kind === "code") return renderCode(kb, s);
    return mapProse(s.text, (prose) => prose
      .replace(WIKI_RE, (_, id, label) => `[${label ?? kb.entities.get(id).name}](#/e/${id})`)
      .replace(REF_LINK_RE, (_, ref) => `](${urls.get(ref)})`));
  }).join("\n");
}

function ofType(kb, ids, type) {
  return sortEntities(kb, ids.map((id) => kb.entities.get(id)).filter((e) => e.type === type)).map((e) => e.id);
}

function siteTree(kb) {
  const ids = [...kb.entities.keys()];
  const systems = sortEntities(kb, [...kb.entities.values()].filter((e) => e.type === "system")).map((s) => {
    const owned = ids.filter((id) => id !== s.id && systemOf(kb, id) === s.id);
    const uses = systemUses(kb, s.id);
    const groups = kb.types
      .map((t) => ({ type: t.id, ids: ofType(kb, owned, t.id), uses: ofType(kb, [...uses.keys()], t.id) }))
      .filter((g) => g.ids.length || g.uses.length);
    return { id: s.id, groups, touches: Object.fromEntries(uses) };
  });
  const shared = ids.filter((id) => systemOf(kb, id) === null && kb.entities.get(id).type !== "project");
  const groups = kb.types.map((t) => ({ type: t.id, ids: ofType(kb, shared, t.id), uses: [] })).filter((g) => g.ids.length);
  return { systems, shared: { groups } };
}

export function buildPayload(kb, evidence, generated) {
  const entities = {};
  for (const e of kb.entities.values()) {
    const ev = evidence.byEntity.get(e.id);
    entities[e.id] = {
      type: e.type, name: e.name, summary: e.summary, in: e.in, reviewed: e.reviewed, fields: e.fields,
      body: renderBody(kb, evidence.urls, e),
      refs: ev.refs.map((r) => ({ text: r.text, url: r.url, checked: r.checked })),
      out: e.links,
      inc: kb.graph.incoming.get(e.id),
      children: sortEntities(kb, kb.graph.children.get(e.id).map((id) => kb.entities.get(id))).map((c) => c.id),
      mentionedBy: kb.graph.mentionedBy.get(e.id),
      inverse: kb.graph.inverse.get(e.id),
      suspect: ev.suspect,
      diagram: diagramFor(kb, e.id),
      flows: sortEntities(kb, kb.graph.flowsOf.get(e.id).map((id) => kb.entities.get(id))).map((f) => f.id),
    };
  }
  return {
    project: kb.project.id,
    title: kb.project.name,
    generated,
    types: kb.types.map((t) => ({
      id: t.id, label: t.label,
      fields: Object.entries(t.fields).map(([name, f]) => ({ name, kind: f.kind })),
    })),
    entities,
    tree: siteTree(kb),
    views: kb.views.map((v) => ({ id: v.id, title: v.title, body: renderBody(kb, evidence.urls, v) })),
  };
}

export function renderHtml(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const shell = fs.readFileSync(SHELL, "utf8");
  return shell
    .replace("{{TITLE}}", () => payload.title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`))
    .replace("{{DATA}}", () => json);
}
