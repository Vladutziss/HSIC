// Single-user (n-of-1) experiments. Pure and deterministic: a 2-week test of one factor on one
// habit, days randomly assigned to arm A or B, analysed with an exact test and an interval.
// A habit log is observational; randomising days is the only honest route towards causality
// from one player's data, and even then small samples rarely settle anything.

import { addDays, dayRange } from "./dates.js";
import { isScheduled } from "./engine.js";

/** Catalog of testable factors. Arm B is always the "treatment". Labels are shown in the UI (Romanian). */
export const FACTORS = {
  if_then: {
    id: "if_then",
    label: "Plan dacă-atunci",
    armA: "Fără plan explicit",
    armB: "Cu plan dacă-atunci",
    instruction: "În zilele B, scrie dimineața un plan „Dacă [situație], atunci [fac obiceiul]”.",
  },
  easier_version: {
    id: "easier_version",
    label: "Versiune mai ușoară",
    armA: "Versiunea obișnuită",
    armB: "Versiune mai mică",
    instruction: "În zilele B, fă doar o versiune mai mică a obiceiului (câteva minute sau o repetare).",
  },
};

export const MIN_SCHEDULED_DAYS = 8;
export const MIN_PER_ARM = 5; // observed (closed) days needed in each arm for a verdict
export const MAX_P = 0.1;
export const MIN_DIFF = 0.2;
const MAX_RUN = 3;

// ---------------------------------------------------------------- seeded PRNG

function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  let h = 2166136261; // FNV-1a over the string form
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const maxRun = (arr) => {
  let best = 0;
  let run = 0;
  for (let i = 0; i < arr.length; i++) {
    run = i && arr[i] === arr[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};

// ---------------------------------------------------------------- design

/**
 * Randomised, balanced assignment of the habit's scheduled days in [startDay, startDay + days).
 * Counts of A and B differ by at most 1 and no arm repeats more than 3 days in a row.
 * @returns {{habitId, factor, startDay, endDay, assignments} | {error: 'too_few_days'}}
 */
export function designExperiment(state, { habitId, factor, startDay, days = 14, seed } = {}) {
  const habit = (state.habits || []).find((h) => h.id === habitId);
  const endDay = addDays(startDay, days - 1);
  const sched = habit ? dayRange(startDay, endDay).filter((d) => isScheduled(habit, d)) : [];
  if (sched.length < MIN_SCHEDULED_DAYS) return { error: "too_few_days" };

  const rnd = mulberry32(hashSeed(seed ?? `${habitId}|${factor}|${startDay}`));
  const n = sched.length;
  const nA = Math.floor(n / 2) + (n % 2 && rnd() < 0.5 ? 1 : 0);
  const base = [...Array(nA).fill("A"), ...Array(n - nA).fill("B")];

  let arms = null;
  for (let t = 0; t < 2000 && !arms; t++) {
    const cand = shuffle([...base], rnd);
    if (maxRun(cand) <= MAX_RUN) arms = cand;
  }
  // Practically unreachable for n >= 8; keeps the invariants if it ever happens.
  if (!arms) arms = base.map((_, i) => (Math.floor(i / 2) % 2 ? "B" : "A"));

  const assignments = {};
  sched.forEach((d, i) => (assignments[d] = arms[i]));
  return { habitId, factor, startDay, endDay, assignments };
}

/** The experiment is over once its last day has passed. */
export const isDue = (exp, today) => today > exp.endDay;

// ---------------------------------------------------------------- statistics

/** Wilson score interval for a proportion (z = 1.96). */
function wilson(x, n, z = 1.96) {
  const p = x / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Newcombe hybrid-score 95% interval for pB - pA. */
function newcombe(xA, nA, xB, nB) {
  const pA = xA / nA;
  const pB = xB / nB;
  const [lA, uA] = wilson(xA, nA);
  const [lB, uB] = wilson(xB, nB);
  const d = pB - pA;
  return [
    Math.max(-1, d - Math.sqrt((pB - lB) ** 2 + (uA - pA) ** 2)),
    Math.min(1, d + Math.sqrt((uB - pB) ** 2 + (pA - lA) ** 2)),
  ];
}

const logFact = [0];
const lf = (n) => {
  for (let i = logFact.length; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  return logFact[n];
};
const logC = (n, k) => lf(n) - lf(k) - lf(n - k);

/**
 * Exact two-sided p: permuting the A/B labels over the observed days (sizes fixed) makes the
 * number of "done" days in arm B hypergeometric, i.e. Fisher's exact test.
 */
function permutationP(xA, nA, xB, nB) {
  const N = nA + nB;
  const K = xA + xB;
  const logP = (x) => logC(nB, x) + logC(nA, K - x) - logC(N, K);
  const lo = Math.max(0, K - nA);
  const hi = Math.min(nB, K);
  const obs = logP(xB);
  let p = 0;
  for (let x = lo; x <= hi; x++) if (logP(x) <= obs + 1e-9) p += Math.exp(logP(x));
  return Math.min(1, p);
}

/**
 * Result of an experiment so far. Only assigned days already closed (day < today) count.
 * diff = rateB - rateA, ci = Newcombe 95% interval of it, p = exact permutation (Fisher) test.
 *
 * Verdict rules:
 *  - 'running': the end day has not passed yet (stats are shown, but no verdict is issued early).
 *  - 'insufficient': fewer than 5 observed days in arm A or arm B.
 *  - 'A_better' / 'B_better': p <= 0.10 AND |diff| >= 0.2 (the better arm is the one with the higher rate).
 *  - 'no_clear_difference' otherwise. This is the usual outcome of a 2-week test: the data cannot tell,
 *    and the interval says how wide the uncertainty is. It does not mean "no effect".
 */
export function analyzeExperiment(exp, state, today) {
  const log = state.log || {};
  let nA = 0;
  let nB = 0;
  let doneA = 0;
  let doneB = 0;
  let daysLeft = 0;
  for (const [day, arm] of Object.entries(exp.assignments || {})) {
    if (day >= today) {
      daysLeft++;
      continue;
    }
    const done = log[day]?.[exp.habitId] ? 1 : 0;
    if (arm === "A") {
      nA++;
      doneA += done;
    } else if (arm === "B") {
      nB++;
      doneB += done;
    }
  }
  const rateA = nA ? doneA / nA : null;
  const rateB = nB ? doneB / nB : null;
  const both = nA > 0 && nB > 0;
  const diff = both ? rateB - rateA : null;
  const ci = both ? newcombe(doneA, nA, doneB, nB) : null;
  const p = both ? permutationP(doneA, nA, doneB, nB) : null;

  let verdict;
  if (!isDue(exp, today)) verdict = "running";
  else if (nA < MIN_PER_ARM || nB < MIN_PER_ARM) verdict = "insufficient";
  else if (p <= MAX_P && Math.abs(diff) >= MIN_DIFF) verdict = diff > 0 ? "B_better" : "A_better";
  else verdict = "no_clear_difference";

  return { nA, nB, doneA, doneB, rateA, rateB, diff, ci, p, verdict, daysLeft };
}
