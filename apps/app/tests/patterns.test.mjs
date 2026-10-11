import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePatterns } from "../src/lib/patterns.js";
import { addDays, dayRange, weekday } from "../src/lib/dates.js";

const TODAY = "2026-10-11";
const FROM = addDays(TODAY, -56);
const DAYS = dayRange(FROM, addDays(TODAY, -1));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const habit = (id, createdAt = "2026-01-01") => ({ id, name: id, diff: 1, days: [0, 1, 2, 3, 4, 5, 6], createdAt });
const stateOf = (habits, log = {}) => ({ habits, log, reviews: {}, todos: [] });
const mark = (log, day, id) => ((log[day] ||= {})[id] = 1);

test("planted weekday effect is found with weekday and direction", () => {
  const rnd = mulberry32(7);
  const log = {};
  for (const d of DAYS) if (rnd() < (weekday(d) === 3 ? 0.1 : 0.95)) mark(log, d, "run");
  const r = analyzePatterns(stateOf([habit("run")], log), TODAY);
  const f = r.findings.find((x) => x.kind === "weekday");
  assert.ok(f, "weekday finding expected");
  assert.equal(f.params.weekday, 3);
  assert.equal(f.params.direction, "lower");
  assert.ok(f.diff < -0.5 && f.pAdj <= 0.1);
});

test("planted lag effect is found", () => {
  const rnd = mulberry32(11);
  const log = {};
  let prevX = false;
  for (const d of DAYS) {
    const x = rnd() < 0.5;
    if (x) mark(log, d, "x");
    if (rnd() < (prevX ? 0.9 : 0.3)) mark(log, d, "y");
    prevX = x;
  }
  const r = analyzePatterns(stateOf([habit("x"), habit("y")], log), TODAY);
  const f = r.findings.find((x) => x.kind === "cross_habit_lag" && x.otherHabitId === "x" && x.habitId === "y");
  assert.ok(f, "lag finding expected");
  assert.ok(f.rateA > 0.7 && f.rateB < 0.5 && f.params.lag === 1);
});

test("pure noise keeps false positives under control", () => {
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rnd = mulberry32(seed * 101);
    const log = {};
    const ids = ["a", "b", "c", "d"];
    for (const d of DAYS) for (const id of ids) if (rnd() < 0.6) mark(log, d, id);
    total += analyzePatterns(stateOf(ids.map((i) => habit(i)), log), TODAY).findings.length;
  }
  assert.ok(total <= 3, `too many false positives: ${total}`);
});

test("too little data yields no findings and a reason", () => {
  const log = {};
  for (const d of DAYS.slice(-10)) mark(log, d, "a");
  const r = analyzePatterns(stateOf([habit("a", addDays(TODAY, -10))], log), TODAY);
  assert.equal(r.findings.length, 0);
  assert.ok(r.insufficient.length > 0 && r.insufficient[0].reason);
});

test("deterministic and JSON-safe", () => {
  const rnd = mulberry32(5);
  const log = {};
  for (const d of DAYS) for (const id of ["a", "b"]) if (rnd() < (weekday(d) === 1 && id === "a" ? 0.1 : 0.9)) mark(log, d, id);
  const s = stateOf([habit("a"), habit("b")], log);
  const r1 = analyzePatterns(s, TODAY);
  assert.ok(r1.findings.length > 0);
  assert.deepEqual(analyzePatterns(s, TODAY), r1);
  assert.deepEqual(JSON.parse(JSON.stringify(r1)), r1);
});
