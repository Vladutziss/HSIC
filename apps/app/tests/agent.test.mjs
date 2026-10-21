import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseKnowledge, recommendationExplanation, validateProposals } from "../../../supabase/functions/_shared/agent-core.js";

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

test("recommendation explanation is bounded and optional", () => {
  assert.deepEqual(recommendationExplanation({ dataUsed: ["completion rate", "completion rate", "x".repeat(200)], confidence: "high", expectedEffect: "  easier start  " }), {
    dataUsed: ["completion rate", "x".repeat(99) + "…"],
    confidence: "high",
    expectedEffect: "easier start",
  });
  assert.deepEqual(recommendationExplanation(), { dataUsed: [], confidence: "unknown", expectedEffect: null });
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

test("an experiment names only an existing habit and a known factor, one per run", () => {
  const out = validateProposals(
    [
      { action: "experiment", habitId: "nope", factor: "if_then", reason: "x" },
      { action: "experiment", habitId: "h1", factor: "made_up", reason: "x" },
      { action: "experiment", habitId: "h1", factor: "if_then", reason: "0 din 4 miercurea", sources: ["sheeran-2025", "invented"] },
      { action: "experiment", habitId: "h2", factor: "easier_version", reason: "al doilea" },
    ],
    habits,
    read,
    8
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { action: "experiment", habitId: "h1", factor: "if_then", reason: "0 din 4 miercurea", sources: ["sheeran-2025"] });
});

test("schoolSnapshot: upcoming exams with daysLeft, open assignments, 14-day study minutes per subject", async () => {
  const { schoolSnapshot } = await import("../../../supabase/functions/_shared/agent-core.js");
  const s = schoolSnapshot(
    {
      schoolPlanner: {
        exams: [{ subject: "Mate", title: "Test", date: "2026-10-16" }, { subject: "Fiz", title: "Vechi", date: "2026-10-01" }],
        assignments: [{ title: "Fișă", subject: "Mate", due: "2026-10-14", estimatedMinutes: 40 }, { title: "Făcută", due: "2026-10-14", done: true }],
        sessions: [
          { subject: "Mate", day: "2026-10-12", minutes: 30 },
          { subject: "mate", day: "2026-10-01", minutes: 20 },
          { subject: "Fiz", day: "2026-09-20", minutes: 90 },
        ],
      },
    },
    "2026-10-13",
  );
  assert.deepEqual(s.exams, [{ subject: "Mate", title: "Test", date: "2026-10-16", daysLeft: 3 }]);
  assert.equal(s.assignments.length, 1);
  assert.equal(s.assignments[0].daysLeft, 1);
  assert.deepEqual(s.studyMinutes14d, [{ subject: "Mate", minutes: 50 }]);
  assert.equal(schoolSnapshot({}, "2026-10-13").hasData, false);
});

test("validateProposals keeps a study todo only with title, a date and 10-60 minutes", () => {
  const ok = { action: "todo", title: "Recapitulare Mate", date: "2026-10-14", dur: 25, reason: "Examen peste 3 zile" };
  const out = validateProposals([ok, { ...ok, dur: 5 }, { ...ok, date: "mâine" }, { ...ok, title: "" }], [], new Set(), 3);
  assert.equal(out.length, 1);
  assert.equal(out[0].action, "todo");
  assert.equal(out[0].dur, 25);
});

test("remember: kept only with a valid kind and body, once per body", () => {
  const raw = [
    { action: "remember", noteKind: "constraint", body: "  Nu pot seara, am antrenament  ", reason: "a spus-o" },
    { action: "remember", noteKind: "constraint", body: "Nu pot seara, am antrenament", reason: "dublură" },
    { action: "remember", noteKind: "diagnosis", body: "x", reason: "tip greșit" },
    { action: "remember", noteKind: "event", body: "Tabără", startsOn: "2026-11-10", endsOn: "2026-11-01", reason: "date inversate" },
    { action: "remember", noteKind: "event", body: "", reason: "gol" },
  ];
  const out = validateProposals(raw, habits, read, 8);
  assert.equal(out.length, 1);
  assert.equal(out[0].body, "Nu pot seara, am antrenament");
  assert.equal(out[0].startsOn, null);
});

test("a goal needs a free slot, a title and steps; one per run; never one the player already has", async () => {
  const { goalsSnapshot } = await import("../../../supabase/functions/_shared/agent-core.js");
  const goal = { action: "goal", title: "Termin cursul de Python", why: "Vreau să construiesc un joc", deadline: "2026-12-01", steps: ["Lecția 1", "Lecția 2", ""], reason: "Ai spus că vrei asta" };
  const ok = validateProposals([goal], habits, read, 8, 2);
  assert.equal(ok.length, 1);
  assert.deepEqual(ok[0].steps, ["Lecția 1", "Lecția 2"]);
  assert.equal(ok[0].deadline, "2026-12-01");
  assert.equal(validateProposals([goal], habits, read, 8, 0).length, 0, "no free slot");
  assert.equal(validateProposals([{ ...goal, steps: [] }], habits, read, 8, 2).length, 0, "no steps");
  assert.equal(validateProposals([goal], habits, read, 8, 2, ["termin cursul de python"]).length, 0, "already has it");
  assert.equal(validateProposals([goal, { ...goal, title: "Altul" }], habits, read, 8, 2).length, 1, "one per run");
  const snap = goalsSnapshot({ objectives: [{ title: "A", steps: [{ done: true }, { done: false }] }, { title: "B", archived: true }], profile: { goal: "Să fiu constant" } }, "2026-10-21");
  assert.equal(snap.active.length, 1);
  assert.equal(snap.free, 5);
  assert.equal(snap.profileGoal, "Să fiu constant");
});
