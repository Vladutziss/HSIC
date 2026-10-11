import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseKnowledge, validateProposals } from "../../../supabase/functions/_shared/agent-core.js";

const habits = [
  { id: "h1", name: "Alergat" },
  { id: "h2", name: "Citit" },
];
const read = new Set(["sheeran-2025", "lally-2010"]);

test("every knowledge file parses and carries a limit next to what it shows", () => {
  const dir = new URL("../../../knowledge/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(files.length >= 8);
  for (const f of files) {
    const { meta, chunks } = parseKnowledge(readFileSync(new URL(f, dir), "utf8"));
    assert.equal(f, `${meta.id}.md`);
    assert.match(meta.doi, /^10\.\d{4,}\//);
    assert.deepEqual(chunks.map((c) => c.kind).sort(), ["limits", "shows"]);
  }
});

test("a source the agent did not retrieve is never cited", () => {
  const [p] = validateProposals(
    [{ action: "change", habitId: "h1", diff: 1, days: [1, 3], reason: "0 din 4 miercurea", sources: ["sheeran-2025", "invented-2030"] }],
    habits,
    read,
    8
  );
  assert.deepEqual(p.sources, ["sheeran-2025"]);
});

test("a proposal can only change a habit that exists, and add only while a slot is free", () => {
  const raw = [
    { action: "change", habitId: "nope", diff: 1, days: [1], reason: "x" },
    { action: "add", name: "Stretching", diff: 1, days: [2, 4], reason: "mic" },
    { action: "add", name: "Meditație", diff: 9, days: [9, 1], reason: "al doilea" },
  ];
  const out = validateProposals(raw, habits, read, 3); // 2 habits, limit 3: one free slot
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Stretching");
});

test("difficulty is clamped, weekdays deduplicated, empty reasons and empty days dropped", () => {
  const out = validateProposals(
    [
      { action: "change", habitId: "h2", diff: 7, days: [1, 1, 8, 5], reason: "ok" },
      { action: "change", habitId: "h1", diff: 2, days: [], reason: "fără zile" },
      { action: "change", habitId: "h1", diff: 2, days: [1], reason: "  " },
    ],
    habits,
    read,
    8
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].diff, 3);
  assert.deepEqual(out[0].days, [1, 5]);
});
