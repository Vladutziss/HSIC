import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Dumbbell,
  Brain,
  BookOpen,
  Moon,
  Droplets,
  PenLine,
  Footprints,
  Languages,
  Timer,
  Sparkles,
  TrendingUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  RefreshCw,
  Feather,
  Info,
  Settings2,
  Sun,
  Leaf,
  ListTodo,
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Momentum model                                                     */
/* ------------------------------------------------------------------ */
// Momentum is a 0–100 score. A check-in closes a fraction of the gap to 100;
// the fraction grows with consecutive days (up to +50%) and gets a comeback
// multiplier for the first few days after a miss. A miss multiplies the score
// by 0.93 (then 0.95 for each further consecutive miss) instead of resetting.
const BASE_RATE = 0.085;
const FIRST_MISS_KEEP = 0.93;
const REPEAT_MISS_KEEP = 0.95;
const COMEBACK_MULT = 1.6;
const COMEBACK_WINDOW = 3; // first N check-ins after a miss
const LITE_CREDIT = 0.6; // the lighter version counts for 60% of a full rep
const START_MOMENTUM = 38;
const HISTORY_DAYS = 30;
const PROJECTION_DAYS = 60;

function stepMomentum(prev, v) {
  const s = { ...prev };
  if (v > 0) {
    s.run += 1;
    s.missRun = 0;
    s.comeback = s.sinceMissChecks < COMEBACK_WINDOW && s.hadMiss;
    s.sinceMissChecks += 1;
    const runBonus = 1 + 0.1 * Math.min(s.run - 1, 5);
    const rate = BASE_RATE * runBonus * (s.comeback ? COMEBACK_MULT : 1);
    s.m = s.m + rate * v * (100 - s.m);
    s.streak += 1;
  } else {
    s.missRun += 1;
    s.m = s.m * (s.missRun === 1 ? FIRST_MISS_KEEP : REPEAT_MISS_KEEP);
    s.run = 0;
    s.comeback = false;
    s.hadMiss = true;
    s.sinceMissChecks = 0;
    s.streak = 0; // what a classic streak app would do
  }
  return s;
}

const initialState = () => ({
  m: START_MOMENTUM,
  run: 0,
  missRun: 0,
  comeback: false,
  hadMiss: false,
  sinceMissChecks: 99,
  streak: 0,
});

function runMomentum(values) {
  let s = initialState();
  return values.map((v) => {
    s = stepMomentum(s, v);
    return s;
  });
}

// Expected-value projection: with completion probability p and mean credit a,
// E[M'] = p·(M + r·a·(100−M)) + (1−p)·0.93·M. Converges to a stable level.
function project(startM, p, a, days) {
  const r = BASE_RATE * 1.25;
  const out = [];
  let m = startM;
  for (let i = 0; i < days; i++) {
    m = p * (m + r * a * (100 - m)) + (1 - p) * FIRST_MISS_KEEP * m;
    out.push(m);
  }
  return out;
}

function recentRate(values, n = 14) {
  const slice = values.slice(-n);
  const done = slice.filter((v) => v > 0);
  const p = done.length / slice.length;
  const a = done.length ? done.reduce((x, y) => x + y, 0) / done.length : 1;
  return { p, a };
}

const momentumLabel = (m) =>
  m >= 90
    ? "In the groove"
    : m >= 75
    ? "Strong"
    : m >= 55
    ? "Steady"
    : m >= 30
    ? "Building"
    : "Warming up";

/* ------------------------------------------------------------------ */
/*  Habit catalog + simulated history                                  */
/* ------------------------------------------------------------------ */
const CATALOG = [
  { id: "gym", name: "Gym", icon: Dumbbell, full: "45-min gym session", lite: "10-min brisk walk", base: 0.8, week: [0.55, 1.05, 1, 1.05, 1, 0.9, 0.75], sleepSensitive: true, verb: "train" },
  { id: "meditate", name: "Meditate", icon: Brain, full: "10-min meditation", lite: "2 minutes of slow breathing", base: 0.86, week: [0.8, 1, 1, 1, 1, 1, 0.8], sleepSensitive: false, verb: "meditate" },
  { id: "read", name: "Read", icon: BookOpen, full: "Read 20 pages", lite: "Read 2 pages before bed", base: 0.78, week: [1.1, 1, 0.95, 1, 0.95, 0.65, 1.05], sleepSensitive: false, verb: "read" },
  { id: "sleep", name: "Lights out by 23:00", icon: Moon, full: "Lights out by 23:00", lite: "Screens off by 23:30", base: 0.72, week: [1, 1.05, 1.05, 1.05, 1, 0.6, 0.6], sleepSensitive: false, verb: "wind down" },
  { id: "water", name: "Hydrate", icon: Droplets, full: "Drink 2 L of water", lite: "A full glass with each meal", base: 0.88, week: [0.9, 1, 1, 1, 1, 1, 0.9], sleepSensitive: false, verb: "hydrate" },
  { id: "journal", name: "Journal", icon: PenLine, full: "Journal for 10 min", lite: "Write one honest sentence", base: 0.72, week: [1.1, 1, 1, 0.95, 1, 0.8, 1], sleepSensitive: false, verb: "journal" },
  { id: "walk", name: "Walk", icon: Footprints, full: "Walk 8,000 steps", lite: "15-min walk after lunch", base: 0.82, week: [1, 1, 1, 1, 1, 1, 1.05], sleepSensitive: true, verb: "walk" },
  { id: "language", name: "Spanish", icon: Languages, full: "20 min of Spanish", lite: "Review 5 flashcards", base: 0.74, week: [0.85, 1, 1, 1, 1, 0.85, 0.85], sleepSensitive: false, verb: "practise" },
  { id: "deepwork", name: "Deep work", icon: Timer, full: "90-min deep-work block", lite: "One 25-min focus sprint", base: 0.78, week: [0.4, 1.05, 1.05, 1.05, 1.05, 0.9, 0.5], sleepSensitive: true, verb: "focus" },
];
const byId = Object.fromEntries(CATALOG.map((h) => [h.id, h]));

// Categorical slots in fixed order (validated palette, slots 1–4).
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#c98500"];
const OVERALL = "#1d3b33";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86400000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
// index 0 = 30 days ago, index 29 = yesterday, index 30 = today
const dateAt = (i) => new Date(startOfToday().getTime() - (HISTORY_DAYS - i) * DAY_MS);
const fmtDay = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// sleep[i] = hours slept the night before day i (sleep[30] = last night)
function simulateSleep() {
  const rng = mulberry32(7);
  const out = [];
  for (let i = 0; i <= HISTORY_DAYS; i++) {
    const dow = dateAt(i).getDay();
    let h = 7.15 + (rng() - 0.5) * 1.2 + (dow === 0 || dow === 6 ? 0.35 : 0);
    if (i >= 12 && i <= 16) h -= 0.9; // a busy stretch mid-month
    out.push(h);
  }
  out[26] = 5.7;
  out[HISTORY_DAYS] = 5.6; // rough night before today → drives the suggestion
  return out.map((h) => Math.round(Math.min(8.6, Math.max(4.8, h)) * 10) / 10);
}

