// Pattern discovery over one player's habit log. Pure and deterministic: the LLM
// agent only narrates what this returns, it never "finds" patterns itself.
//
// Three hypothesis families, all two-group comparisons of a proportion:
//   weekday         habit completion on weekday W vs the other scheduled weekdays
//   cross_habit_lag Y done the day after X done vs after X scheduled-but-skipped
//   miss_dynamics   P(miss | previous scheduled day missed) vs P(miss | previous done)
//
// Statistics: Wilson intervals per proportion, Newcombe interval for the difference,
// exact two-sided Fisher test (deterministic, no sampling), Benjamini-Hochberg across
// every hypothesis that was actually tested in the run (pAdj).
//
// Multiple-comparison control: at most MAX_HABITS habits are analysed (the first six
// eligible, in state order), so the family is <= 6*7 weekday + 6*5 lag + 6 miss tests.
//
// A finding is reported only if n >= MIN_N in both groups AND pAdj <= MAX_PADJ AND
// |diff| >= MIN_DIFF. Strength: strong = pAdj <= .01 and |diff| >= .40;
// moderate = pAdj <= .05 and |diff| >= .25; otherwise weak.
// Anything untestable goes to `insufficient` with a reason, never silently dropped.
import { addDays, dayRange, weekday } from "./dates.js";
import { isScheduled } from "./engine.js";

const MAX_HABITS = 6;
const MIN_SCHEDULED = 14;
const MIN_N = 8;
const MAX_PADJ = 0.1;
const MIN_DIFF = 0.15;
const Z = 1.96;

const round = (x) => Math.round(x * 10000) / 10000;

function wilson(k, n) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (Z * Z) / n;
  const c = (p + (Z * Z) / (2 * n)) / d;
  const h = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Newcombe CI for p1 - p2 from the two Wilson intervals. */
