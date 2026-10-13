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

/**
 * Unfinished goals of the previous period, which the player can carry into this one. A milestone parent comes
 * right before its own unfinished children (so a set stays together); children of a parent that is not carried
 * (done, dropped or already here) are carried flat when open, as before.
 */
export function carryable(goals, period, key) {
  const here = new Set(goalsFor(goals, period, key).map((g) => g.text.trim().toLowerCase()));
  const prev = goalsFor(goals, period, previousKey(period, key));
  const ids = new Set(prev.map((g) => g.id));
  const open = prev.filter((g) => !g.done && g.status !== "dropped");
  const fresh = (g) => !here.has(g.text.trim().toLowerCase());
  const isChild = (g) => g.parentId && ids.has(g.parentId);
  const out = [];
  for (const g of open) {
    if (isChild(g) && open.some((p) => p.id === g.parentId)) continue; // goes with its parent
    if (!fresh(g)) continue;
    out.push(g, ...open.filter((c) => c.parentId === g.id));
  }
  return out;
}

/** Copies of `list` for a new period: new ids, parentId remapped to the copied parent (dropped when the parent is not in the list). */
export function carryCopies(list, period, key, today, mkId) {
  const ids = new Map(list.map((g) => [g.id, mkId()]));
  return list.map((g) => ({
    id: ids.get(g.id),
    period,
    key,
    text: g.text,
    done: false,
    doneOn: null,
    createdAt: today,
    ...(g.criteria ? { criteria: g.criteria } : {}),
    ...(g.parentId && ids.has(g.parentId) ? { parentId: ids.get(g.parentId) } : {}),
  }));
}
