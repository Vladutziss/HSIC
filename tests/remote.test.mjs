import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, diff, diffMonth, fromRows, monthRange, monthToRows, rowsToMonth, toRows } from "../src/lib/remote.js";
import { computeTimeline } from "../src/lib/engine.js";
import { seedDemo, stripDemo } from "../src/lib/demo.js";
import { CATALOG, habitFromCatalog } from "../src/lib/catalog.js";

const UID = "00000000-0000-0000-0000-000000000001";
const TODAY = "2026-10-05";

function newState() {
  const habits = [];
  for (const item of CATALOG.slice(0, 3)) habits.push(habitFromCatalog(item, habits, TODAY));
  return {
    v: 2,
    profile: { nick: "Vlad", path: "sport", goal: "Mai multă disciplină" },
    companion: { name: "Ecou" },
    habits,
    log: {},
    reviews: {},
    todos: [],
    streak: { revived: {} },
    settings: { reviewTime: "21:00", autoReview: true, resetAfter: 3 },
    meta: { start: TODAY, created: "2026-10-05T08:00:00.000Z", months: [] },
    groups: [],
    seen: null,
    moments: [],
  };
}

// null/undefined and a missing `ai` flag vs ai:false mean the same to the app
const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v === null || (k === "ai" && v === false) ? undefined : v)));

/** What Postgres would hand back: the state rows plus the month rows, with day_reviews merged by day. */
function database(state, months) {
  const rows = toRows(state, UID);
  const byDay = new Map(rows.day_reviews.map((r) => [r.day, { ...r }]));
  const monthRows = Object.values(months).map((doc) => monthToRows(doc, UID));
  for (const m of monthRows) for (const r of m.day_reviews) byDay.set(r.day, { ...(byDay.get(r.day) || {}), ...r });
  const day_reviews = [...byDay.values()].map((r) => ({ ai_score: null, at: null, summary: null, highlight: null, tip: null, ai: false, demo: false, ...r }));
  return {
    state: { ...rows, profile: { ...rows.profile, id: UID }, day_reviews },
    month: { proofs: monthRows.flatMap((m) => m.proofs), chapters: monthRows.flatMap((m) => m.chapters), day_reviews },
  };
}

test("round trip of a demo player keeps every derived number", () => {
  const seeded = seedDemo(newState(), TODAY);
  const db = database(seeded.state, seeded.months);
  const back = fromRows({ ...db.state, groups: [] });
  assert.deepEqual(norm(back), norm(seeded.state));
  assert.deepEqual(computeTimeline(back, TODAY).current, computeTimeline(seeded.state, TODAY).current);
});

test("month documents round trip through proofs, chapters and review text", () => {
  const seeded = seedDemo(newState(), TODAY);
  const db = database(seeded.state, seeded.months);
  for (const [ym, doc] of Object.entries(seeded.months)) {
    const [from, to] = monthRange(ym);
    const slice = (rows) => rows.filter((r) => r.day >= from && r.day < to);
    const back = rowsToMonth({ proofs: slice(db.month.proofs), chapters: slice(db.month.chapters), day_reviews: slice(db.month.day_reviews) });
    assert.deepEqual(norm(back.proofs), norm(doc.proofs));
    for (const [day, r] of Object.entries(doc.reviews)) assert.deepEqual(norm(back.reviews[day]), norm({ ...r, score: seeded.state.reviews[day].ai }));
  }
});

test("a fresh account has no state until onboarding", () => {
  assert.equal(fromRows({ profile: { id: UID, onboarded: false } }), null);
  assert.equal(fromRows({ profile: null }), null);
});

test("diff writes only what changed", () => {
  const prev = newState();
  const habitId = prev.habits[0].id;
  assert.deepEqual(diff(prev, structuredClone(prev), UID), []);

  const checked = structuredClone(prev);
  checked.log[TODAY] = { [habitId]: 1 };
  assert.deepEqual(diff(prev, checked, UID), [
    { op: "upsert", table: "completions", rows: [{ user_id: UID, habit_id: habitId, day: TODAY, code: 1 }], onConflict: "habit_id,day" },
  ]);

  const unchecked = structuredClone(checked);
  delete unchecked.log[TODAY];
  assert.deepEqual(diff(checked, unchecked, UID), [{ op: "delete", table: "completions", match: { habit_id: habitId, day: [TODAY] } }]);

  const renamed = structuredClone(prev);
  renamed.companion = { name: "Spark" };
  const ops = diff(prev, renamed, UID);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "update");
  assert.equal(ops[0].table, "profiles");
});

