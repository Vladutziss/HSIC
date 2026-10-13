import test from "node:test";
import assert from "node:assert/strict";
import { goalSet, habitList, summary, todoList } from "../src/lib/planApply.js";

const today = "2026-10-13";
const plan = {
  title: "Programare de la zero",
  why: "x",
  steps: [
    { text: "Alege limbajul", period: "week", due: "2026-10-20", criteria: "limbaj ales" },
    { text: "  ", period: "week" },
    { text: "Primul program", period: "month", due: "nu" },
  ],
  habits: [
    { name: "Exerciții", diff: 2, days: [1, 3, 3, 9] },
    { name: "alergare", diff: 5, days: [2] },
    { name: "Fără zile", diff: 1, days: [] },
  ],
  todos: [
    { title: "Instalează editorul", date: "2026-10-14", dur: 20 },
    { title: "Instalează editorul", date: "2026-10-14", dur: 20 },
    { title: "Deja aici", date: today, dur: 15 },
    { title: "Fără dată" },
  ],
};

test("goalSet: parent in this month, steps inherit it, blanks and bad dates dropped", () => {
  const g = goalSet(plan, today);
  assert.deepEqual(g.parent, { text: "Programare de la zero", period: "month", key: "2026-10" });
  assert.equal(g.children.length, 2);
  assert.equal(g.children[0].due, "2026-10-20");
  assert.equal(g.children[1].due, undefined);
  assert.equal(goalSet({ title: "x", steps: [] }, today), null);
});

test("todoList: skips copies and open duplicates, defaults date and duration", () => {
  const state = { todos: [{ title: "Deja aici", date: today, done: false }] };
  assert.deepEqual(todoList(plan, state, today), [
    { title: "Instalează editorul", date: "2026-10-14", dur: 20 },
    { title: "Fără dată", date: today, dur: 30 },
  ]);
});

test("habitList: valid days, no existing names, clamped difficulty", () => {
  const state = { habits: [{ name: "Alergare" }] };
  assert.deepEqual(habitList(plan, state), [{ name: "Exerciții", days: [1, 3], diff: 2 }]);
});

test("summary", () => {
  assert.equal(summary({ steps: 3, todos: 1, habits: 2 }), "Adăugat: 3 pași, 1 to-do, 2 obiceiuri.");
  assert.match(summary({}), /exista deja/);
});
