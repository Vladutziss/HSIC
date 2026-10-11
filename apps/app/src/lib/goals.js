// Goals for the week or the month: a short list the player writes down and ticks off.
//   state.goals = [{ id, period: "week" | "month", key, text, done, doneOn, createdAt }]
// key names the period: the Monday ("YYYY-MM-DD") for a week, "YYYY-MM" for a month.
// They are plain notes: no momentum, no engine rules. Stored in profiles.extra, so no migration.

import { addDays, fmtDay, fmtMonth, mondayOf } from "./dates.js";

export const MAX_PER_PERIOD = 7; // a short list is one that gets done
export const MAX_TEXT = 120;

export const periodKey = (period, day) => (period === "week" ? mondayOf(day) : day.slice(0, 7));

/** The period before the one `key` names. */
export function previousKey(period, key) {
  if (period === "week") return addDays(key, -7);
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const goalsFor = (goals, period, key) => (goals || []).filter((g) => g.period === period && g.key === key);

export function periodLabel(period, key) {
  return period === "week" ? `${fmtDay(key)} – ${fmtDay(addDays(key, 6))}` : fmtMonth(key);
}

/** Unfinished goals of the previous period, which the player can carry into this one. */
export function carryable(goals, period, key) {
  const here = new Set(goalsFor(goals, period, key).map((g) => g.text.trim().toLowerCase()));
  return goalsFor(goals, period, previousKey(period, key)).filter((g) => !g.done && !here.has(g.text.trim().toLowerCase()));
}