test("diff orders habits before the rows that reference them", () => {
  const next = newState();
  const habitId = next.habits[0].id;
  next.log[TODAY] = { [habitId]: 2 };
  const tables = diff(null, next, UID).map((o) => o.table);
  assert.ok(tables.indexOf("habits") < tables.indexOf("completions"));
});

test("log entries of a habit that does not exist are not sent", () => {
  const s = newState();
  s.log[TODAY] = { ghost: 1 };
  assert.deepEqual(toRows(s, UID).completions, []);
});

test("emptying the state clears the profile and deletes its rows", () => {
  const prev = newState();
  prev.todos = [{ id: "t1", title: "x", date: TODAY, time: null, dur: 30, done: false, doneOn: null, createdAt: TODAY }];
  const ops = diff(prev, null, UID);
  assert.equal(ops[0].table, "profiles");
  assert.equal(ops[0].row.onboarded, false);
  assert.ok(ops.some((o) => o.op === "delete" && o.table === "todos"));
  assert.equal(ops.at(-1).table, "habits"); // habits last: completions go first
});

test("month diff: new proof is one upsert, removing demo data is deletes", () => {
  const seeded = seedDemo(newState(), TODAY);
  const [ym, doc] = Object.entries(seeded.months)[0];
  const next = { ...doc, proofs: [...doc.proofs, { id: "p-new", day: TODAY, habitId: seeded.state.habits[0].id, type: "note", note: "ok", verdict: "self", at: `${TODAY}T10:00:00Z` }] };
  const ops = diffMonth(doc, next, UID);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].table, "proofs");
  assert.equal(ops[0].rows[0].id, "p-new");

  const stripped = stripDemo(structuredClone(seeded.state), structuredClone(seeded.months), TODAY);
  const strip = diffMonth(doc, stripped.months[ym], UID);
  assert.ok(strip.some((o) => o.op === "delete" && o.table === "proofs"));
});

test("a review text removed from a month clears the text columns instead of deleting the score row", () => {
  const doc = { proofs: [], chapters: [], reviews: { "2026-10-04": { summary: "s", highlight: "h", tip: "t", ai: true } } };
  const ops = diffMonth(doc, { ...doc, reviews: {} }, UID);
  assert.deepEqual(ops, [
    { op: "upsert", table: "day_reviews", rows: [{ user_id: UID, day: "2026-10-04", summary: null, highlight: null, tip: null, ai: false, demo: false }], onConflict: "user_id,day" },
  ]);
});

test("monthRange handles December", () => {
  assert.deepEqual(monthRange("2026-12"), ["2026-12-01", "2027-01-01"]);
  assert.deepEqual(monthRange("2026-02"), ["2026-02-01", "2026-03-01"]);
});

test("applyOps maps ops onto the supabase-js query builder", async () => {
  const calls = [];
  const chain = (name) => {
    const q = {
      upsert: (rows, o) => (calls.push([name, "upsert", rows.length, o.onConflict]), q),
      update: (row) => (calls.push([name, "update", Object.keys(row).length]), q),
      delete: () => (calls.push([name, "delete"]), q),
      match: (m) => (calls.push([name, "match", m]), q),
      eq: (c, v) => (calls.push([name, "eq", c, v]), q),
      in: (c, v) => (calls.push([name, "in", c, v]), q),
      then: (ok) => ok({ error: null }),
    };
    return q;
  };
  await applyOps({ from: chain }, [
    { op: "upsert", table: "todos", rows: [{ id: "a" }], onConflict: "id" },
    { op: "delete", table: "completions", match: { habit_id: "h", day: ["d1", "d2"] } },
  ]);
  assert.deepEqual(calls, [
    ["todos", "upsert", 1, "id"],
    ["completions", "delete"],
    ["completions", "eq", "habit_id", "h"],
    ["completions", "in", "day", ["d1", "d2"]],
  ]);
});
