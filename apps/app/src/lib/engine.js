// Game rules. Everything shown in the app (momentum, levels, streaks, the
// companion's stage and mood) is derived from the stored log by these pure
// functions, so the rules live in one place and are unit-tested.

import { addDays, diffDays, mondayOf, weekday } from "./dates.js";

// xp: momentum for a check-in; ep: evolution points the companion earns from it
export const DIFF = {
  1: { xp: 10, ep: 1, label: "Ușor" },
  2: { xp: 20, ep: 2, label: "Mediu" },
  3: { xp: 30, ep: 3, label: "Greu" },
};
export const diffEp = (d) => (DIFF[d] || DIFF[2]).ep;
export const diffXp = (d) => (DIFF[d] || DIFF[2]).xp;

// What the log stores for a habit on a day. Any truthy value counts as done: older data
// also holds 2-5 from the time check-ins could carry a proof, and they are read as 1.
export const CODE = { DONE: 1 };

export const RULES = {
  todoXp: 5,
  todoCap: 6,
  chestXp: 25, // every scheduled habit done
  reviewWeight: 0.4, // share of the AI score in the day score
  reviewXpRate: 0.5, // momentum earned per point of day score
  partialDecay: 0.08, // an active day with nothing scheduled done loses up to 8%
  inactiveKeep: 0.85, // a day with no activity keeps 85%
  habitMissKeep: 0.85, // a habit missed on a scheduled day keeps 85%
  runBonus: 0.04, // +4% per consecutive active day…
  runCap: 10, // …up to +40%
  habitRunBonus: 0.05,
  resetAfter: 3, // inactive days in a row that reset momentum
  revivesPerMonth: 2,
};

export const LEVELS = [
  { lvl: 1, name: "Scânteie", min: 0 },
  { lvl: 2, name: "Jar", min: 150 },
  { lvl: 3, name: "Flacără", min: 450 },
  { lvl: 4, name: "Torță", min: 900 },
  { lvl: 5, name: "Foc de tabără", min: 1500 },
  { lvl: 6, name: "Far", min: 2300 },
  { lvl: 7, name: "Vâlvătaie", min: 3300 },
  { lvl: 8, name: "Cometă", min: 4500 },
  { lvl: 9, name: "Stea", min: 6200 },
  { lvl: 10, name: "Supernovă", min: 8500 },
];

export function levelInfo(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  return {
    ...cur,
    next,
    progress: next ? Math.min(1, (points - cur.min) / (next.min - cur.min)) : 1,
    toNext: next ? Math.max(0, Math.ceil(next.min - points)) : 0,
  };
}

export const habitExists = (h, day) => !(h.createdAt && day < h.createdAt) && !(h.archivedAt && day >= h.archivedAt);
export const isScheduled = (h, day) => habitExists(h, day) && (h.days || []).includes(weekday(day));

function firstDay(state, today) {
  let first = state.meta?.start || today;
  for (const k of Object.keys(state.log || {})) if (k < first) first = k;
  for (const k of Object.keys(state.reviews || {})) if (k < first) first = k;
  return first > today ? today : first;
}

/**
 * Replays every day from the first entry to today.
 * Past days (and today once its review exists) are "closed": decay applies
 * and the day score turns into momentum. Today stays provisional until then.
 */
