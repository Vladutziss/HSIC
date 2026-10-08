// Everything the screens show, derived from the stored state for one day.

import {
  DIFF,
  RULES,
  companionInfo,
  computeTimeline,
  diffXp,
  habitExists,
  isScheduled,
  pendingReviewGain,
  reviveInfo,
  streakInfo,
  weekGain,
} from "./engine.js";
import { addDays } from "./dates.js";

export function activeHabits(state, day) {
  return (state.habits || []).filter((h) => habitExists(h, day));
}

export function derive(state, today) {
  const timeline = computeTimeline(state, today);
  const streak = streakInfo(state, today);
  const revive = reviveInfo(state, today);
  const companion = companionInfo(state, timeline, today);
  const entry = timeline.byDay[today];
  const yesterday = timeline.byDay[addDays(today, -1)];
  const habits = activeHabits(state, today);
  const plan = habits.map((h) => ({ h, scheduled: isScheduled(h, today), code: state.log?.[today]?.[h.id] || 0 }));
  const scheduled = plan.filter((p) => p.scheduled);
  const optional = plan.filter((p) => !p.scheduled);
  const doneScheduled = scheduled.filter((p) => p.code).length;
  const week = weekGain(timeline, today);
  const resetAfter = timeline.resetAfter;
  const quiet = yesterday ? yesterday.inactiveRun : 0;
  const resetRisk = !entry?.active && quiet >= resetAfter - 1 && (yesterday?.momentum || 0) > 0;
  const level = timeline.level;
  const runMult = entry?.runMult || 1;

  const publicStats = {
    nick: state.profile?.nick || "",
    path: state.profile?.path || "sport",
    stage: companion.stage.id,
    mood: companion.mood,
    level: level.lvl,
    levelName: level.name,
    momentum: entry?.momentum || 0,
    weekGain: week,
    streak: streak.current,
    todayDone: doneScheduled,
    todayTotal: scheduled.length,
  };

  return {
    today,
    timeline,
    entry,
    streak,
    revive,
    companion,
    plan,
    scheduled,
    optional,
    doneScheduled,
    week,
    pending: pendingReviewGain(entry),
    resetRisk,
    quietDays: quiet,
    resetAfter,
    level,
    runMult,
    publicStats,
  };
}

/** Momentum a check-in adds right now, before the evening review. */
export const checkInGain = (h, runMult) => Math.round(diffXp(h.diff) * runMult);

export function reviewPayload(state, d, day) {
  const log = state.log?.[day] || {};
  const habits = activeHabits(state, day).map((h) => ({
    name: h.name,
    diff: h.diff,
    diffLabel: DIFF[h.diff]?.label || "Mediu",
    scheduled: isScheduled(h, day),
    done: !!log[h.id],
  }));
  const dayTodos = (state.todos || []).filter((t) => t.date === day || t.doneOn === day);
  const done = dayTodos.filter((t) => t.done && t.doneOn === day);
  return {
    day,
    name: state.profile?.nick,
    goal: state.profile?.goal,
    pathId: state.profile?.path,
    habits,
    todos: { done: done.length, total: dayTodos.length, titles: done.map((t) => t.title) },
    level: d.level,
    momentum: d.timeline.byDay[day]?.momentum ?? 0,
    streak: d.streak.current,
  };
}

export const REVIVES_PER_MONTH = RULES.revivesPerMonth;
