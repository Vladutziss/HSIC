import test from "node:test";
import assert from "node:assert/strict";
import { chatContext, normalizePlan } from "../src/lib/chat.js";
import { buildPrompt } from "../../../supabase/functions/_shared/prompts.ts";

test("normalizePlan clips, validates and drops invalid items", () => {
  const p = normalizePlan({
    title: "x".repeat(200),
    steps: [
      { text: "Pas 1", period: "month", due: "2026-11-01", criteria: "gata" },
      { text: "Pas 2", period: "year", due: "mâine" },
      { text: "  " },
      ...Array(8).fill({ text: "alt pas" }),
    ],
    habits: [{ name: "Citit", diff: 9, days: [1, 3, 7, "2", 3, -1] }, { name: "Fără zile", days: [] }, { name: "" }],
    todos: [{ title: "Fișe", date: "2026-10-14", dur: 5 }, { title: "Fără dată", date: "azi" }],
    why: "de ce",
  });
  assert.equal(p.title.length, 80);
  assert.equal(p.steps.length, 6);
  assert.deepEqual(p.steps[0], { text: "Pas 1", period: "month", due: "2026-11-01", criteria: "gata" });
  assert.deepEqual(p.steps[1], { text: "Pas 2", period: "week", due: "", criteria: "" });
  assert.deepEqual(p.habits, [{ name: "Citit", diff: 3, days: [1, 3] }]);
  assert.deepEqual(p.todos, [{ title: "Fișe", date: "2026-10-14", dur: 10 }]);
  assert.equal(p.why, "de ce");
});

test("normalizePlan returns null when nothing is usable", () => {
  assert.equal(normalizePlan(null), null);
  assert.equal(normalizePlan("plan"), null);
  assert.equal(normalizePlan({ title: "Doar titlu", steps: [{ text: "" }], habits: [], todos: [] }), null);
});

test("chatContext keeps open, non-archived items within caps", () => {
  const state = {
    habits: [{ name: "Alergare", diff: 2, days: [1, 3], archivedAt: "2026-09-01" }, ...Array.from({ length: 12 }, (_, i) => ({ name: `h${i}`, diff: 1, days: [0] }))],
    goals: [{ text: "Gata", period: "week", done: true }, { text: "Deschis", period: "month" }],
    todos: [{ title: "Făcut", done: true }, { title: "De făcut", date: "2026-10-14" }],
    schoolPlanner: {
      assignments: [{ title: "Eseu", subject: "Ro", due: "2026-10-15" }, { title: "Vechi", due: "2026-10-01" }],
      exams: [{ title: "Test", subject: "Mate", date: "2026-10-20" }],
    },
  };
  const notes = [{ body: "Am antrenament marțea", starts_on: null, ends_on: null }, { body: "Expirat", ends_on: "2026-01-01" }];
  const c = chatContext(state, "2026-10-13", notes);
  assert.equal(c.habits.length, 10);
  assert.ok(!c.habits.some((h) => h.name === "Alergare"));
  assert.deepEqual(c.goals, [{ text: "Deschis", period: "month", done: false }]);
  assert.deepEqual(c.todos, [{ title: "De făcut", date: "2026-10-14" }]);
  assert.deepEqual(c.assignments, [{ title: "Eseu", subject: "Ro", due: "2026-10-15" }]);
  assert.deepEqual(c.exams, [{ title: "Test", subject: "Mate", date: "2026-10-20" }]);
  assert.deepEqual(c.notes, ["Am antrenament marțea"]);
  assert.equal(c.today, "2026-10-13");
  assert.deepEqual(chatContext({}, "2026-10-13").habits, []);
});

test("buildPrompt chat includes the last message and asks for JSON", () => {
  const out = buildPrompt("chat", {
    name: "Mo",
    cls: "Explorer",
    goal: "Învăț chitară",
    messages: [{ role: "user", content: "Vreau să învăț chitară" }, { role: "assistant", content: "Cât timp ai?" }, { role: "user", content: "20 de minute pe zi" }],
    plan: null,
    context: { today: "2026-10-13" },
  });
  assert.equal(typeof out, "string");
  assert.ok(out.includes("20 de minute pe zi"));
  assert.ok(out.includes("JSON"));
});

test("buildPrompt chat forbids claims about completions it has no data for", () => {
  const out = buildPrompt("chat", { messages: [{ role: "user", content: "cum stau azi?" }], context: { today: "2026-10-19", habits: [{ name: "Citit", diff: 1, days: [0, 1] }] } });
  assert.ok(out.includes("NO completion data"));
});
