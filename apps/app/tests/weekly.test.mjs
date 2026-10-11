import { test } from "node:test";
import assert from "node:assert/strict";
import { planWeek } from "../../../supabase/functions/_shared/weekly-core.js";

const TODAY = "2026-10-11"; // Sunday; next week is 2026-10-12 (Mon) .. 2026-10-18 (Sun)
const habit = (id, extra = {}) => ({ id, name: `Obicei ${id}`, diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-01-01", ...extra });
const state = (habits, todos = []) => ({ habits, log: {}, reviews: {}, todos });
const wk = (habitId, weekdayN, extra = {}) => ({
  kind: "weekday", habitId, n: { a: 8, b: 40 }, rateA: 0.25, rateB: 0.85, diff: -0.6, ci: [-0.8, -0.3], pAdj: 0.004,
  strength: "strong", params: { weekday: weekdayN, direction: "lower" }, ...extra,
});
const miss = (habitId, extra = {}) => ({
  kind: "miss_dynamics", habitId, n: { a: 15, b: 30 }, rateA: 0.7, rateB: 0.3, diff: 0.4, ci: [0.1, 0.6], pAdj: 0.02,
  strength: "moderate", params: { direction: "higher" }, ...extra,
});
const plan = (o) => planWeek({ today: TODAY, state: state([habit("a")]), patterns: { findings: [] }, ...o });
const TITLE = "Mâine: Obicei a (ziua ta mai grea). Alege acum când o faci.";

test("weekday rule: one auto to-do the day before the weak weekday", () => {
  const r = plan({ patterns: { findings: [wk("a", 3)] } }); // Wednesday 14th -> Tuesday 13th
  assert.equal(r.runDay, TODAY);
  assert.equal(r.actions.length, 1);
  const a = r.actions[0];
  assert.equal(a.kind, "create_todo");
  assert.equal(a.autonomy, "auto");
  assert.deepEqual(a.payload, { title: TITLE, date: "2026-10-13", dur: 10 });
  assert.deepEqual(a.sources, ["gollwitzer-1999", "sheeran-2025"]);
});

test("weekday rule does not fire for weak strength, higher direction, or unscheduled weekday", () => {
  assert.equal(plan({ patterns: { findings: [wk("a", 3, { strength: "weak" })] } }).actions.length, 0);
  assert.equal(plan({ patterns: { findings: [wk("a", 3, { params: { weekday: 3, direction: "higher" } })] } }).actions.length, 0);
  assert.equal(plan({ state: state([habit("a", { days: [1, 2] })]), patterns: { findings: [wk("a", 3)] } }).actions.length, 0);
});

test("duplicate open to-do is skipped, a done one is not a duplicate", () => {
  const dup = plan({ state: state([habit("a")], [{ id: "t1", title: TITLE, date: "2026-10-13", done: false }]), patterns: { findings: [wk("a", 3)] } });
  assert.equal(dup.actions.length, 0);
  assert.equal(dup.skipped[0].rule, "weak_weekday_prompt");
  const done = plan({ state: state([habit("a")], [{ id: "t1", title: TITLE, date: "2026-10-13", done: true }]), patterns: { findings: [wk("a", 3)] } });
  assert.equal(done.actions.length, 1);
});

test("Monday prompt lands on today (Sunday); no date is ever in the past", () => {
  const r = plan({ patterns: { findings: [wk("a", 1), wk("a", 2), wk("a", 3)] }, maxTodos: 5, maxActions: 5 });
  assert.equal(r.actions[0].payload.date, TODAY);
  for (const a of r.actions) assert.ok(a.payload.date >= TODAY);
});

test("downshift rule: confirm change_habit with diff - 1 and same days", () => {
  const r = plan({ state: state([habit("a", { diff: 3, days: [1, 3, 5] })]), patterns: { findings: [miss("a")] } });
  const a = r.actions[0];
  assert.equal(a.kind, "change_habit");
  assert.equal(a.autonomy, "confirm");
  assert.deepEqual(a.payload, { habitId: "a", diff: 2, days: [1, 3, 5] });
  assert.deepEqual(a.sources, ["fogg-2009", "lally-2010"]);
});

test("downshift does not fire below 0.6, at diff 1, or without a gap", () => {
  assert.equal(plan({ patterns: { findings: [miss("a", { rateA: 0.55 })] } }).actions.length, 0);
  assert.equal(plan({ state: state([habit("a", { diff: 1 })]), patterns: { findings: [miss("a")] } }).actions.length, 0);
  assert.equal(plan({ patterns: { findings: [miss("a", { rateA: 0.7, rateB: 0.75, diff: -0.05 })] } }).actions.length, 0);
});

test("kind rejected twice is skipped, once is fine", () => {
  const f = { patterns: { findings: [miss("a")] } };
  const r2 = plan({ ...f, feedback: { rejectedByAction: { change_habit: 2 } } });
  assert.equal(r2.actions.length, 0);
  assert.equal(r2.skipped[0].rule, "repeat_miss_downshift");
  assert.equal(plan({ ...f, feedback: { rejectedByAction: { change_habit: 1 } } }).actions.length, 1);
});

test("active constraint note naming the habit blocks it, case-insensitively", () => {
  const r = plan({ patterns: { findings: [wk("a", 3)] }, context: [{ kind: "constraint", body: "Sunt accidentat, fără OBICEI A o lună" }] });
  assert.equal(r.actions.length, 0);
  assert.match(r.skipped[0].reason, /constrângere/);
  assert.equal(plan({ patterns: { findings: [wk("a", 3)] }, context: [{ kind: "note", body: "obicei a" }] }).actions.length, 1);
});

test("too little data: habit with < 14 scheduled days gets nothing", () => {
  const r = plan({ state: state([habit("a", { createdAt: "2026-10-01" })]), patterns: { findings: [wk("a", 3)] } });
  assert.equal(r.actions.length, 0);
  assert.match(r.skipped[0].reason, /prea puține/);
});

test("caps: maxTodos, maxActions, auto before confirm", () => {
  const hs = [habit("a"), habit("b"), habit("c"), habit("d", { diff: 3 })];
  const findings = [miss("d"), wk("a", 2), wk("b", 3), wk("c", 4)];
  const r = plan({ state: state(hs), patterns: { findings } });
  assert.deepEqual(r.actions.map((a) => a.autonomy), ["auto", "auto", "confirm"]);
  assert.equal(r.skipped.length, 1); // third to-do over maxTodos
  const r2 = plan({ state: state(hs), patterns: { findings }, maxActions: 1 });
  assert.deepEqual(r2.actions.map((a) => a.autonomy), ["auto"]);
  const r3 = plan({ state: state(hs), patterns: { findings }, maxTodos: 0 });
  assert.deepEqual(r3.actions.map((a) => a.kind), ["change_habit"]);
});

test("baseline: completion over the 28 days before today", () => {
  const l = {};
  for (let i = 1; i <= 14; i++) l[new Date(Date.UTC(2026, 9, 11 - i)).toISOString().slice(0, 10)] = { a: 1 }; // 14 of the last 28
  const r = plan({ state: { ...state([habit("a")]), log: l }, patterns: { findings: [wk("a", 3)] } });
  assert.deepEqual(r.actions[0].baseline, { rate28: 0.5, asOf: TODAY });
});

test("deterministic, JSON-safe, every action has reason, sources, baseline", () => {
  const input = { state: state([habit("a"), habit("b", { diff: 3 })]), patterns: { findings: [wk("a", 5), miss("b")] }, feedback: { rejectedByAction: {} }, context: [] };
  const r1 = plan(input);
  assert.deepEqual(r1, plan(input));
  assert.deepEqual(JSON.parse(JSON.stringify(r1)), r1);
  assert.equal(r1.actions.length, 2);
  for (const a of r1.actions) {
    assert.ok(a.reason.length > 0 && a.reason.length <= 400);
    assert.ok(a.sources.length > 0);
    assert.equal(a.baseline.asOf, TODAY);
    assert.match(a.reason, /asociație/);
  }
});
