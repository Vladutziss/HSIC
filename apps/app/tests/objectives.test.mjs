import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminders, goalStreak, idleDays, newMarks, nextStep, pace, pct, progress, stepDoneDays, toggleStep, toggleSub } from "../src/lib/objectives.js";
import { computeTimeline } from "../src/lib/engine.js";

const goal = (extra = {}) => ({
  id: "o1",
  title: "Test",
  start: "2026-10-01",
  deadline: "2026-10-31",
  steps: [
    { id: "s1", title: "A", done: true, doneOn: "2026-10-02", subs: [] },
    { id: "s2", title: "B", done: false, doneOn: null, subs: [
      { id: "x1", title: "b1", done: true, doneOn: "2026-10-05" },
      { id: "x2", title: "b2", done: false, doneOn: null },
    ] },
    { id: "s3", title: "C", done: false, doneOn: null, subs: [] },
    { id: "s4", title: "D", done: false, doneOn: null, subs: [] },
  ],
  log: [],
  ...extra,
});

test("progress counts sub-steps as fractions of their step", () => {
  assert.equal(pct(goal()), Math.round(((1 + 0.5) / 4) * 100)); // 38
  assert.equal(progress({ ...goal(), doneOn: "2026-10-09" }), 1);
});

test("a number goal and steps weigh the same", () => {
  const o = goal({ metric: { unit: "km", start: 0, target: 10, value: 5 } });
  assert.equal(pct(o), Math.round(((1.5 / 4 + 0.5) / 2) * 100));
  assert.equal(pct({ steps: [], metric: { start: 80, target: 70, value: 75 } }), 50); // going down works too
});

test("next step is the first open one, with its first open sub-step", () => {
  const n = nextStep(goal());
  assert.equal(n.step.id, "s2");
  assert.equal(n.sub.id, "x2");
});

test("ticking the last sub-step finishes the step; ticking a step finishes its sub-steps", () => {
  const o = toggleSub(goal(), "s2", "x2", "2026-10-09");
  assert.equal(o.steps[1].done, true);
  assert.equal(o.steps[1].doneOn, "2026-10-09");
  const back = toggleSub(o, "s2", "x1", "2026-10-09");
  assert.equal(back.steps[1].done, false);
  const all = toggleStep(goal(), "s2", "2026-10-09");
  assert.ok(all.steps[1].subs.every((x) => x.done));
  assert.equal(all.steps[1].subs[0].doneOn, "2026-10-05"); // already ticked keeps its day
});

test("pace compares progress with the time used", () => {
  assert.equal(pace(goal(), "2026-10-05").status, "ahead"); // 38% done, 13% of the time
  assert.equal(pace(goal(), "2026-10-28").status, "behind");
  assert.equal(pace(goal(), "2026-11-02").status, "late");
  assert.equal(pace(goal({ deadline: null }), "2026-10-05").status, "none");
});

test("idle days, streak and milestones", () => {
  const o = goal({ log: [{ day: "2026-10-08", text: "x", kind: "note" }, { day: "2026-10-07", text: "y", kind: "note" }] });
  assert.equal(idleDays(o, "2026-10-10"), 2);
  assert.equal(goalStreak(o, "2026-10-09"), 2);
  assert.equal(goalStreak(o, "2026-10-10"), 0);
  assert.deepEqual(newMarks(goal()), [25]);
  assert.deepEqual(newMarks(goal({ seenMarks: [25] })), []);
});

test("reminders: on their weekdays after their time, or after days without movement", () => {
  const r = { on: true, days: [5], time: "18:00" }; // Fridays
  const o = goal({ reminder: r, log: [{ day: "2026-10-08", text: "", kind: "note" }] });
  assert.equal(dueReminders([o], "2026-10-09", 17 * 60).length, 0); // Friday, before 18:00
  assert.equal(dueReminders([o], "2026-10-09", 18 * 60)[0].reason, "scheduled");
  assert.equal(dueReminders([{ ...o, log: [...o.log, { day: "2026-10-09", kind: "note" }] }], "2026-10-09", 20 * 60).length, 0); // moved today
  assert.equal(dueReminders([goal({ reminder: { on: false } })], "2026-10-12", 600)[0].reason, "idle"); // last moved 10-05
  assert.equal(dueReminders([goal({ doneOn: "2026-10-09" })], "2026-10-20", 600).length, 0);
});

test("ticked steps feed momentum like to-dos", () => {
  assert.deepEqual(stepDoneDays([goal()]).sort(), ["2026-10-02", "2026-10-05"]);
  const base = { habits: [], log: {}, todos: [], meta: { start: "2026-10-01" } };
  const without = computeTimeline(base, "2026-10-05");
  const withGoal = computeTimeline({ ...base, objectives: [goal()] }, "2026-10-05");
  assert.ok(withGoal.current.momentum > without.current.momentum);
});
