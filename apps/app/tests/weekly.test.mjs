import { test } from "node:test";
import assert from "node:assert/strict";
import { examReminder, planWeek, streakAlert } from "../../../supabase/functions/_shared/weekly-core.js";

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

// ---- exam_recap rule
const school = (exams, sessions = []) => ({ ...state([habit("a")]), schoolPlanner: { assignments: [], exams, sessions } });
const exam = (subject, date, extra = {}) => ({ id: `e-${subject}-${date}`, subject, title: `Test ${subject}`, date, done: false, ...extra });

test("exam recap: exam in 3 days, no study this week -> confirm create_todo tomorrow, 25 min", () => {
  const r = plan({ state: school([exam("Mate", "2026-10-14")]) });
  assert.equal(r.actions.length, 1);
  const a = r.actions[0];
  assert.equal(a.kind, "create_todo");
  assert.equal(a.autonomy, "confirm");
  assert.deepEqual(a.payload, { title: "Recapitulare Mate", date: "2026-10-12", dur: 25 });
});

test("exam recap does not fire with study logged, exam beyond 7 days, past/done exam, or no subject", () => {
  const studied = school([exam("Mate", "2026-10-14")], [{ subject: "mate", day: "2026-10-08", minutes: 20 }]);
  assert.equal(plan({ state: studied }).actions.length, 0);
  const old = school([exam("Mate", "2026-10-14")], [{ subject: "Mate", day: "2026-10-04", minutes: 60 }]); // 7 days ago: outside the window
  assert.equal(plan({ state: old }).actions.length, 1);
  assert.equal(plan({ state: school([exam("Mate", "2026-10-19")]) }).actions.length, 0);
  assert.equal(plan({ state: school([exam("Mate", "2026-10-09"), exam("Fiz", "2026-10-14", { done: true })]) }).actions.length, 0);
  assert.equal(plan({ state: school([exam("", "2026-10-14")]) }).actions.length, 0);
});

test("exam recap dedupes by subject and open to-do, and respects the action cap and rejections", () => {
  const two = plan({ state: school([exam("Mate", "2026-10-14"), exam("mate", "2026-10-15")]) });
  assert.equal(two.actions.length, 1);
  const dup = plan({ state: { ...school([exam("Mate", "2026-10-14")]), todos: [{ id: "t", title: "Recapitulare Mate", date: "2026-10-12", done: false }] } });
  assert.equal(dup.actions.length, 0);
  assert.equal(dup.skipped[0].rule, "exam_recap");
  const capped = plan({ state: school([exam("Mate", "2026-10-14"), exam("Fiz", "2026-10-15")]), maxActions: 1 });
  assert.equal(capped.actions.length, 1);
  assert.equal(capped.skipped.at(-1).rule, "exam_recap");
  const rej = plan({ state: school([exam("Mate", "2026-10-14")]), feedback: { rejectedByAction: { create_todo: 2 } } });
  assert.equal(rej.actions.length, 0);
});

test("streakAlert: a 3+ day streak with nothing done today is at risk", () => {
  const days = ["2026-10-08", "2026-10-09", "2026-10-10"];
  const log = Object.fromEntries(days.map((d) => [d, { a: 1 }]));
  const st = { habits: [habit("a")], log, reviews: {}, todos: [], meta: { start: "2026-10-01" } };
  const r = streakAlert({ state: st, today: TODAY });
  assert.equal(r.streak, 3);
  assert.equal(r.habit.id, "a");
  assert.equal(streakAlert({ state: { ...st, log: { ...log, [TODAY]: { a: 1 } } }, today: TODAY }), null); // done today
  assert.equal(streakAlert({ state: { ...st, log: { "2026-10-10": { a: 1 } } }, today: TODAY }), null); // streak too short
});

test("lang en: the to-do title and the reason are written in English; the default stays Romanian", () => {
  const r = plan({ patterns: { findings: [wk("a", 3)] }, lang: "en" });
  const a = r.actions[0];
  assert.equal(a.payload.title, "Tomorrow: Obicei a (your harder day). Pick now when you will do it.");
  assert.match(a.reason, /harder on Wednesdays/);
  assert.equal(plan({ patterns: { findings: [wk("a", 3)] } }).actions[0].payload.title, TITLE);
});

const D = (n) => new Date(Date.UTC(2026, 9, 11 + n)).toISOString().slice(0, 10); // TODAY plus n days

test("examReminder: the day before always, two or three days before only without study, nearest exam only", () => {
  const sp = (exams, sessions = []) => ({ schoolPlanner: { exams, sessions } });
  const ex = (id, subject, date) => ({ id, title: `Test ${subject}`, subject, date, done: false });
  // 1 day left, nothing studied: nudge to start
  const a = examReminder({ state: sp([ex("e1", "Mate", D(1))]), today: TODAY });
  assert.equal(a.daysLeft, 1);
  assert.equal(a.studied, 0);
  assert.equal(a.title, "Mâine: Test Mate");
  assert.match(a.body, /N-ai notat studiu la Mate/);
  // 1 day left with study for that subject: still a reminder, with the minutes
  const b = examReminder({ state: sp([ex("e1", "Mate", D(1))], [{ day: D(-1), subject: "mate", minutes: 40 }, { day: D(-1), subject: "Fizică", minutes: 90 }]), today: TODAY });
  assert.equal(b.studied, 40);
  assert.match(b.body, /Ai notat 40 min/);
  // 2 days left: only when nothing was studied for the subject in the last 3 days
  assert.equal(examReminder({ state: sp([ex("e2", "Mate", D(2))]), today: TODAY }).title, "Test Mate peste 2 zile");
  assert.equal(examReminder({ state: sp([ex("e2", "Mate", D(2))], [{ day: TODAY, subject: "Mate", minutes: 25 }]), today: TODAY }), null);
  assert.equal(examReminder({ state: sp([ex("e2", "Mate", D(2))], [{ day: D(-4), subject: "Mate", minutes: 25 }]), today: TODAY }).studied, 0); // too old to count
  // too far, today, past, done
  assert.equal(examReminder({ state: sp([ex("e3", "Mate", D(4)), ex("e4", "Mate", TODAY), ex("e5", "Mate", D(-10))]), today: TODAY }), null);
  assert.equal(examReminder({ state: sp([{ ...ex("e6", "Mate", D(1)), done: true }]), today: TODAY }), null);
  assert.equal(examReminder({ state: {}, today: TODAY }), null);
  // the nearest one wins; an exam without a subject counts any study
  assert.equal(examReminder({ state: sp([ex("far", "Chimie", D(2)), ex("near", "Fizică", D(1))]), today: TODAY }).exam.id, "near");
  assert.equal(examReminder({ state: sp([{ id: "x", title: "Teză", date: D(2), done: false }], [{ day: TODAY, subject: "Orice", minutes: 20 }]), today: TODAY }), null);
});

test("examReminder in English", () => {
  const state = { schoolPlanner: { exams: [{ id: "e", title: "Math test", subject: "Math", date: D(1), done: false }], sessions: [] } };
  const r = examReminder({ state, today: TODAY, lang: "en" });
  assert.equal(r.title, "Tomorrow: Math test");
  assert.match(r.body, /You have not logged study for Math/);
});
