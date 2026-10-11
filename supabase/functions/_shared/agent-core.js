// Pure rules of the coach agent (supabase/functions/agent), kept free of Deno APIs so
// apps/app/tests/agent.test.mjs and scripts/build-knowledge.mjs can import them.

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** Factors the agent may test on a player (the catalog with texts is lib/experiments.js FACTORS). */
export const EXPERIMENT_FACTORS = ["if_then", "easier_version"];

/** One file of knowledge/ -> {meta, chunks}. Frontmatter, then `## shows` and `## limits` sections. */
export function parseKnowledge(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("missing frontmatter");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["id", "cite", "doi", "strength"]) if (!meta[k]) throw new Error(`${meta.id || "?"}: missing ${k}`);
  if (!["strong", "moderate", "theory"].includes(meta.strength)) throw new Error(`${meta.id}: bad strength`);
  const chunks = [];
  for (const part of m[2].split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    const kind = part.slice(0, nl).trim();
    const body = part.slice(nl + 1).trim();
    if (!["shows", "limits"].includes(kind) || !body) throw new Error(`${meta.id}: bad chunk "${kind}"`);
    chunks.push({ id: `${meta.id}#${kind}`, source: meta.id, kind, body });
  }
  if (chunks.length !== 2) throw new Error(`${meta.id}: needs one shows and one limits chunk`);
  return { meta, chunks };
}

/**
 * The agent's proposals, checked against what is real: `habits` are the player's active habits,
 * `retrieved` the Set of source ids the agent actually read, `max` the habit limit.
 * A source the agent did not retrieve is dropped, so it can never be cited; a proposal with no
 * source left is kept but shown as "fără sursă". Returns at most 3, and at most one experiment
 * (which only names a habit and a factor: the days are drawn by the server, never by the model).
 */
export function validateProposals(raw, habits, retrieved, max) {
  const ids = new Set(habits.map((h) => h.id));
  let count = habits.length;
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (out.length >= 3) break;
    const reason = clip(p?.reason, 200);
    if (!reason) continue;
    const sources = [...new Set((Array.isArray(p?.sources) ? p.sources : []).map(String).filter((s) => retrieved.has(s)))].slice(0, 3);
    if (p?.action === "experiment") {
      if (ids.has(p.habitId) && EXPERIMENT_FACTORS.includes(p.factor) && !out.some((o) => o.action === "experiment")) {
        out.push({ action: "experiment", habitId: p.habitId, factor: p.factor, reason, sources });
      }
      continue;
    }
    const days = [...new Set((Array.isArray(p?.days) ? p.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (!days.length) continue;
    const base = { diff: Math.min(3, Math.max(1, Math.round(Number(p?.diff)) || 2)), days, reason, sources };
    if (p?.action === "change" && ids.has(p.habitId)) out.push({ ...base, action: "change", habitId: p.habitId });
    else if (p?.action === "add" && clip(p.name, 40).length > 1 && count < max) {
      count++;
      out.push({ ...base, action: "add", name: clip(p.name, 40) });
    }
  }
  return out;
}
