import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt12 } from "../src/lib/dates.js";
import { computeTimeline } from "../src/lib/engine.js";
import { fromRows, toRows } from "../src/lib/remote.js";
import { firstOccurrence, makeRepeat, occursOn, repeatLabel, todosByDay, todosForToday, toggleDone } from "../src/lib/todos.js";

// 2026-10-05 is a Monday
const series = (kind, picked, until = null, extra = {}) => ({
  id: "t1",
  title: "Alergare ușoară",
  date: "2026-10-05",
  time: "07:30",
  dur: 30,
  done: false,
  doneOn: null,
  repeat: makeRepeat(kind, "2026-10-05", picked, until),
  doneDays: [],
  ...extra,
});

test("a series occurs on its days, from its first day until its end", () => {
  const daily = series("daily");
  assert.ok(occursOn(daily, "2026-10-05") && occursOn(daily, "2026-12-31"));
  assert.ok(!occursOn(daily, "2026-10-04"), "not before the first day");

  const weekly = series("weekly"); // starts on a Monday
  assert.deepEqual(weekly.repeat.days, [1]);
  assert.ok(occursOn(weekly, "2026-10-12") && !occursOn(weekly, "2026-10-13"));

  const picked = series("days", [5, 1, 3], "2026-10-14");
  assert.deepEqual(picked.repeat.days, [1, 3, 5]);
  assert.ok(occursOn(picked, "2026-10-07") && !occursOn(picked, "2026-10-08"));
  assert.ok(occursOn(picked, "2026-10-14") && !occursOn(picked, "2026-10-16"), "stops after the end date");

  assert.equal(makeRepeat("days", "2026-10-05", []), null, "no days picked means no repeat");
  assert.equal(makeRepeat("none", "2026-10-05", []), null);
  assert.equal(makeRepeat("daily", "2026-10-05", [], "2026-10-01").until, null, "an end before the start is ignored");
});

test("each occurrence is ticked on its own", () => {
  let t = series("daily");
  t = toggleDone(t, "2026-10-06");
  assert.deepEqual(t.doneDays, ["2026-10-06"]);
  const byDay = todosByDay([t], "2026-10-05", "2026-10-07");
  assert.equal(byDay["2026-10-05"][0].done, false);
  assert.equal(byDay["2026-10-06"][0].done, true);
  assert.equal(byDay["2026-10-06"][0].viewDay, "2026-10-06");
  assert.equal(toggleDone(t, "2026-10-06").doneDays.length, 0, "ticking again clears it");

  const single = { id: "s", title: "x", date: "2026-10-05", done: false, doneOn: null };
  assert.deepEqual(toggleDone(single, "2026-10-05"), { ...single, done: true, doneOn: "2026-10-05" });
});

test("today's list has the series occurrence and never marks it overdue", () => {
  const t = series("daily");
  const list = todosForToday([t], "2026-10-09");
  assert.equal(list.length, 1);
  assert.equal(list[0].date, "2026-10-09");
  assert.equal(todosForToday([series("weekly")], "2026-10-09").length, 0, "a Monday series does not show on Friday");
  assert.equal(firstOccurrence(series("weekly"), "2026-10-06", "2026-10-20"), "2026-10-12");
});

test("ticked occurrences count towards momentum, once per day", () => {
  const t = series("daily", [], null, { doneDays: ["2026-10-06", "2026-10-07"] });
  const state = { meta: { start: "2026-10-05" }, habits: [], log: {}, reviews: {}, todos: [t] };
  const tl = computeTimeline(state, "2026-10-08");
  assert.equal(tl.byDay["2026-10-05"].todos, 0);
  assert.equal(tl.byDay["2026-10-06"].todos, 1);
  assert.equal(tl.byDay["2026-10-07"].todos, 1);
});

test("a series survives the database round trip", () => {
  const t = series("days", [1, 3], "2026-12-01", { doneDays: ["2026-10-07"] });
  const plain = { id: "s", title: "x", date: "2026-10-05", time: null, dur: 30, done: true, doneOn: "2026-10-05" };
  const state = { profile: { nick: "a", path: "sport" }, habits: [], log: {}, reviews: {}, todos: [t, plain], meta: { start: "2026-10-05" } };
  const rows = toRows(state, "u1");
  const back = fromRows({ profile: { ...rows.profile, onboarded: true }, todos: rows.todos });
  const got = back.todos.find((x) => x.id === "t1");
  assert.deepEqual(got.repeat, t.repeat);
  assert.deepEqual(got.doneDays, ["2026-10-07"]);
  assert.equal(back.todos.find((x) => x.id === "s").repeat, undefined);
});

test("labels and 12-hour times", () => {
  assert.equal(repeatLabel(series("daily").repeat), "Zilnic");
  assert.equal(repeatLabel(series("weekly").repeat), "În fiecare luni");
  assert.equal(repeatLabel(series("days", [5, 1]).repeat), "L V");
  assert.equal(fmt12("00:05"), "12:05 AM");
  assert.equal(fmt12("12:00"), "12:00 PM");
  assert.equal(fmt12("16:25"), "4:25 PM");
  assert.equal(fmt12("23:30"), "11:30 PM");
  assert.equal(fmt12(null), "");
});