function diffCi(k1, n1, k2, n2) {
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const [l1, u1] = wilson(k1, n1);
  const [l2, u2] = wilson(k2, n2);
  const d = p1 - p2;
  return [d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
}

/** Exact two-sided Fisher test on [[a, n1-a], [b, n2-b]]. */
function fisher(a, n1, b, n2) {
  const k = a + b;
  const N = n1 + n2;
  const lf = [0];
  for (let i = 1; i <= N; i++) lf[i] = lf[i - 1] + Math.log(i);
  const logP = (x) => lf[n1] + lf[n2] + lf[k] + lf[N - k] - lf[N] - lf[x] - lf[n1 - x] - lf[k - x] - lf[n2 - k + x];
  const obs = logP(a);
  let p = 0;
  for (let x = Math.max(0, k - n2); x <= Math.min(n1, k); x++) {
    const lp = logP(x);
    if (lp <= obs + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** A two-group test, or an `insufficient` entry when a group is too small. */
function test(kind, habitId, otherHabitId, params, a, b, out) {
  // a, b = {k: successes, n: trials}; the outcome is "success" in each group.
  const base = { kind, habitId, ...(otherHabitId ? { otherHabitId } : {}) };
  if (a.n < MIN_N || b.n < MIN_N) {
    out.insufficient.push({ ...base, reason: `needs >= ${MIN_N} observations per group, got ${a.n} and ${b.n}`, params });
    return;
  }
  const diff = a.k / a.n - b.k / b.n;
  out.tests.push({
    ...base,
    n: { a: a.n, b: b.n },
    rateA: round(a.k / a.n),
    rateB: round(b.k / b.n),
    diff: round(diff),
    ci: diffCi(a.k, a.n, b.k, b.n).map(round),
    p: fisher(a.k, a.n, b.k, b.n),
    params: { ...params, ciA: wilson(a.k, a.n).map(round), ciB: wilson(b.k, b.n).map(round) },
  });
}

/** Benjamini-Hochberg adjusted p-values, same order as the input. */
function bh(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => i).sort((i, j) => ps[i] - ps[j] || i - j);
  const adj = new Array(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    min = Math.min(min, (ps[order[r]] * m) / (r + 1));
    adj[order[r]] = min;
  }
  return adj;
}

const strengthOf = (pAdj, diff) => {
  const d = Math.abs(diff);
  if (pAdj <= 0.01 && d >= 0.4) return "strong";
  if (pAdj <= 0.05 && d >= 0.25) return "moderate";
  return "weak";
};

export function analyzePatterns(state, today, opts = {}) {
  const days = opts.days || 56;
  const from = addDays(today, -days);
  const to = addDays(today, -1);
  const window = dayRange(from, to);
  const log = state.log || {};
  const done = (h, d) => !!log[d]?.[h.id];
  const out = { tests: [], insufficient: [] };

  const habits = [];
  for (const h of state.habits || []) {
    const sched = window.filter((d) => isScheduled(h, d));
    if (sched.length < MIN_SCHEDULED) {
      out.insufficient.push({ kind: "habit", habitId: h.id, reason: `only ${sched.length} scheduled days in the window, needs >= ${MIN_SCHEDULED}` });
    } else if (habits.length >= MAX_HABITS) {
      out.insufficient.push({ kind: "habit", habitId: h.id, reason: `over the cap of ${MAX_HABITS} analysed habits` });
    } else habits.push({ h, sched });
  }

  for (const { h, sched } of habits) {
    // 1. weekday
    for (const w of [...new Set(sched.map(weekday))].sort()) {
      const g = { a: { k: 0, n: 0 }, b: { k: 0, n: 0 } };
      for (const d of sched) {
        const grp = weekday(d) === w ? g.a : g.b;
        grp.n++;
        if (done(h, d)) grp.k++;
      }
      test("weekday", h.id, null, { weekday: w }, g.a, g.b, out);
    }

    // 3. miss dynamics (over consecutive scheduled days; outcome = miss)
    const afterMiss = { k: 0, n: 0 };
    const afterDone = { k: 0, n: 0 };
    for (let i = 1; i < sched.length; i++) {
      const g = done(h, sched[i - 1]) ? afterDone : afterMiss;
      g.n++;
      if (!done(h, sched[i])) g.k++;
    }
    const recover = [];
    for (let i = 0; i < sched.length; i++) {
      if (done(h, sched[i]) || (i > 0 && !done(h, sched[i - 1]))) continue; // not a streak start
      let j = i;
      while (j < sched.length && !done(h, sched[j])) j++;
      if (j < sched.length) recover.push((Date.parse(sched[j]) - Date.parse(sched[i])) / 86400000);
    }
    const meanDaysToRecover = recover.length ? round(recover.reduce((s, x) => s + x, 0) / recover.length) : null;
    test("miss_dynamics", h.id, null, { outcome: "miss", meanDaysToRecover, streaks: recover.length }, afterMiss, afterDone, out);
  }

  // 2. cross-habit lag 1: Y done on d+1 given X scheduled on d (done vs not done)
  for (const { h: x, sched } of habits) {
    for (const { h: y } of habits) {
      if (x.id === y.id) continue;
      const g = { a: { k: 0, n: 0 }, b: { k: 0, n: 0 } };
      for (const d of sched) {
        const next = addDays(d, 1);
        if (next > to || !isScheduled(y, next)) continue;
        const grp = done(x, d) ? g.a : g.b;
        grp.n++;
        if (done(y, next)) grp.k++;
      }
      test("cross_habit_lag", y.id, x.id, { lag: 1, trigger: "done_vs_skipped" }, g.a, g.b, out);
    }
  }

  const adj = bh(out.tests.map((t) => t.p));
  const findings = [];
  out.tests.forEach((t, i) => {
    const pAdj = adj[i];
    if (pAdj > MAX_PADJ || Math.abs(t.diff) < MIN_DIFF) return;
    const { p, ...rest } = t;
    findings.push({
      id: [t.kind, t.habitId, t.otherHabitId, t.params.weekday].filter((v) => v !== undefined && v !== null).join(":"),
      ...rest,
      p: round(p),
      pAdj: round(pAdj),
      strength: strengthOf(pAdj, t.diff),
      params: { ...t.params, direction: t.diff < 0 ? "lower" : "higher" },
    });
  });
  findings.sort((a, b) => a.pAdj - b.pAdj || Math.abs(b.diff) - Math.abs(a.diff) || (a.id < b.id ? -1 : 1));

  return {
    window: { from, to, days },
    tested: out.tests.length,
    findings,
    insufficient: out.insufficient,
  };
}
