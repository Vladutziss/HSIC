// Closing the coach loop: two weeks after the player accepted a change to a habit, compare their
// completion rate before and after. Pure and deterministic: everything comes from the arguments.
//
// This is a before/after comparison on one person. It cannot separate the change from regression to
// the mean, exams, seasons, a new job... so every measurement carries `caveat: 'before_after'` and the
// result must never be presented as a proven effect of the change.

import { addDays, dayRange } from "./dates.js";
import { isScheduled } from "./engine.js";
import { withObservedStart } from "./history.js";

export const OUTCOME_DAYS = 14;
const BEFORE_DAYS = 28;
const MIN_SCHEDULED = 8; // fewer scheduled days than this in either window -> 'insufficient'
const ALPHA = 0.1; // exact two-sided Fisher p threshold
const MIN_DIFF = 0.15; // and the absolute difference in rate must be at least this
const HABIT_KINDS = new Set(["change_habit", "add_habit", "start_experiment"]);

/** 'YYYY-MM-DD' two weeks after the day the action was decided. */
export const outcomeDueDate = (decidedDay) => addDays(decidedDay, OUTCOME_DAYS);

// decided_at is an ISO timestamp; its date part is the decision day.
// ponytail: UTC date of the timestamp, not the player's local day; off by one near midnight at worst.
const decidedDayOf = (a) => (typeof a?.decided_at === "string" && a.decided_at.length >= 10 ? a.decided_at.slice(0, 10) : null);

const isEmpty = (o) => o == null || (typeof o === "object" && Object.keys(o).length === 0);

/** Applied, not yet measured, and its due day (outcome_due, else decided_at + 14 days) has come. */
export function isOutcomeDue(action, today) {
  if (!action || action.status !== "applied" || !isEmpty(action.outcome)) return false;
  const decided = decidedDayOf(action);
  const due = action.outcome_due || (decided ? outcomeDueDate(decided) : null);
  return !!due && due <= today;
}

// --- statistics (small local copies; no shared private helpers) ---

const Z = 1.959964; // 95%

function wilson(k, n) {
  if (!n) return null;
  const p = k / n;
  const z2 = Z * Z;
  const d = 1 + z2 / n;
  const c = p + z2 / (2 * n);
  const m = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

// Newcombe hybrid score interval for the difference of two proportions (after - before).
function newcombe(k1, n1, k0, n0) {
  const a = wilson(k1, n1);
  const b = wilson(k0, n0);
  if (!a || !b) return null;
  const d = k1 / n1 - k0 / n0;
  const p1 = k1 / n1;
  const p0 = k0 / n0;
  return [d - Math.sqrt((p1 - a[0]) ** 2 + (b[1] - p0) ** 2), d + Math.sqrt((a[1] - p1) ** 2 + (p0 - b[0]) ** 2)];
}

function logFact(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

// Exact two-sided Fisher test on [[a, n1-a], [b, n0-b]]: sum of tables no likelier than the observed one.
function fisher(a, n1, b, n0) {
  const K = a + b;
  const N = n1 + n0;
  const lc = (n, k) => logFact(n) - logFact(k) - logFact(n - k);
  const lp = (x) => lc(n1, x) + lc(n0, K - x) - lc(N, K);
  const obs = lp(a);
  let p = 0;
  for (let x = Math.max(0, K - n0); x <= Math.min(n1, K); x++) {
    const l = lp(x);
    if (l <= obs + 1e-9) p += Math.exp(l);
  }
  return Math.min(1, p);
}

const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const roundCi = (ci) => (ci ? [round(ci[0]), round(ci[1])] : null);

function windowStats(habit, log, days) {
  let n = 0;
  let done = 0;
  let doneAny = 0;
  for (const d of days) {
    const isDone = !!log[d]?.[habit.id];
    if (isDone) doneAny++;
    if (isScheduled(habit, d)) {
      n++;
      if (isDone) done++;
    }
  }
  const calendar = days.length;
  return {
    n,
    done,
    rate: n ? round(done / n) : null,
    ci: roundCi(wilson(done, n)),
    // Fallback independent of the schedule: done days / calendar days.
    rateOnAllDays: calendar ? round(doneAny / calendar) : null,
  };
}

/**
 * Measure what happened to the habit's completion rate around the decision day.
 * before = scheduled days in the 28 days before the decision day; after = the day after the decision
 * up to yesterday (today excluded, it is still in progress).
 * "Scheduled" uses the habit's schedule as of NOW for both windows: a `change_habit` that moved the
 * days changes what counts as scheduled, so each window also reports `rateOnAllDays` (done days /
 * calendar days), which does not depend on the schedule.
 */
export function measureOutcome(action, state, today) {
  if (!HABIT_KINDS.has(action?.kind)) return { verdict: "not_applicable" };
  const habitId = action.habit_id || action.payload?.habit_id || null;
  const decidedDay = decidedDayOf(action);
  const empty = { n: 0, done: 0, rate: null, ci: null, rateOnAllDays: null };
  const base = { habitId, decidedDay, before: empty, after: empty, diff: null, ci: null, p: null, caveat: "before_after" };

  const habit = withObservedStart(state || {}).habits.find((h) => h.id === habitId);
  if (!habit || !decidedDay) return { ...base, verdict: "insufficient" };

  const log = state.log || {};
  const before = windowStats(habit, log, dayRange(addDays(decidedDay, -BEFORE_DAYS), addDays(decidedDay, -1)));
  const after = windowStats(habit, log, dayRange(addDays(decidedDay, 1), addDays(today, -1)));
  const res = { ...base, before, after };
  if (before.n < MIN_SCHEDULED || after.n < MIN_SCHEDULED) return { ...res, verdict: "insufficient" };

  const diff = after.done / after.n - before.done / before.n;
  const p = fisher(after.done, after.n, before.done, before.n);
  let verdict = "no_clear_change";
  if (p <= ALPHA && Math.abs(diff) >= MIN_DIFF) verdict = diff > 0 ? "improved" : "worse";
  return {
    ...res,
    diff: round(diff),
    ci: roundCi(newcombe(after.done, after.n, before.done, before.n)),
    p: round(p, 6),
    verdict,
  };
}

/** Counts by verdict and by kind, over actions that carry a measured outcome (`outcome.verdict`) or are measurement results. */
export function summarizeOutcomes(actions) {
  const byVerdict = {};
  const byKind = {};
  let total = 0;
  for (const a of actions || []) {
    const verdict = a?.verdict || a?.outcome?.verdict;
    if (!verdict) continue;
    total++;
    byVerdict[verdict] = (byVerdict[verdict] || 0) + 1;
    if (a.kind) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  }
  return { total, byVerdict, byKind };
}

