import test from "node:test";
import assert from "node:assert/strict";
import { agentImpact, SUPPORTED, traceLines, hasOpenTodo, mapRow, pendingAuto, pendingConfirm, recent, planApply, planUndo, recordTodo } from "../src/lib/agentActions.js";

const today = "2026-10-11";
const state = () => ({
  profile: { path: "sport" },
  todos: [{ id: "t1", title: "x" }],
  habits: [{ id: "h1", name: "Alergare", diff: 2, days: [1, 3], color: "#3987e5" }],
});
const act = (o) => ({ id: "a1", status: "pending", autonomy: "confirm", payload: {}, before: null, ...o });

test("mapRow maps snake_case to camelCase", () => {
  const a = mapRow({ id: "1", run_id: "r", kind: "create_todo", autonomy: "auto", status: "pending", habit_id: null, payload: { title: "a", explanation: { confidence: "medium" } }, reason: "x", created_at: "t", outcome_due: "2026-10-20" });
  assert.equal(a.runId, "r");
  assert.equal(a.outcomeDue, "2026-10-20");
  assert.deepEqual(a.sources, []);
  assert.deepEqual(a.explanation, { confidence: "medium" });
  assert.equal(a.before, null);
});

test("selectors", () => {
  const list = [
    act({ id: "1", autonomy: "auto" }),
    act({ id: "2" }),
    act({ id: "3", status: "applied", createdAt: "2026-01-01" }),
    act({ id: "4", status: "rejected", createdAt: "2026-02-01" }),
  ];
  assert.deepEqual(pendingAuto(list).map((a) => a.id), ["1"]);
  assert.deepEqual(pendingConfirm(list).map((a) => a.id), ["2"]);
  assert.deepEqual(recent(list).map((a) => a.id), ["4", "3"]);
});

test("create_todo apply, idempotence, undo", () => {
  const a = act({ kind: "create_todo", payload: { title: "Pregătește ghiozdanul", dur: 15 } });
  const { patch, before } = planApply(a, state(), today);
  const s1 = patch(state());
  const todo = s1.todos.find((t) => t.id === before.todoId);
  assert.deepEqual(todo, { id: before.todoId, title: "Pregătește ghiozdanul", date: today, time: null, dur: 15, done: false, doneOn: null, createdAt: today, fromAgent: true });
  assert.equal(patch(s1), s1); // second time: untouched
  const s2 = planUndo({ ...a, before }, s1).patch(s1);
  assert.deepEqual(s2.todos, state().todos);
});

test("plan_focus creates a focus to-do, idempotent, undoable", async () => {
  const a = act({ kind: "plan_focus", payload: { title: "Mate, probleme", dur: 25 } });
  const { patch, before } = planApply(a, state(), today);
  const s1 = patch(state());
  const todo = s1.todos.find((t) => t.id === before.todoId);
  assert.equal(todo.focus, true);
  assert.equal(todo.dur, 25);
  assert.equal(patch(s1), s1);
  assert.deepEqual(planUndo({ ...a, before }, s1).patch(s1).todos, state().todos);
  assert.equal(planApply(act({ kind: "create_todo", payload: { title: "x" } }), state(), today).before.todoId.startsWith("tag-"), true);
  assert.equal("focus" in planApply(act({ kind: "create_todo", payload: { title: "x" } }), state(), today).patch(state()).todos[1], false);
  let row;
  const client = { from: () => ({ insert: (r) => ((row = r), { select: () => ({ single: async () => ({ data: { id: "x", ...r }, error: null }) }) }) }) };
  await recordTodo(client, { title: "Mate", date: today, dur: 25, reason: "r", focus: true });
  assert.equal(row.kind, "plan_focus");
});