export function computeTimeline(state, today) {
  const habits = state.habits || [];
  const log = state.log || {};
  const reviews = state.reviews || {};
  const resetAfter = state.settings?.resetAfter || RULES.resetAfter;

  const todosByDay = {};
  const tick = (day) => (todosByDay[day] = (todosByDay[day] || 0) + 1);
  for (const t of state.todos || []) {
    if (t.repeat) for (const day of t.doneDays || []) tick(day); // a series counts once per ticked day
    else if (t.done && t.doneOn) tick(t.doneOn);
  }

  const days = [];
  const byDay = {};
  const habitSeries = {};
  const hm = {};
  const hrun = {};
  for (const h of habits) {
    habitSeries[h.id] = [];
    hm[h.id] = 0;
    hrun[h.id] = 0;
  }
  const resets = [];
  let M = 0;
  let inactiveRun = 0;
  let activeRun = 0;
  let best = 0;

  for (let d = firstDay(state, today); d <= today; d = addDays(d, 1)) {
    const entries = log[d] || {};
    const review = reviews[d];
    const closed = d < today || !!review;

    let schedBase = 0;
    let doneSchedBase = 0;
    let schedCount = 0;
    let doneSched = 0;
    let doneCount = 0;
    let habitXp = 0;
    for (const h of habits) {
      if (!habitExists(h, d)) continue;
      const base = diffXp(h.diff);
      const sched = isScheduled(h, d);
      const code = entries[h.id];
      if (sched) {
        schedBase += base;
        schedCount++;
      }
      if (code) {
        doneCount++;
        if (sched) {
          doneSchedBase += base;
          doneSched++;
        }
        habitXp += base;
      }
    }
    const todos = todosByDay[d] || 0;
    const active = doneCount > 0 || todos > 0;
    const completion = schedBase ? doneSchedBase / schedBase : active ? 1 : null;
    const computed = Math.min(
      100,
      Math.round((schedBase ? (100 * doneSchedBase) / schedBase : active ? 70 : 0) + 2 * Math.min(todos, 5))
    );
    const ai = review && typeof review.ai === "number" ? review.ai : null;
    const score = ai === null ? computed : Math.round((1 - RULES.reviewWeight) * computed + RULES.reviewWeight * ai);
    const chest = schedCount > 0 && doneSched === schedCount;
    const todoXp = RULES.todoXp * Math.min(todos, RULES.todoCap);
    const reviewXp = closed ? Math.round(score * RULES.reviewXpRate) : 0;
    const runMult = 1 + RULES.runBonus * Math.min(activeRun, RULES.runCap);
    const gain = Math.round((habitXp + todoXp + reviewXp + (chest ? RULES.chestXp : 0)) * runMult);

    let reset = false;
    if (closed) {
      const factor = active ? 1 - RULES.partialDecay * (1 - (completion ?? 1)) : RULES.inactiveKeep;
      M = M * factor + gain;
      if (active) {
        inactiveRun = 0;
        activeRun++;
      } else {
        inactiveRun++;
        activeRun = 0;
      }
      if (inactiveRun >= resetAfter) {
        if (M > 0) {
          reset = true;
          resets.push(d);
        }
        M = 0;
      }
    } else {
      M = M + gain;
    }

    for (const h of habits) {
      if (!habitExists(h, d)) {
        habitSeries[h.id].push({ day: d, m: null });
        continue;
      }
      const code = entries[h.id];
      const sched = isScheduled(h, d);
      if (code) {
        if (sched) hrun[h.id]++;
        hm[h.id] += diffXp(h.diff) * (1 + RULES.habitRunBonus * Math.min(Math.max(hrun[h.id] - 1, 0), RULES.runCap));
      } else if (sched && closed) {
        hm[h.id] *= RULES.habitMissKeep;
        hrun[h.id] = 0;
      }
      if (closed && inactiveRun >= resetAfter) hm[h.id] = 0;
      habitSeries[h.id].push({ day: d, m: Math.round(hm[h.id]) });
    }

    best = Math.max(best, M);
    const entry = {
      day: d,
      active,
      closed,
      completion,
      schedCount,
      doneSched,
      doneCount,
      todos,
      habitXp: Math.round(habitXp),
      todoXp,
      reviewXp,
      chest,
      computed,
      ai,
      reviewed: !!review,
      score,
      runMult,
      gain,
      momentum: Math.round(M),
      level: levelInfo(M).lvl,
      reset,
      inactiveRun,
    };
    days.push(entry);
    byDay[d] = entry;
  }

  const current = days[days.length - 1];
  return {
    days,
    byDay,
    habitSeries,
    resets,
    current,
    level: levelInfo(current ? current.momentum : 0),
    bestMomentum: Math.round(best),
    bestLevel: levelInfo(best).lvl,
    resetAfter,
  };
}

/** What closing today would add: an estimate shown before the evening review. */
export function pendingReviewGain(entry) {
  if (!entry || entry.closed) return 0;
  return Math.round(entry.computed * RULES.reviewXpRate * entry.runMult);
}

export function weekGain(timeline, today) {
  const from = mondayOf(today);
  return timeline.days.filter((d) => d.day >= from && d.day <= today).reduce((a, d) => a + d.gain, 0);
}

/** Days in the last 3 where momentum fell by at least `ratio` without a reset. */
export function momentumDrop(timeline, ratio = 0.3) {
  const closed = timeline.days.filter((d) => d.closed);
  if (closed.length < 4) return null;
  const now = closed[closed.length - 1];
  const before = closed[closed.length - 4];
  if (closed.slice(-3).some((d) => d.reset)) return null;
  if (before.momentum < 200) return null;
  const drop = (before.momentum - now.momentum) / before.momentum;
  return drop >= ratio ? { from: before.momentum, to: now.momentum, day: now.day } : null;
}

// ---------------------------------------------------------------- streaks

const streakActive = (state, d) => {
  const e = state.log?.[d];
  return (e && Object.keys(e).length > 0) || !!state.streak?.revived?.[d];
};

export function streakInfo(state, today) {
  const todayDone = streakActive(state, today);
  let current = 0;
  for (let d = todayDone ? today : addDays(today, -1); streakActive(state, d); d = addDays(d, -1)) current++;
  let best = 0;
  let run = 0;
  for (let d = firstDay(state, today); d <= today; d = addDays(d, 1)) {
    run = streakActive(state, d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), todayDone };
}

