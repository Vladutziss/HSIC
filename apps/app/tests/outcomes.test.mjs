import test from "node:test";
import assert from "node:assert/strict";
import { OUTCOME_DAYS, outcomeDueDate, isOutcomeDue, measureOutcome, summarizeOutcomes } from "../src/lib/outcomes.js";
import { addDays } from "../src/lib/dates.js";

const DECIDED = "2026-09-01";
const TODAY = "2026-09-29"; // after window: 09-02 .. 09-28 = 27 days

// Every-day habit; `pattern(day, i)` says whether it was done. i counts from the window start.
function build({ before, after, createdAt = "2026-01-01" }) {
  const log = {};
  for (let i = 0; i < 28; i++) {
    const d = addDays(DECIDED, -28 + i);
    if (before(i)) (log[d] ||= {}).h1 = "done";
  }
  for (let i = 0; i < 27; i++) {
    const d = addDays(DECIDED, 1 + i);
    if (after(i)) (log[d] ||= {}).h1 = "done";
  }
  return { habits: [{ id: "h1", name: "Run", days: [0, 1, 2, 3, 4, 5, 6], createdAt }], log };
}
const act = (o = {}) => ({
  id: "a1", kind: "change_habit", status: "applied", habit_id: "h1", payload: {},
  baseline: null, outcome: null, outcome_due: null, decided_at: `${DECIDED}T10:00:00Z`, ...o,
});
// rate r over n days, evenly spread
const rate = (r) => (i) => Math.floor((i + 1) * r) > Math.floor(i * r);

test("due date", () => {
  assert.equal(OUTCOME_DAYS, 14);
  assert.equal(outcomeDueDate("2026-09-01"), "2026-09-15");
  assert.equal(outcomeDueDate("2026-12-25"), "2027-01-08");
});

test("improved 30% -> 85%", () => {
  const r = measureOutcome(act(), build({ before: rate(0.3), after: rate(0.85) }), TODAY);
  assert.equal(r.verdict, "improved");
  assert.equal(r.caveat, "before_after");
  assert.equal(r.before.n, 28);
  assert.equal(r.after.n, 27);
  assert.ok(r.diff > 0.5);
  assert.ok(r.p < 0.001);
  assert.ok(r.ci[0] > 0);
  assert.equal(r.habitId, "h1");
  assert.equal(r.decidedDay, DECIDED);
});

test("worse 85% -> 30%", () => {
  const r = measureOutcome(act(), build({ before: rate(0.85), after: rate(0.3) }), TODAY);
  assert.equal(r.verdict, "worse");
  assert.ok(r.diff < -0.5);
});

test("no clear change 60% -> 63%", () => {
  const r = measureOutcome(act(), build({ before: rate(0.6), after: rate(0.63) }), TODAY);
  assert.equal(r.verdict, "no_clear_change");
  assert.equal(r.caveat, "before_after");
});

test("insufficient: too few days after", () => {
  const r = measureOutcome(act(), build({ before: rate(0.3), after: rate(0.9) }), addDays(DECIDED, 5)); // 4 days after
  assert.equal(r.verdict, "insufficient");
  assert.equal(r.caveat, "before_after");
  assert.equal(r.diff, null);
});

test("recent createdAt but older log still measured", () => {
  const st = build({ before: rate(0.3), after: rate(0.85), createdAt: addDays(DECIDED, 3) });
  const r = measureOutcome(act(), st, TODAY);
  assert.ok(r.before.n >= 20); // history starts at the first tick (day 3 of the window), not at createdAt
  assert.equal(r.verdict, "improved");
});

test("not applicable kinds and missing habit", () => {
  const st = build({ before: rate(0.3), after: rate(0.9) });
  assert.deepEqual(measureOutcome(act({ kind: "create_experiment_x", habit_id: null }), st, TODAY), { verdict: "not_applicable" });
  assert.deepEqual(measureOutcome(act({ kind: "set_reminder" }), st, TODAY), { verdict: "not_applicable" });
  assert.equal(measureOutcome(act({ habit_id: "nope" }), st, TODAY).verdict, "insufficient");
});

test("rateOnAllDays fallback present", () => {
  const r = measureOutcome(act(), build({ before: rate(0.5), after: rate(0.5) }), TODAY);
  assert.equal(r.before.rateOnAllDays, 0.5);
  assert.equal(r.after.rateOnAllDays, 0.4815); // 13 of 27
});

test("isOutcomeDue edge cases", () => {
  const due = addDays(DECIDED, 14);
  assert.equal(isOutcomeDue(act(), due), true); // due today
  assert.equal(isOutcomeDue(act(), addDays(due, -1)), false);
  assert.equal(isOutcomeDue(act({ status: "proposed" }), due), false);
  assert.equal(isOutcomeDue(act({ outcome: { verdict: "improved" } }), due), false);
  assert.equal(isOutcomeDue(act({ outcome: {} }), due), true);
  assert.equal(isOutcomeDue(act({ outcome_due: "2026-09-05" }), "2026-09-05"), true);
  assert.equal(isOutcomeDue(act({ decided_at: null }), due), false);
});

test("summarize", () => {
  const s = summarizeOutcomes([
    { kind: "change_habit", outcome: { verdict: "improved" } },
    { kind: "change_habit", outcome: { verdict: "improved" } },
    { kind: "add_habit", outcome: { verdict: "no_clear_change" } },
    { kind: "create_todo", outcome: null },
  ]);
  assert.deepEqual(s, { total: 3, byVerdict: { improved: 2, no_clear_change: 1 }, byKind: { change_habit: 2, add_habit: 1 } });
});

test("deterministic and JSON-safe", () => {
  const st = build({ before: rate(0.3), after: rate(0.85) });
  const a = measureOutcome(act(), st, TODAY);
  const b = measureOutcome(act(), st, TODAY);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test("create_todo / plan_focus: done or open, plus activity around the day", () => {
  const day = "2026-09-10";
  const log = {};
  for (let i = 1; i <= 28; i++) log[addDays(day, -i)] = { h1: "done" }; // 1 check-in a day before
  for (let i = 0; i <= 3; i++) log[addDays(day, i)] = { h1: "done", h2: "done" }; // 2 a day after
  const todo = { id: "tag-a9", done: true, doneOn: day };
  const action = (kind) => ({ id: "a9", kind, status: "applied", payload: { date: day }, before: { todoId: "tag-a9" }, decided_at: `${day}T08:00:00Z` });
  const done = measureOutcome(action("plan_focus"), { todos: [todo], log, habits: [] }, TODAY);
  assert.equal(done.verdict, "todo_done");
  assert.equal(done.completedOn, day);
  assert.equal(done.activity.baseline, 1);
  assert.equal(done.activity.rate, 2.25); // 2 check-ins + the to-do done on day 0, 4 days
  assert.equal(done.caveat, "before_after");
  assert.equal(measureOutcome(action("create_todo"), { todos: [{ ...todo, done: false, doneOn: null }], log, habits: [] }, TODAY).verdict, "todo_open");
  assert.equal(measureOutcome(action("create_todo"), { todos: [], log, habits: [] }, TODAY).verdict, "insufficient");
});
