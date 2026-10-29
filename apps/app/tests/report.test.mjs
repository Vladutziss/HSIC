import test from "node:test";
import assert from "node:assert/strict";
import { monthBounds, monthReport, shiftMonth } from "../src/lib/report.js";
import { buildStats } from "../src/lib/stats.js";

const today = "2026-10-20";
const at = (day, h) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime();

// every day of the week, a habit from 1 October; ticked on 1-5 and 10, a month before that nothing
const habit = { id: "h1", name: "Citit", days: [0, 1, 2, 3, 4, 5, 6], diff: 2, createdAt: "2026-10-01" };
const log = Object.fromEntries(["01", "02", "03", "04", "05", "10"].map((d) => [`2026-10-${d}`, { h1: 1 }]));
const state = {
  habits: [habit],
  log,
  todos: [{ id: "t1", title: "x", done: true, doneOn: "2026-10-03", date: "2026-10-03" }],
  meta: { start: "2026-10-01" },
  profile: { nick: "Ana" },
  focusSessions: [{ id: "f1", start: at("2026-10-12", 17), end: at("2026-10-12", 18), work: 1800 }],
  schoolPlanner: {
    sessions: [
      { id: "s1", subject: "Mate", day: "2026-10-05", minutes: 45 },
      { id: "s2", subject: "Mate", day: "2026-10-06", minutes: 30 },
      { id: "s3", subject: "Istorie", day: "2026-09-30", minutes: 99 },
    ],
    exams: [{ id: "e1", title: "Test mate", subject: "Mate", date: "2026-10-08", done: true }, { id: "e2", title: "Test fizica", date: "2026-10-28", done: false }],
    assignments: [{ id: "a1", title: "Referat", due: "2026-10-15", done: true }, { id: "a2", title: "Fisa", due: "2026-10-18", done: false }],
  },
};
const days = buildStats(state, today).days;

test("monthBounds and shiftMonth handle month and year ends", () => {
  assert.deepEqual(monthBounds("2026-02"), { first: "2026-02-01", last: "2026-02-28" });
  assert.deepEqual(monthBounds("2026-12"), { first: "2026-12-01", last: "2026-12-31" });
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-10", 0), "2026-10");
});

test("monthReport adds up the month: days, habits, study with Focus, exams and assignments", () => {
  const r = monthReport(state, days, "2026-10", today);
  assert.equal(r.empty, false);
  assert.equal(r.from, "2026-10-01");
  assert.equal(r.to, today); // the month is still running
  assert.equal(r.elapsed, 20);
  assert.equal(r.activeDays, 8); // 1-5, 10, 12 (Focus) and the 6th (study only)
  assert.equal(r.bestRun, 6); // 1-6, the 6th by study alone
  assert.equal(r.todosDone, 1);
  assert.equal(r.study.logged, 75); // the 99 of September stays out
  assert.equal(r.study.focus, 30);
  assert.equal(r.study.total, 105);
  assert.equal(r.study.days, 3);
  assert.deepEqual(r.study.bySubject, [{ subject: "Mate", minutes: 75 }]);
  assert.equal(r.focusCount, 1);
  assert.deepEqual(r.habits.map((h) => [h.name, h.ticks]), [["Citit", 6]]);
  assert.equal(r.habits[0].scheduled, 19); // 1-19, today is still open and not ticked
  assert.ok(Math.abs(r.habits[0].rate - 6 / 19) < 1e-9);
  assert.deepEqual(r.exams.map((e) => [e.title, e.done, e.past]), [["Test mate", true, true], ["Test fizica", false, false]]);
  assert.deepEqual(r.assignments, { due: 2, done: 1 });
  assert.equal(r.momentumEnd, days[days.length - 1].momentum); // lapsed days since the 12th brought it back to zero
  assert.ok(r.momentumPeak > 0);
});

test("monthReport: the previous month, a month before the data and a future month", () => {
  const sep = monthReport(state, days, "2026-09", today);
  assert.equal(sep.activeDays, 1); // only the study block of 30 September; the timeline starts on 1 October
  assert.equal(sep.study.logged, 99); // study blocks do not depend on the timeline
  assert.equal(sep.empty, false);
  assert.equal(monthReport(state, days, "2026-11", today).empty, true);
  assert.equal(monthReport(state, [], "2026-10", today).empty, true);
  assert.equal(monthReport({}, days, "2026-10", today).habits.length, 0);
});