/**
 * Revives restore a broken streak. One revive covers one missed day; the
 * offer stands on the day after the miss (two missed days need two revives).
 */
export function reviveInfo(state, today) {
  const revived = state.streak?.revived || {};
  const month = today.slice(0, 7);
  const used = Object.values(revived).filter((usedOn) => String(usedOn).slice(0, 7) === month).length;
  const left = Math.max(0, RULES.revivesPerMonth - used);
  const start = state.meta?.start || today;

  const gap = [];
  let d = addDays(today, -1);
  while (gap.length < 3 && d >= start && !streakActive(state, d)) {
    gap.push(d);
    d = addDays(d, -1);
  }
  if (gap.length === 0 || gap.length > 2 || d < start) return { left, used, offer: null };
  let before = 0;
  for (let k = d; k >= start && streakActive(state, k); k = addDays(k, -1)) before++;
  if (before < 2) return { left, used, offer: null };
  return { left, used, offer: { days: gap.reverse(), streakBefore: before, affordable: gap.length <= left } };
}

// ---------------------------------------------------------------- companion

export const STAGES = [
  { id: "egg", name: "Ou", min: 0 },
  { id: "hatchling", name: "Pui", min: 3 },
  { id: "apprentice", name: "Ucenic", min: 15 },
  { id: "adept", name: "Adept", min: 45 },
  { id: "master", name: "Maestru", min: 105 },
  { id: "legend", name: "Legendă", min: 210 },
];

/** The companion grows from check-ins: each one earns the habit's difficulty in points (1, 2 or 3). */
export function evolutionPoints(state) {
  const diff = Object.fromEntries((state.habits || []).map((h) => [h.id, h.diff]));
  let ep = 0;
  let checkins = 0;
  for (const entries of Object.values(state.log || {})) {
    for (const [habitId, code] of Object.entries(entries)) {
      if (!code) continue;
      ep += diffEp(diff[habitId]);
      checkins++;
    }
  }
  return { ep, checkins };
}

export function stageFor(ep) {
  let i = 0;
  while (i + 1 < STAGES.length && ep >= STAGES[i + 1].min) i++;
  const stage = STAGES[i];
  const next = STAGES[i + 1] || null;
  return { stage, index: i, next, progress: next ? (ep - stage.min) / (next.min - stage.min) : 1 };
}

/** Moods: "sleep" while the player is away, "joy" on the day they come back. */
export function companionInfo(state, timeline, today) {
  const { ep, checkins } = evolutionPoints(state);
  const { stage, index, next, progress } = stageFor(ep);
  const todayEntry = timeline.byDay[today];
  const yesterday = timeline.byDay[addDays(today, -1)];
  const todayActive = !!todayEntry?.active;
  let lastActive = null;
  for (let i = timeline.days.length - 2; i >= 0; i--) {
    if (timeline.days[i].active) {
      lastActive = timeline.days[i].day;
      break;
    }
  }
  const awayDays = lastActive ? diffDays(lastActive, today) - 1 : null;
  let mood = "idle";
  if (todayActive && awayDays !== null && awayDays >= 1) mood = "joy";
  else if (!todayActive && yesterday && !yesterday.active) mood = "sleep";
  else if (todayEntry && todayEntry.schedCount > 0 && todayEntry.doneSched === todayEntry.schedCount) mood = "happy";
  return {
    ep,
    checkins,
    stage,
    stageIndex: index,
    next,
    progress,
    mood,
    awayDays,
    lastActive,
    path: state.profile?.path || "sport",
    name: state.companion?.name || "",
  };
}

// ---------------------------------------------------------------- per habit

export function habitStats(h, state, timeline, today, window = 30) {
  const log = state.log || {};
  let sched = 0;
  let done = 0;
  let total = 0;
  for (let i = 0; i < window; i++) {
    const d = addDays(today, -i);
    if (d === today && !log[d]?.[h.id]) continue; // today still open
    if (isScheduled(h, d)) {
      sched++;
      if (log[d]?.[h.id]) done++;
    }
  }
  let run = 0;
  let bestRun = 0;
  let cur = 0;
  const days = Object.keys(log).sort();
  for (const d of days) {
    const code = log[d][h.id];
    if (code) total++;
  }
  for (let d = h.createdAt || today; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (log[d]?.[h.id]) {
      cur++;
      bestRun = Math.max(bestRun, cur);
    } else if (d < today) cur = 0;
  }
  run = cur;
  const series = timeline.habitSeries[h.id] || [];
  const last = series.length ? series[series.length - 1].m || 0 : 0;
  return { rate: sched ? done / sched : null, sched, done, run, bestRun, total, momentum: last };
}