test("change_habit apply keeps previous values and undo restores them", () => {
  const a = act({ kind: "change_habit", habitId: "h1", payload: { diff: 1, days: [1, 3, 5] } });
  const { patch, before } = planApply(a, state(), today);
  assert.deepEqual(before, { diff: 2, days: [1, 3] });
  const s1 = patch(state());
  assert.equal(s1.habits[0].diff, 1);
  assert.deepEqual(s1.habits[0].days, [1, 3, 5]);
  // re-planning on the changed state still reports the original values
  assert.deepEqual(planApply({ ...a, before }, s1, today).before, before);
  const s2 = planUndo({ ...a, before }, s1).patch(s1);
  assert.deepEqual(s2.habits, state().habits);
});

test("change_habit on a missing habit is an error", () => {
  assert.equal(planApply(act({ kind: "change_habit", habitId: "nope", payload: { diff: 1, days: [1] } }), state(), today).error, "not_found");
});

test("add_habit apply, idempotence, undo archives", () => {
  const a = act({ kind: "add_habit", payload: { name: "Stretching", diff: 1, days: [1, 2, 3] } });
  const { patch, before } = planApply(a, state(), today);
  const s1 = patch(state());
  assert.equal(s1.habits.length, 2);
  const h = s1.habits.find((x) => x.id === before.habitId);
  assert.equal(h.name, "Stretching");
  assert.deepEqual(h.days, [1, 2, 3]);
  assert.equal(h.createdAt, today);
  assert.equal(patch(s1), s1);
  const s2 = planUndo({ ...a, before }, s1, today).patch(s1);
  assert.equal(s2.habits.length, 2); // never deleted
  assert.equal(s2.habits.find((x) => x.id === before.habitId).archivedAt, today);
});

test("unsupported and invalid kinds", () => {
  assert.deepEqual(planApply(act({ kind: "set_reminder" }), state(), today), { error: "unsupported" });
  assert.equal(planApply(act({ kind: "create_todo", payload: {} }), state(), today).error, "invalid");
  assert.equal(planUndo(act({ kind: "create_todo" }), state()).error, "no_before");
});

test("recordTodo logs a pending create_todo with its explanation; hasOpenTodo spots duplicates", async () => {
  let row;
  const client = { from: () => ({ insert: (r) => ((row = r), { select: () => ({ single: async () => ({ data: { id: "x", ...r }, error: null }) }) }) }) };
  const a = await recordTodo(client, { title: "Mate 15 min", date: today, dur: 15, reason: "Test vineri", explanation: { dataUsed: ["test"], confidence: "high", expectedEffect: null } });
  assert.equal(row.kind, "create_todo");
  assert.equal(row.status, "pending");
  assert.equal(a.explanation.confidence, "high");
  assert.equal(planApply(a, state(), today).error, undefined);
  const s = { todos: [{ title: "Mate 15 min", date: today, done: false }] };
  assert.equal(hasOpenTodo(s, "Mate 15 min", today), true);
  assert.equal(hasOpenTodo(s, "Mate 15 min", "2026-10-12"), false);
});

test("add_note is a supported kind confirmed by the player", () => {
  assert.ok(SUPPORTED.includes("add_note"));
});

test("traceLines: one line per tool call, proposals and unknown steps skipped", () => {
  const out = traceLines([{ kind: "stats" }, { kind: "patterns", findings: 1, tested: 6 }, { kind: "search", query: "ancore", sources: ["a"] }, { kind: "propose", ok: true }]);
  assert.equal(out.length, 3);
  assert.match(out[1], /1 găsit din 6/);
  assert.match(out[2], /ancore/);
  assert.deepEqual(traceLines(null), []);

});

test("agentImpact: counts proposals that needed a tap and their measured verdicts", () => {
  const log = [
    { autonomy: "confirm", status: "applied", outcome: { verdict: "improved" } },
    { autonomy: "confirm", status: "applied", outcome: { verdict: "no_clear_change" } },
    { autonomy: "confirm", status: "applied", outcome: { verdict: "insufficient" } },
    { autonomy: "confirm", status: "rejected" },
    { autonomy: "auto", status: "applied", outcome: { verdict: "todo_done" } },
  ];
  assert.deepEqual(agentImpact(log), { proposals: 4, applied: 3, rejected: 1, measured: 2, improved: 1, same: 1, worse: 0 });
  assert.equal(agentImpact(null).proposals, 0);
});