function simulateHabit(habit, idx, sleep) {
  const rng = mulberry32(1000 + idx * 97 + habit.id.length * 13);
  const values = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const dow = dateAt(i).getDay();
    let p = habit.base * habit.week[dow];
    if (i >= 12 && i <= 16) p *= 0.6;
    if (habit.sleepSensitive && sleep[i] < 6.3) p *= 0.35;
    p = Math.min(0.97, p);
    const r = rng();
    values.push(r < p ? 1 : r < p + 0.12 ? LITE_CREDIT : 0);
  }
  if (habit.sleepSensitive) {
    values[26] = 0; // after the 5.7 h night
    values[24] = 0; // a second skip this week
  }
  // make sure recent days show a comeback in progress for at least one habit
  if (idx === 1) {
    values[25] = 0;
    values[26] = 1;
    values[27] = 1;
    values[28] = LITE_CREDIT;
    values[29] = 1;
  }
  return values;
}

/* ------------------------------------------------------------------ */
/*  "AI" layer — templated, rule-based, written to read like an LLM    */
/* ------------------------------------------------------------------ */
const plural = (n, one, many) => (n === 1 ? one : many);
const timesWord = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

function habitStats(id, values, sleep) {
  const series = runMomentum(values);
  const last = series[series.length - 1];
  const last7 = values.slice(-7);
  const misses7 = last7.filter((v) => v === 0).length;
  const lites7 = last7.filter((v) => v > 0 && v < 1).length;

  const byDow = Array.from({ length: 7 }, () => ({ n: 0, done: 0 }));
  values.forEach((v, i) => {
    const d = dateAt(i).getDay();
    byDow[d].n += 1;
    if (v > 0) byDow[d].done += 1;
  });
  const dowRates = byDow.map((b, d) => ({ d, rate: b.n ? b.done / b.n : 0, n: b.n }));
  const ranked = [...dowRates].filter((x) => x.n >= 3).sort((a, b) => a.rate - b.rate);

  const afterBad = values.filter((_, i) => sleep[i] < 6.3);
  const afterGood = values.filter((_, i) => sleep[i] >= 7);
  const rateOf = (arr) => (arr.length ? arr.filter((v) => v > 0).length / arr.length : null);

  // days needed to climb back to the pre-miss level
  const recoveries = [];
  values.forEach((v, i) => {
    if (v !== 0 || i === 0 || values[i - 1] === 0) return;
    const before = series[i - 1].m;
    for (let j = i + 1; j < series.length; j++) {
      if (series[j].m >= before) {
        recoveries.push(j - i);
        break;
      }
    }
  });
  const resets = values.filter((v, i) => v === 0 && i > 0 && values[i - 1] > 0).length;
  const lowest = Math.min(...series.map((s) => s.m));
  let bestRun = 0;
  let run = 0;
  values.forEach((v) => {
    run = v > 0 ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  });

  return {
    series,
    last,
    misses7,
    lites7,
    worstDay: ranked[0],
    bestDay: ranked[ranked.length - 1],
    afterBadRate: rateOf(afterBad),
    afterGoodRate: rateOf(afterGood),
    recoveryAvg: recoveries.length ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : null,
    resets,
    lowest,
    bestRun,
    completion: values.filter((v) => v > 0).length / values.length,
    week7: series[series.length - 1].m - series[series.length - 8].m,
  };
}

