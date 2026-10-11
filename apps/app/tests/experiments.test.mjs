import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTORS, analyzeExperiment, designExperiment, isDue } from "../src/lib/experiments.js";
import { addDays, weekday } from "../src/lib/dates.js";

const START = "2026-09-07"; // a Monday
const END = addDays(START, 13);
const AFTER = addDays(END, 1);
const habit = { id: "h1", days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-01-01" };
const base = { habits: [habit], log: {} };
const design = (seed, state = base) => designExperiment(state, { habitId: "h1", factor: "if_then", startDay: START, seed });

test("factors carry Romanian labels and an instruction", () => {
  for (const f of Object.values(FACTORS)) assert.ok(f.id && f.armA && f.armB && f.instruction);
});

test("balanced, no arm repeats more than 3 days in a row (50 seeds)", () => {
  for (let seed = 0; seed < 50; seed++) {
    const exp = design(seed);
    const days = Object.keys(exp.assignments).sort();
    assert.equal(days.length, 14);
    const arms = days.map((d) => exp.assignments[d]);
    const a = arms.filter((x) => x === "A").length;
    assert.ok(Math.abs(a - (arms.length - a)) <= 1);
    let run = 1;
    for (let i = 1; i < arms.length; i++) {
      run = arms[i] === arms[i - 1] ? run + 1 : 1;
      assert.ok(run <= 3, `seed ${seed}`);
    }
  }
});

test("only scheduled days are assigned; odd counts stay balanced", () => {
  const h = { ...habit, days: [1, 3, 5, 6] }; // Mon Wed Fri Sat -> 8 days in 14
  const exp = design(7, { habits: [h], log: {} });
  assert.equal(Object.keys(exp.assignments).length, 8);
  for (const d of Object.keys(exp.assignments)) assert.ok(h.days.includes(weekday(d)));
  const h2 = { ...habit, days: [1, 2, 3, 4, 5, 6] }; // 12 days
  assert.equal(Object.keys(design(1, { habits: [h2], log: {} }).assignments).length, 12);
  const h3 = { ...habit, days: [1, 2, 3, 4, 5], createdAt: "2026-09-09" }; // created Wed: 8 days
  const e3 = design(1, { habits: [h3], log: {} });
  const arms = Object.values(e3.assignments);
  assert.equal(arms.length, 8);
  assert.ok(Math.abs(arms.filter((x) => x === "A").length - arms.filter((x) => x === "B").length) <= 1);
});

test("deterministic per seed, different across seeds", () => {
  assert.deepEqual(design(42), design(42));
  assert.notDeepEqual(design(1).assignments, design(2).assignments);
});

test("too few scheduled days or unknown habit -> error", () => {
  const h = { ...habit, days: [1, 4] }; // 4 days in 14
  assert.deepEqual(design(1, { habits: [h], log: {} }), { error: "too_few_days" });
  assert.deepEqual(designExperiment(base, { habitId: "nope", factor: "if_then", startDay: START, seed: 1 }), {
    error: "too_few_days",
  });
});

// exact planted counts: the first round(rate * n) days of each arm are done
function planted(exp, rateA, rateB) {
  const log = {};
  const seen = { A: 0, B: 0 };
  const n = { A: 0, B: 0 };
  for (const arm of Object.values(exp.assignments)) n[arm]++;
  for (const d of Object.keys(exp.assignments).sort()) {
    const arm = exp.assignments[d];
    const rate = arm === "A" ? rateA : rateB;
    if (seen[arm]++ < Math.round(rate * n[arm])) log[d] = { h1: 1 };
  }
  return { habits: [habit], log };
}

// random log with a given done probability per arm (own PRNG, independent of the design's)
function randomLog(exp, pA, pB, seed) {
  let s = seed * 7919 + 13;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const log = {};
  for (const d of Object.keys(exp.assignments).sort()) if (rnd() < (exp.assignments[d] === "A" ? pA : pB)) log[d] = { h1: 1 };
  return { habits: [habit], log };
}

test("planted effect (A 20%, B 90%): B_better in at least 60% of 30 seeds", () => {
  let hits = 0;
  for (let seed = 0; seed < 30; seed++) {
    const exp = design(seed);
    if (analyzeExperiment(exp, randomLog(exp, 0.2, 0.9, seed), AFTER).verdict === "B_better") hits++;
  }
  assert.ok(hits >= 18, `B_better in ${hits}/30`);
});

// Honest power check: 7 vs 7 days is too small to find 40% vs 90% reliably (about 40% of the time),
// and it must never point the wrong way. The thresholds are deliberately not tuned to hide this.
test("planted effect (A 40%, B 90%): detected sometimes, never reversed", () => {
  let hits = 0;
  let wrong = 0;
  for (let seed = 0; seed < 200; seed++) {
    const exp = design(seed);
    const v = analyzeExperiment(exp, randomLog(exp, 0.4, 0.9, seed), AFTER).verdict;
    if (v === "B_better") hits++;
    if (v === "A_better") wrong++;
  }
  assert.ok(hits / 200 >= 0.25 && hits / 200 <= 0.65, `power ${hits / 200}`);
  assert.equal(wrong, 0);
});

test("null effect (50% vs 50%): not called A/B_better in at least 90% of 30 seeds", () => {
  let clean = 0;
  for (let seed = 0; seed < 30; seed++) {
    const exp = design(seed);
    const v = analyzeExperiment(exp, randomLog(exp, 0.5, 0.5, seed), AFTER).verdict;
    if (v !== "A_better" && v !== "B_better") clean++;
  }
  assert.ok(clean >= 27, `clean in ${clean}/30`);
});

test("running until the end day passes; open days are not counted", () => {
  const exp = design(3);
  const state = randomLog(exp, 1, 1, 1);
  const mid = addDays(START, 7);
  const r = analyzeExperiment(exp, state, mid);
  assert.equal(r.verdict, "running");
  assert.equal(r.nA + r.nB, 7);
  assert.equal(r.daysLeft, 7);
  assert.ok(!isDue(exp, END));
  assert.ok(isDue(exp, AFTER));
  assert.equal(analyzeExperiment(exp, state, AFTER).daysLeft, 0);
});

test("insufficient when an arm has fewer than 5 observed days", () => {
  const exp = design(5);
  const short = { ...exp, assignments: Object.fromEntries(Object.entries(exp.assignments).slice(0, 7)) };
  const r = analyzeExperiment(short, planted(exp, 0.5, 0.5), AFTER);
  assert.equal(r.verdict, "insufficient");
});

test("a clear difference gets an interval above 0; identical arms give no clear difference", () => {
  const exp = design(11);
  const r = analyzeExperiment(exp, planted(exp, 0, 1), AFTER);
  assert.equal(r.verdict, "B_better");
  assert.ok(r.ci[0] > 0 && r.ci[1] <= 1 && r.p < 0.01);
  const same = analyzeExperiment(exp, planted(exp, 0.5, 0.5), AFTER);
  assert.equal(same.verdict, "no_clear_difference");
  assert.ok(same.ci[0] < 0 && same.ci[1] > 0);
});