function buildSuggestions({ habits, stats, sleep, goal }) {
  const lastNight = sleep[HISTORY_DAYS];
  const avg3 = (sleep[HISTORY_DAYS] + sleep[HISTORY_DAYS - 1] + sleep[HISTORY_DAYS - 2]) / 3;
  const todayDow = startOfToday().getDay();
  const goalBit = goal ? ` It still counts toward “${goal.trim()}”.` : "";
  const out = [];

  habits.forEach((id) => {
    const h = byId[id];
    const s = stats[id];
    if (h.sleepSensitive && lastNight < 6.5 && s.misses7 >= 1) {
      out.push({
        id,
        kind: "lighter",
        priority: 3 + s.misses7,
        title: `Swap in the lighter ${h.name.toLowerCase()} today`,
        body: `You slept ${lastNight} h last night and skipped ${h.name.toLowerCase()} ${timesWord(
          s.misses7
        )} this week. Try a ${h.lite.toLowerCase()} instead of the ${h.full.toLowerCase()}. On short sleep a small rep is the one most likely to happen, and it still adds momentum.${goalBit}`,
        signals: [
          `Sleep: ${lastNight} h last night, ${avg3.toFixed(1)} h 3-night avg`,
          `${h.name}: ${s.misses7} ${plural(s.misses7, "miss", "misses")} in the last 7 days`,
          s.afterBadRate != null ? `You check in ${Math.round(s.afterBadRate * 100)}% of the time after short nights` : null,
        ].filter(Boolean),
        action: "lite",
      });
    } else if (s.misses7 >= 2) {
      out.push({
        id,
        kind: "anchor",
        priority: 2 + s.misses7 * 0.5,
        title: `Make ${h.name.toLowerCase()} smaller, not skipped`,
        body: `${h.name} slipped ${timesWord(s.misses7)} this week. That happens, and your momentum is still ${Math.round(
          s.last.m
        )}. For the next few days, aim for “${h.lite.toLowerCase()}” and attach it to something you already do, like right after your morning coffee.`,
        signals: [`${s.misses7} misses in 7 days`, `Momentum ${Math.round(s.last.m)} (${momentumLabel(s.last.m).toLowerCase()})`],
        action: "lite",
      });
    }
    if (s.last.comeback || (s.last.run > 0 && s.last.run <= COMEBACK_WINDOW && s.last.hadMiss)) {
      const left = Math.max(0, COMEBACK_WINDOW - s.last.sinceMissChecks);
      out.push({
        id,
        kind: "comeback",
        priority: 2,
        title: `Comeback bonus is active for ${h.name.toLowerCase()}`,
        body: `You picked ${h.name.toLowerCase()} back up after a miss, so ${
          left > 0 ? `your next ${left} ${plural(left, "check-in grows", "check-ins grow")}` : "today's check-in grows"
        } momentum 1.6× faster. The dip from the missed day will be gone within a couple of days.`,
        signals: [`Current run: ${s.last.run} ${plural(s.last.run, "day", "days")}`, `Momentum ${Math.round(s.last.m)}`],
        action: null,
      });
    }
    if (s.last.run >= 5 && s.last.m >= 70) {
      out.push({
        id,
        kind: "stretch",
        priority: 1,
        title: `${h.name} feels settled, so a stretch day is optional`,
        body: `${s.last.run} days in a row and momentum at ${Math.round(
          s.last.m
        )}. If you have energy today, go a little further than “${h.full.toLowerCase()}”. If not, the regular version keeps the curve rising. Both are good days.`,
        signals: [`Run: ${s.last.run} days`, `Best run this month: ${s.bestRun} days`],
        action: null,
      });
    }
    if (s.worstDay && s.worstDay.d === todayDow && s.worstDay.rate < 0.6) {
      out.push({
        id,
        kind: "weekday",
        priority: 1.5,
        title: `${WEEKDAYS[todayDow]}s are usually harder for ${h.name.toLowerCase()}`,
        body: `You check in on ${Math.round(s.worstDay.rate * 100)}% of ${WEEKDAYS[todayDow]}s versus ${Math.round(
          s.bestDay.rate * 100
        )}% on ${WEEKDAYS[s.bestDay.d]}s. Plan the lighter version up front today (${h.lite.toLowerCase()}), so the day doesn't have to go perfectly.`,
        signals: [`${WEEKDAYS[todayDow]} completion: ${Math.round(s.worstDay.rate * 100)}%`],
        action: "lite",
      });
    }
  });

  if (!out.length) {
    const id = habits[0];
    out.push({
      id,
      kind: "steady",
      priority: 0,
      title: "Everything looks steady",
      body: `No adjustments needed today. Do the usual versions of your habits, and if the day gets away from you, the lighter version of any of them still counts.`,
      signals: [`Sleep last night: ${lastNight} h`],
      action: null,
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

function buildInsight(id, s, goal) {
  const h = byId[id];
  const parts = [];
  parts.push(
    `Over the last 30 days you completed ${h.name.toLowerCase()} on ${Math.round(s.completion * 100)}% of days, and your momentum sits at ${Math.round(
      s.last.m
    )} (${momentumLabel(s.last.m).toLowerCase()}).`
  );
  if (s.worstDay && s.bestDay && s.bestDay.rate - s.worstDay.rate >= 0.2) {
    parts.push(
      `The clearest pattern is the day of the week: ${WEEKDAYS[s.bestDay.d]}s land ${Math.round(s.bestDay.rate * 100)}% of the time, while ${
        WEEKDAYS[s.worstDay.d]
      }s drop to ${Math.round(s.worstDay.rate * 100)}%. That looks like a scheduling issue rather than a motivation one, so a pre-planned lighter version on ${
        WEEKDAYS[s.worstDay.d]
      }s would probably do more than extra willpower.`
    );
  }
  if (s.afterBadRate != null && s.afterGoodRate != null && s.afterGoodRate - s.afterBadRate >= 0.2) {
    parts.push(
      `Sleep matters here too. After nights under 6.3 h you followed through ${Math.round(
        s.afterBadRate * 100
      )}% of the time, against ${Math.round(s.afterGoodRate * 100)}% after 7 h or more.`
    );
  }
  if (s.recoveryAvg != null) {
    parts.push(
      `When you did miss, you were back above your previous level in about ${s.recoveryAvg.toFixed(1)} ${plural(
        Math.round(s.recoveryAvg),
        "day",
        "days"
      )} on average. A classic streak counter would have sent you back to zero ${timesWord(
        s.resets
      )} this month. Your momentum never dropped below ${Math.round(s.lowest)}.`
    );
  }
  if (goal) parts.push(`All of this keeps adding up toward “${goal.trim()}”.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Small UI pieces                                                    */
/* ------------------------------------------------------------------ */
function Ring({ value, color, size = 56, stroke = 6, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e9e5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Delta({ value }) {
  const v = Math.round(value);
  if (v === 0) return <span className="text-xs text-[#5b6b64]">flat this week</span>;
  return v > 0 ? (
    <span className="text-xs font-medium text-[#1f6f54]">+{v} this week</span>
  ) : (
    <span className="text-xs text-[#5b6b64]">{v} this week · one check-in turns it</span>
  );
}

function Card({ className = "", children }) {
  return <div className={`rounded-2xl border border-[#dde5e0] bg-white ${className}`}>{children}</div>;
}

function ChartTooltip({ active, payload, label, fmt }) {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => p.value != null);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-[#dde5e0] bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-[#15241f]">{fmt ? fmt(label) : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[#5b6b64]">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
          {p.name}: <span className="font-mono tabular-nums text-[#15241f]">{Math.round(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding                                                         */
/* ------------------------------------------------------------------ */
function Onboarding({ onDone }) {
  const [picked, setPicked] = useState([]);
  const [goal, setGoal] = useState("");
  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));
  const ready = picked.length >= 3 && goal.trim().length > 3;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center gap-2 text-[#1f6f54]">
        <Leaf size={20} />
        <span className="font-display text-lg font-semibold tracking-tight">Momentum</span>
      </div>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[#15241f] sm:text-4xl" style={{ textWrap: "balance" }}>
        Build habits that bend, not break.
      </h1>
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-[#5b6b64]">
        Instead of a streak that resets to zero, each habit carries a momentum score. Check-ins raise it, a missed day nudges it down a
        little, and getting back on track recovers it faster.
      </p>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#15241f]">Pick 3–4 habits</h2>
          <span className="font-mono text-xs tabular-nums text-[#5b6b64]">{picked.length}/4</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CATALOG.map((h) => {
            const on = picked.includes(h.id);
            const Icon = h.icon;
            const disabled = !on && picked.length >= 4;
            return (
              <button
                key={h.id}
                id={`pick-${h.id}`}
                onClick={() => toggle(h.id)}
                disabled={disabled}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6f54] ${
                  on ? "border-[#1f6f54] bg-[#e8f2ed]" : "border-[#dde5e0] bg-white hover:border-[#9fb8ad]"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <Icon size={18} className={on ? "mt-0.5 text-[#1f6f54]" : "mt-0.5 text-[#5b6b64]"} />
                <span>
                  <span className="block text-sm font-medium text-[#15241f]">{h.name}</span>
                  <span className="block text-xs text-[#5b6b64]">{h.full}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <label htmlFor="goal" className="mb-2 block text-sm font-semibold uppercase tracking-wider text-[#15241f]">
          Your goal, in a sentence
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          maxLength={140}
          placeholder="e.g. Have enough energy to enjoy evenings with my family"
          className="w-full resize-none rounded-xl border border-[#dde5e0] bg-white p-3 text-[15px] text-[#15241f] placeholder:text-[#9aa8a2] focus:border-[#1f6f54] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[#5b6b64]">Suggestions will refer back to this.</p>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          id="start"
          disabled={!ready}
          onClick={() => onDone(picked, goal)}
          className="rounded-xl bg-[#1f6f54] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#185a44] disabled:cursor-not-allowed disabled:bg-[#b9cac2]"
        >
          Start tracking
        </button>
        <button
          id="example"
          onClick={() => onDone(["gym", "meditate", "read", "deepwork"], "Feel strong and clear-headed going into exam season")}
          className="rounded-xl px-4 py-3 text-sm font-medium text-[#1f6f54] hover:bg-[#e8f2ed]"
        >
          Use an example setup
        </button>
      </div>
      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-[#5b6b64]">
        <Info size={14} className="mt-0.5 shrink-0" />
        Prototype: the app seeds 30 days of simulated check-ins and sleep data so you can see the momentum curve in action.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard (Today)                                                  */
/* ------------------------------------------------------------------ */
function SuggestionCard({ suggestions, modes, setMode }) {
  const [idx, setIdx] = useState(0);
  const [thinking, setThinking] = useState(true);
  useEffect(() => {
    setThinking(true);
    const t = setTimeout(() => setThinking(false), 900);
    return () => clearTimeout(t);
  }, [idx]);
  const s = suggestions[idx % suggestions.length];
  const h = byId[s.id];
  const applied = s.action === "lite" && modes[s.id] === "lite";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#eef2ef] bg-[#f4f8f6] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1f6f54]">
          <Sparkles size={14} /> Today's suggestion
        </div>
        {suggestions.length > 1 && (
          <button
            id="next-suggestion"
            onClick={() => setIdx((i) => i + 1)}
            className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-[#5b6b64] hover:bg-white"
          >
            <RefreshCw size={12} /> Another idea ({(idx % suggestions.length) + 1}/{suggestions.length})
          </button>
        )}
      </div>
      <div className="p-4">
        {thinking ? (
          <div className="space-y-2" aria-live="polite">
            <div className="text-xs text-[#5b6b64]">Looking at your last 7 days…</div>
            <div className="h-4 w-2/3 animate-pulse rounded bg-[#e6ede9]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#eef2ef]" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-[#eef2ef]" />
          </div>
        ) : (
          <div>
            <h3 className="font-display text-lg font-semibold leading-snug text-[#15241f]">{s.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[#3c4b45]">{s.body}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.signals.map((x) => (
                <span key={x} className="rounded-full bg-[#f1f4f2] px-2.5 py-1 text-xs text-[#5b6b64]">
                  {x}
                </span>
              ))}
            </div>
            {s.action === "lite" && (
              <button
                id="apply-suggestion"
                onClick={() => setMode(s.id, applied ? "full" : "lite")}
                className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  applied ? "bg-[#e8f2ed] text-[#1f6f54]" : "bg-[#1f6f54] text-white hover:bg-[#185a44]"
                }`}
              >
                {applied ? <Check size={16} /> : <Feather size={16} />}
                {applied ? `Today's target: ${h.lite}` : `Use “${h.lite}” today`}
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function HabitRow({ id, color, stats, value, mode, onToggle, onMode, onOpen }) {
  const h = byId[id];
  const Icon = h.icon;
  const prev = stats.last;
  const credit = mode === "lite" ? LITE_CREDIT : 1;
  const next = stepMomentum(prev, credit);
  const shown = value > 0 ? stepMomentum(prev, value) : prev;
  const gain = next.m - prev.m;
  const done = value > 0;

  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 transition sm:p-4 ${done ? "border-[#b8d6c7] bg-[#f3faf6]" : "border-[#dde5e0] bg-white"}`}>
      <button
        id={`check-${id}`}
        onClick={onToggle}
        aria-pressed={done}
        aria-label={`Mark ${h.name} done`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1f6f54] ${
          done ? "border-[#1f6f54] bg-[#1f6f54] text-white" : "border-[#b7c5bf] bg-white hover:border-[#1f6f54]"
        }`}
      >
        {done && <Check size={18} strokeWidth={3} />}
      </button>

      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} className="min-w-0 flex-1 cursor-pointer text-left">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <span className="font-medium text-[#15241f]">{h.name}</span>
          {prev.comeback || (prev.run > 0 && prev.run <= COMEBACK_WINDOW && prev.hadMiss) ? (
            <span className="whitespace-nowrap rounded-full bg-[#fff4de] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a5a00]">Comeback 1.6×</span>
          ) : null}
        </div>
        <div className="truncate text-sm text-[#5b6b64]">{mode === "lite" ? h.lite : h.full}</div>
        <div className="mt-0.5 text-xs text-[#5b6b64]">
          {done ? (
            <span className="text-[#1f6f54]">
              Logged · momentum +{(shown.m - prev.m).toFixed(1)}
            </span>
          ) : (
            <span>
              Checking in adds <span className="font-mono tabular-nums">+{gain.toFixed(1)}</span>
            </span>
          )}
          <span className="mx-1.5 text-[#c3cec9]">·</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMode(mode === "lite" ? "full" : "lite");
            }}
            className="underline decoration-dotted underline-offset-2 hover:text-[#1f6f54]"
          >
            {mode === "lite" ? "switch to full" : "lighter version"}
          </button>
        </div>
      </div>

      <button onClick={onOpen} className="flex items-center gap-2" aria-label={`Open ${h.name} details`}>
        <Ring value={shown.m} color={color}>
          <span className="font-mono text-sm font-semibold tabular-nums text-[#15241f]">{Math.round(shown.m)}</span>
        </Ring>
        <ChevronRight size={16} className="hidden text-[#9aa8a2] sm:block" />
      </button>
    </div>
  );
}

function Today({ habits, stats, today, modes, setMode, toggleToday, suggestions, goal, sleep, openHabit, colors, todos, setTodos }) {
  const current = habits.map((id) => (today[id] > 0 ? stepMomentum(stats[id].last, today[id]).m : stats[id].last.m));
  const overall = current.reduce((a, b) => a + b, 0) / current.length;
  const week = habits.reduce((a, id) => a + stats[id].week7, 0) / habits.length;
  const doneCount = habits.filter((id) => today[id] > 0).length;
  const dateStr = startOfToday().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Ring value={overall} color={OVERALL} size={92} stroke={9}>
          <div className="text-center">
            <div className="font-mono text-2xl font-semibold leading-none tabular-nums text-[#15241f]">{Math.round(overall)}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#5b6b64]">momentum</div>
          </div>
        </Ring>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-[#5b6b64]">{dateStr}</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#15241f]">
            {momentumLabel(overall)}. {doneCount === habits.length ? "Everything's logged for today." : doneCount > 0 ? `${doneCount} of ${habits.length} done so far.` : "A fresh day to add to it."}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Delta value={week} />
            <span className="flex items-center gap-1 text-xs text-[#5b6b64]">
              <Moon size={12} /> {sleep[HISTORY_DAYS]} h sleep last night
            </span>
          </div>
          <p className="mt-1 truncate text-sm italic text-[#5b6b64]">Goal: {goal}</p>
        </div>
      </div>

      <SuggestionCard suggestions={suggestions} modes={modes} setMode={setMode} />

      <div className="space-y-2.5">
        {habits.map((id, i) => (
          <HabitRow
            key={id}
            id={id}
            color={colors[i]}
            stats={stats[id]}
            value={today[id] || 0}
            mode={modes[id]}
            onToggle={() => toggleToday(id)}
            onMode={(m) => setMode(id, m)}
            onOpen={() => openHabit(id)}
          />
        ))}
      </div>
      <p className="text-center text-xs text-[#5b6b64]">The lighter version counts for {Math.round(LITE_CREDIT * 100)}% of a full check-in and never counts as a miss.</p>

      <TodoList todos={todos} setTodos={setTodos} habits={habits} colors={colors} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  To-do list                                                         */
/* ------------------------------------------------------------------ */
// Small prep tasks that make a habit easier to start tomorrow.
const PREP = {
  gym: "Pack the gym bag for tomorrow",
  meditate: "Set a 2-min reminder after lunch",
  read: "Pick the next book and leave it on the nightstand",
  sleep: "Charge the phone outside the bedroom",
  water: "Fill a water bottle for the desk",
  journal: "Leave the notebook on the pillow",
  walk: "Plan a 15-min walking loop near home",
  language: "Download two Spanish podcast episodes",
  deepwork: "Block tomorrow 9:00–10:30 for deep work",
};

let todoSeq = 0;
const newTodo = (text, list = "today", habit = null, done = false) => ({ id: `t${++todoSeq}`, text, list, habit, done });

function seedTodos(habits) {
  return [
    newTodo(PREP[habits[0]], "today", habits[0]),
    newTodo("Buy groceries for the week", "today", null, true),
    newTodo(PREP[habits[habits.length - 1]], "today", habits[habits.length - 1]),
    newTodo("Reply to Ana about Saturday", "later"),
    newTodo(PREP[habits[1]], "later", habits[1]),
  ];
}

function TodoItem({ t, habits, colors, onToggle, onMove, onDelete }) {
  const hi = t.habit ? habits.indexOf(t.habit) : -1;
  return (
    <li className="group flex items-start gap-3 py-2">
      <button
        id={`todo-${t.id}`}
        onClick={onToggle}
        aria-pressed={t.done}
        aria-label={t.done ? `Mark “${t.text}” not done` : `Mark “${t.text}” done`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6f54] ${
          t.done ? "border-[#1f6f54] bg-[#1f6f54] text-white" : "border-[#b7c5bf] bg-white hover:border-[#1f6f54]"
        }`}
      >
        {t.done && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] leading-snug ${t.done ? "text-[#9aa8a2] line-through" : "text-[#15241f]"}`}>{t.text}</div>
        {hi >= 0 && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#5b6b64]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: colors[hi] }} />
            helps {byId[t.habit].name.toLowerCase()}
          </span>
        )}
      </div>
      {!t.done && (
        <button
          onClick={onMove}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[#5b6b64] hover:bg-[#f1f4f2] hover:text-[#15241f]"
          aria-label={t.list === "today" ? "Move to later" : "Move to today"}
        >
          {t.list === "today" ? (
            <>
              Later <ArrowRight size={12} />
            </>
          ) : (
            <>
              <ArrowLeft size={12} /> Today
            </>
          )}
        </button>
      )}
      <button onClick={onDelete} aria-label={`Delete “${t.text}”`} className="shrink-0 rounded-md p-1 text-[#9aa8a2] hover:bg-[#f1f4f2] hover:text-[#15241f]">
        <X size={14} />
      </button>
    </li>
  );
}

function TodoList({ todos, setTodos, habits, colors }) {
  const [text, setText] = useState("");
  const [list, setList] = useState("today");
  const [habit, setHabit] = useState("");
  const [showDone, setShowDone] = useState(false);

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setTodos((ts) => [...ts, newTodo(text.trim(), list, habit || null)]);
    setText("");
  };
  const update = (id, patch) => setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTodos((ts) => ts.filter((t) => t.id !== id));

  const open = (l) => todos.filter((t) => !t.done && t.list === l);
  const done = todos.filter((t) => t.done);
  const todayAll = todos.filter((t) => t.list === "today");
  const todayDone = todayAll.filter((t) => t.done).length;
  const item = (t) => (
    <TodoItem
      key={t.id}
      t={t}
      habits={habits}
      colors={colors}
      onToggle={() => update(t.id, { done: !t.done })}
      onMove={() => update(t.id, { list: t.list === "today" ? "later" : "today" })}
      onDelete={() => remove(t.id)}
    />
  );

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#15241f]">
          <ListTodo size={18} className="text-[#1f6f54]" /> To-dos
        </h2>
        <span className="font-mono text-xs tabular-nums text-[#5b6b64]">
          {todayDone}/{todayAll.length} today
        </span>
      </div>
      <p className="mt-0.5 text-sm text-[#5b6b64]">One-off tasks. Anything you don't get to can move to Later without counting against you.</p>

      <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="todo-text" className="sr-only">
          New to-do
        </label>
        <input
          id="todo-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={120}
          placeholder="Add a to-do…"
          className="min-w-0 flex-1 rounded-lg border border-[#dde5e0] bg-white px-3 py-2 text-[15px] text-[#15241f] placeholder:text-[#9aa8a2] focus:border-[#1f6f54] focus:outline-none"
        />
        <div className="flex gap-2">
          <label htmlFor="todo-list" className="sr-only">
            List
          </label>
          <select
            id="todo-list"
            value={list}
            onChange={(e) => setList(e.target.value)}
            className="rounded-lg border border-[#dde5e0] bg-white px-2 py-2 text-sm text-[#3c4b45] focus:border-[#1f6f54] focus:outline-none"
          >
            <option value="today">Today</option>
            <option value="later">Later</option>
          </select>
          <label htmlFor="todo-habit" className="sr-only">
            Related habit
          </label>
          <select
            id="todo-habit"
            value={habit}
            onChange={(e) => setHabit(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#dde5e0] bg-white px-2 py-2 text-sm text-[#3c4b45] focus:border-[#1f6f54] focus:outline-none sm:flex-none"
          >
            <option value="">No habit</option>
            {habits.map((id) => (
              <option key={id} value={id}>
                {byId[id].name}
              </option>
            ))}
          </select>
          <button
            id="todo-add"
            type="submit"
            disabled={!text.trim()}
            className="flex items-center gap-1 rounded-lg bg-[#1f6f54] px-3 py-2 text-sm font-semibold text-white hover:bg-[#185a44] disabled:bg-[#b9cac2]"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </form>

      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#5b6b64]">Today</div>
        {open("today").length ? (
          <ul className="divide-y divide-[#eef2ef]">{open("today").map(item)}</ul>
        ) : (
          <p className="py-2 text-sm text-[#5b6b64]">Nothing left for today.</p>
        )}
      </div>

      {open("later").length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#5b6b64]">Later</div>
          <ul className="divide-y divide-[#eef2ef]">{open("later").map(item)}</ul>
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-3 border-t border-[#eef2ef] pt-2">
          <button id="todo-show-done" onClick={() => setShowDone((x) => !x)} className="flex items-center gap-1 text-xs text-[#5b6b64] hover:text-[#15241f]">
            <ChevronRight size={12} className={`transition ${showDone ? "rotate-90" : ""}`} /> Done ({done.length})
          </button>
          {showDone && <ul className="divide-y divide-[#eef2ef]">{done.map(item)}</ul>}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */
function Progress({ habits, values, stats, colors, goal }) {
  const [focus, setFocus] = useState("all");
  const ids = focus === "all" ? habits : [focus];
  const color = focus === "all" ? OVERALL : colors[habits.indexOf(focus)];

  const { data, now, pace, stretch, p, streakData, resets, lowest } = useMemo(() => {
    const n = values[ids[0]].length;
    const perHabit = ids.map((id) => runMomentum(values[id]));
    const actual = Array.from({ length: n }, (_, i) => perHabit.reduce((a, s) => a + s[i].m, 0) / ids.length);
    const rates = ids.map((id) => recentRate(values[id]));
    const projPace = ids.map((id, k) => project(perHabit[k][n - 1].m, rates[k].p, rates[k].a, PROJECTION_DAYS));
    const projStretch = ids.map((id, k) => project(perHabit[k][n - 1].m, Math.min(1, rates[k].p + 1 / 7), rates[k].a, PROJECTION_DAYS));
    const avgAt = (arr, j) => arr.reduce((a, x) => a + x[j], 0) / arr.length;
    // n = 30 (today still open, last point is yesterday) or 31 (today logged)
    const off = (i) => i - HISTORY_DAYS;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      rows.push({ x: off(i), actual: actual[i], pace: last ? actual[i] : null, stretch: last ? actual[i] : null });
    }
    for (let j = 0; j < PROJECTION_DAYS; j++) {
      rows.push({ x: off(n - 1) + j + 1, actual: null, pace: avgAt(projPace, j), stretch: avgAt(projStretch, j) });
    }
    const streakRows = Array.from({ length: n }, (_, i) => ({
      x: off(i),
      streak: perHabit.reduce((a, s) => a + s[i].streak, 0) / ids.length,
      momentum: actual[i],
    }));
    const r = ids.reduce((a, id) => a + stats[id].resets, 0);
    return {
      data: rows,
      now: actual[n - 1],
      pace: avgAt(projPace, PROJECTION_DAYS - 1),
      stretch: avgAt(projStretch, PROJECTION_DAYS - 1),
      p: rates.reduce((a, x) => a + x.p, 0) / rates.length,
      streakData: streakRows,
      resets: r,
      lowest: Math.min(...actual),
    };
  }, [focus, values, habits, stats]);

  const dayLabel = (x) => (x === 0 ? "Today" : fmtDay(new Date(startOfToday().getTime() + x * DAY_MS)));
  const perWeek = (p * 7).toFixed(1);
  const focusName = focus === "all" ? "overall momentum" : `${byId[focus].name.toLowerCase()} momentum`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#15241f]">Your trajectory</h1>
        <p className="text-sm text-[#5b6b64]">Last 30 days, plus where the current pace leads over the next 60.</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {["all", ...habits].map((id, i) => {
          const on = focus === id;
          const c = id === "all" ? OVERALL : colors[i - 1];
          return (
            <button
              key={id}
              id={`focus-${id}`}
              role="tab"
              aria-selected={on}
              onClick={() => setFocus(id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                on ? "border-[#15241f] bg-[#15241f] text-white" : "border-[#dde5e0] bg-white text-[#3c4b45] hover:border-[#9fb8ad]"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
              {id === "all" ? "All habits" : byId[id].name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-[#5b6b64]">Now</div>
          <div className="font-mono text-3xl font-semibold tabular-nums text-[#15241f]">{Math.round(now)}</div>
          <div className="text-xs text-[#5b6b64]">{momentumLabel(now)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-[#5b6b64]">In 60 days at this pace</div>
          <div className="font-mono text-3xl font-semibold tabular-nums text-[#15241f]">{Math.round(pace)}</div>
          <div className="text-xs text-[#5b6b64]">{perWeek} check-ins/week · {momentumLabel(pace).toLowerCase()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-[#5b6b64]">With one more per week</div>
          <div className="font-mono text-3xl font-semibold tabular-nums text-[#1f6f54]">{Math.round(stretch)}</div>
          <div className="text-xs text-[#5b6b64]">+{Math.round(stretch - pace)} over the current pace</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#15241f]">Momentum, {focus === "all" ? "average of your habits" : byId[focus].name}</h2>
          <span className="text-xs text-[#5b6b64]">0–100</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="#eef2ef" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={[-(HISTORY_DAYS), PROJECTION_DAYS]}
                ticks={[-30, -15, 0, 15, 30, 45, 60]}
                tickFormatter={dayLabel}
                tick={{ fontSize: 11, fill: "#5b6b64" }}
                axisLine={{ stroke: "#dde5e0" }}
                tickLine={false}
              />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#5b6b64" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip fmt={dayLabel} />} cursor={{ stroke: "#9aa8a2", strokeDasharray: "3 3" }} />
              <ReferenceLine x={0} stroke="#9aa8a2" strokeDasharray="2 4" label={{ value: "Today", position: "insideTopLeft", fontSize: 11, fill: "#5b6b64" }} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#3c4b45" }} />
              <Line name="Actual" dataKey="actual" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive />
              <Line name="At this pace" dataKey="pace" stroke={color} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} />
              <Line name="+1 check-in/week" dataKey="stretch" stroke="#1baf7a" strokeWidth={2} strokeDasharray="2 4" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#3c4b45]">
          <TrendingUp size={14} className="mr-1 inline text-[#1f6f54]" />
          At this pace, in 60 days your {focusName} will be around <strong className="font-semibold">{Math.round(pace)}</strong>, which is{" "}
          {momentumLabel(pace).toLowerCase()} territory. Adding just one extra check-in a week (the lighter version counts) lifts that to{" "}
          <strong className="font-semibold">{Math.round(stretch)}</strong>. {goal ? `That's steady ground under “${goal.trim()}”.` : ""}
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-[#15241f]">Why momentum instead of a streak</h2>
        <p className="mt-1 text-sm text-[#5b6b64]">
          Over the same 30 days, a classic streak counter would have reset to zero {timesWord(resets)}. Your momentum's lowest point was{" "}
          <span className="font-mono tabular-nums text-[#15241f]">{Math.round(lowest)}</span>.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-[#5b6b64]">Classic streak (days{focus === "all" ? ", averaged" : ""})</div>
            <div className="h-32">
              <ResponsiveContainer>
                <AreaChart data={streakData} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <CartesianGrid stroke="#eef2ef" vertical={false} />
                  <XAxis dataKey="x" tick={false} axisLine={{ stroke: "#dde5e0" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#5b6b64" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip fmt={dayLabel} />} />
                  <Area name="Streak" type="stepAfter" dataKey="streak" stroke="#8c9a94" fill="#8c9a94" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-[#5b6b64]">Momentum (0–100)</div>
            <div className="h-32">
              <ResponsiveContainer>
                <AreaChart data={streakData} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <CartesianGrid stroke="#eef2ef" vertical={false} />
                  <XAxis dataKey="x" tick={false} axisLine={{ stroke: "#dde5e0" }} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: "#5b6b64" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip fmt={dayLabel} />} />
                  <Area name="Momentum" type="monotone" dataKey="momentum" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#15241f]">
          <Settings2 size={14} /> How the score moves
        </h2>
        <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-[#3c4b45] sm:grid-cols-2">
          <li>
            <span className="font-medium">Check-in:</span> closes {Math.round(BASE_RATE * 100)}% of the gap to 100, growing to {Math.round(BASE_RATE * 150)}% on a 6-day run.
          </li>
          <li>
            <span className="font-medium">Lighter version:</span> counts for {Math.round(LITE_CREDIT * 100)}% of a check-in and is never a miss.
          </li>
          <li>
            <span className="font-medium">Missed day:</span> keeps {Math.round(FIRST_MISS_KEEP * 100)}% of your momentum, then {Math.round(REPEAT_MISS_KEEP * 100)}% for each day after.
          </li>
          <li>
            <span className="font-medium">Comeback bonus:</span> the first {COMEBACK_WINDOW} check-ins after a miss count {COMEBACK_MULT}×.
          </li>
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Habit detail                                                       */
/* ------------------------------------------------------------------ */
function Typewriter({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(text.length);
      return;
    }
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 3)), 16);
    return () => clearInterval(t);
  }, [text]);
  return (
    <p className="text-[15px] leading-relaxed text-[#3c4b45]">
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#1f6f54] align-middle" />}
    </p>
  );
}

function HabitDetail({ id, values, todayValue, stats, color, goal, sleep, onBack }) {
  const h = byId[id];
  const Icon = h.icon;
  const s = stats;
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, [id, seed]);

  const insight = useMemo(() => buildInsight(id, s, goal), [id, s, goal]);
  const all = [...values, todayValue > 0 ? todayValue : null];
  const series = runMomentum(values).map((x, i) => ({ x: i - HISTORY_DAYS, m: x.m }));
  if (todayValue > 0) series.push({ x: 0, m: stepMomentum(s.last, todayValue).m });

  // calendar grid aligned to weekday (Mon-first)
  const firstDow = (dateAt(0).getDay() + 6) % 7;
  const cells = [...Array(firstDow).fill(null), ...all.map((v, i) => ({ v, i }))];

  return (
    <div className="space-y-5">
      <button id="back" onClick={onBack} className="flex items-center gap-1 text-sm text-[#5b6b64] hover:text-[#15241f]">
        <ChevronLeft size={16} /> Today
      </button>

      <div className="flex items-center gap-4">
        <Ring value={s.last.m} color={color} size={72} stroke={8}>
          <Icon size={22} style={{ color }} />
        </Ring>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#15241f]">{h.name}</h1>
          <div className="text-sm text-[#5b6b64]">
            {h.full} · lighter: {h.lite.toLowerCase()}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
            <span className="font-mono tabular-nums text-[#15241f]">{Math.round(s.last.m)}</span>
            <span className="text-[#5b6b64]">{momentumLabel(s.last.m)}</span>
            <Delta value={s.week7} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Completion", `${Math.round(s.completion * 100)}%`, "last 30 days"],
          ["Best run", `${s.bestRun} d`, "this month"],
          ["Lowest point", Math.round(s.lowest), "never zero"],
          ["Recovery", s.recoveryAvg != null ? `${s.recoveryAvg.toFixed(1)} d` : "–", "back to pre-miss level"],
        ].map(([k, v, sub]) => (
          <Card key={k} className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#5b6b64]">{k}</div>
            <div className="font-mono text-xl font-semibold tabular-nums text-[#15241f]">{v}</div>
            <div className="text-[11px] text-[#5b6b64]">{sub}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#eef2ef] bg-[#f4f8f6] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1f6f54]">
            <Sparkles size={14} /> AI insight
          </div>
          <button id="regen" onClick={() => setSeed((x) => x + 1)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#5b6b64] hover:bg-white">
            <RefreshCw size={12} /> Regenerate
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="space-y-2">
              <div className="text-xs text-[#5b6b64]">Reading 30 days of check-ins and sleep…</div>
              {[100, 92, 97, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-[#eef2ef]" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <Typewriter key={seed} text={insight} />
          )}
          <div className="mt-3 text-[11px] text-[#9aa8a2]">Generated from your check-in history · simulated in this prototype</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#15241f]">
            <CalendarDays size={14} /> Check-ins
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-[#5b6b64]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded" style={{ background: color }} /> full
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded" style={{ background: `repeating-linear-gradient(135deg, ${color}66 0 2px, #ffffff 2px 4px)`, boxShadow: `inset 0 0 0 1px ${color}` }} /> lighter
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-dashed border-[#b7c5bf]" /> rest
            </span>
          </div>
        </div>
        <div className="mx-auto grid max-w-sm grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-[#9aa8a2]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
          {cells.map((c, k) => {
            if (!c) return <div key={k} />;
            const d = dateAt(c.i);
            const isToday = c.i === HISTORY_DAYS;
            const style =
              c.v === 1
                ? { background: color, color: "#fff" }
                : c.v > 0
                ? { background: `repeating-linear-gradient(135deg, ${color}66 0 3px, #ffffff 3px 6px)`, color: "#15241f", boxShadow: `inset 0 0 0 1.5px ${color}` }
                : {};
            const label = c.v == null ? "open" : c.v === 1 ? "full" : c.v > 0 ? "lighter version" : "rest day";
            return (
              <div
                key={k}
                title={`${fmtDay(d)} · ${label} · slept ${sleep[c.i]} h`}
                className={`flex aspect-square max-w-full items-center justify-center rounded-md font-mono text-[11px] normal-case tabular-nums ${
                  c.v === 0 ? "border border-dashed border-[#b7c5bf] text-[#9aa8a2]" : c.v == null ? "border border-[#dde5e0] text-[#5b6b64]" : ""
                } ${isToday ? "ring-2 ring-[#15241f] ring-offset-1" : ""}`}
                style={style}
              >
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-[#15241f]">Momentum, last 30 days</h2>
        <div className="h-40">
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="#eef2ef" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={[-HISTORY_DAYS, 0]}
                ticks={[-28, -21, -14, -7, 0]}
                tickFormatter={(x) => (x === 0 ? "Today" : fmtDay(new Date(startOfToday().getTime() + x * DAY_MS)))}
                tick={{ fontSize: 10, fill: "#5b6b64" }}
                axisLine={{ stroke: "#dde5e0" }}
                tickLine={false}
              />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: "#5b6b64" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip fmt={(x) => (x === 0 ? "Today" : fmtDay(new Date(startOfToday().getTime() + x * DAY_MS)))} />} />
              <Area name="Momentum" type="monotone" dataKey="m" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App shell                                                          */
/* ------------------------------------------------------------------ */
export default function MomentumHabits() {
  const [setup, setSetup] = useState(null); // { habits, goal }
  const [view, setView] = useState("today");
  const [detail, setDetail] = useState(null);
  const [today, setToday] = useState({});
  const [modes, setModes] = useState({});
  const [todos, setTodos] = useState([]);

  const sleep = useMemo(() => simulateSleep(), []);
  const values = useMemo(() => {
    if (!setup) return {};
    return Object.fromEntries(setup.habits.map((id, i) => [id, simulateHabit(byId[id], i, sleep)]));
  }, [setup, sleep]);
  const stats = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, habitStats(id, v, sleep)])),
    [values, sleep]
  );
  const suggestions = useMemo(
    () => (setup ? buildSuggestions({ habits: setup.habits, stats, sleep, goal: setup.goal }) : []),
    [setup, stats, sleep]
  );
  // include today's check-ins in the progress chart once they exist
  const valuesWithToday = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, today[id] > 0 ? [...v, today[id]] : v])),
    [values, today]
  );

  const fonts = (
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
      .momentum-root{font-family:Figtree,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
      .momentum-root .font-display{font-family:"Bricolage Grotesque",Figtree,ui-sans-serif,system-ui,sans-serif}
      .momentum-root .font-mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}`}</style>
  );

  if (!setup) {
    return (
      <div className="momentum-root min-h-screen bg-[#f3f6f4] text-[#15241f]">
        {fonts}
        <Onboarding
          onDone={(habits, goal) => {
            setSetup({ habits, goal });
            setModes(Object.fromEntries(habits.map((id) => [id, "full"])));
            setToday({});
            setTodos(seedTodos(habits));
            setView("today");
          }}
        />
      </div>
    );
  }

  const colors = setup.habits.map((_, i) => SERIES[i]);
  const setMode = (id, m) => {
    setModes((x) => ({ ...x, [id]: m }));
    setToday((t) => (t[id] > 0 ? { ...t, [id]: m === "lite" ? LITE_CREDIT : 1 } : t));
  };
  const toggleToday = (id) => setToday((t) => ({ ...t, [id]: t[id] > 0 ? 0 : modes[id] === "lite" ? LITE_CREDIT : 1 }));
  const openHabit = (id) => {
    setDetail(id);
    setView("habit");
  };

  const tabs = [
    { key: "today", label: "Today", icon: Sun },
    { key: "progress", label: "Progress", icon: TrendingUp },
  ];

  return (
    <div className="momentum-root min-h-screen bg-[#f3f6f4] text-[#15241f]">
      {fonts}
      <header className="sticky top-0 z-10 border-b border-[#dde5e0] bg-[#f3f6f4]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-[#1f6f54]">
            <Leaf size={18} />
            <span className="hidden font-display font-semibold tracking-tight sm:inline">Momentum</span>
          </div>
          <nav className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-[#dde5e0]">
            {tabs.map((t) => {
              const on = view === t.key || (t.key === "today" && view === "habit");
              const I = t.icon;
              return (
                <button
                  key={t.key}
                  id={`tab-${t.key}`}
                  onClick={() => setView(t.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    on ? "bg-[#15241f] text-white" : "text-[#5b6b64] hover:text-[#15241f]"
                  }`}
                >
                  <I size={14} /> {t.label}
                </button>
              );
            })}
          </nav>
          <button id="edit-habits" onClick={() => setSetup(null)} className="whitespace-nowrap text-xs text-[#5b6b64] hover:text-[#15241f]">
            Edit habits
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {view === "today" && (
          <Today
            habits={setup.habits}
            stats={stats}
            today={today}
            modes={modes}
            setMode={setMode}
            toggleToday={toggleToday}
            suggestions={suggestions}
            goal={setup.goal}
            sleep={sleep}
            openHabit={openHabit}
            colors={colors}
            todos={todos}
            setTodos={setTodos}
          />
        )}
        {view === "progress" && <Progress habits={setup.habits} values={valuesWithToday} stats={stats} colors={colors} goal={setup.goal} />}
        {view === "habit" && detail && (
          <HabitDetail
            id={detail}
            values={values[detail]}
            todayValue={today[detail] || 0}
            stats={stats[detail]}
            color={colors[setup.habits.indexOf(detail)]}
            goal={setup.goal}
            sleep={sleep}
            onBack={() => setView("today")}
          />
        )}
        <footer className="mt-10 border-t border-[#dde5e0] pt-4 text-center text-xs text-[#9aa8a2]">
          No streaks to lose, no leaderboards. Missed days lower the score a little, and it comes back.
        </footer>
      </main>
    </div>
  );
}
