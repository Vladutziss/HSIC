// To-dos, including repeating ones. A repeating to-do is one record, a series:
//
//   { id, title, date (first day), time, dur, habitId,
//     repeat: { kind: "daily" | "weekly" | "days", days: [0-6, Sunday = 0], until: "YYYY-MM-DD" | null },
//     doneDays: ["YYYY-MM-DD", ...] }   // the days whose occurrence is ticked
//
// A to-do that does not repeat keeps `done` / `doneOn`. Screens that list to-dos for a given day
// ask for a "view" of each one (below), so they can keep reading `t.done` and `t.date`.

import { RO_DAYS, RO_DAYS_MIN, addDays, fmtDay, weekday } from "./dates.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The days of the week a repeat covers, from what the editor collects. */
export function repeatDays(kind, startDate, picked = []) {
  if (kind === "daily") return ALL_DAYS;
  if (kind === "weekly") return [weekday(startDate)];
  return [...new Set(picked)].sort((a, b) => a - b);
}

export function makeRepeat(kind, startDate, picked, until) {
  if (!kind || kind === "none" || !startDate) return null;
  const days = repeatDays(kind, startDate, picked);
  if (!days.length) return null;
  return { kind, days, until: until && until >= startDate ? until : null };
}

export function occursOn(t, day) {
  if (!t.date) return false;
  if (!t.repeat) return t.date === day;
  return day >= t.date && (!t.repeat.until || day <= t.repeat.until) && t.repeat.days.includes(weekday(day));
}

export const isDoneOn = (t, day) => (t.repeat ? (t.doneDays || []).includes(day) : !!t.done);

/** The first day in [from, to] the to-do occurs on, or null. */
export function firstOccurrence(t, from, to) {
  if (!t.repeat) return t.date && t.date >= from && t.date <= to ? t.date : null;
  for (let d = from < t.date ? t.date : from; d <= to; d = addDays(d, 1)) if (occursOn(t, d)) return d;
  return null;
}

/** A to-do as it looks on one day: a series gets that day's date and done state. */
export function viewOn(t, day) {
  if (!t.repeat) return t;
  const done = isDoneOn(t, day);
  return { ...t, date: day, done, doneOn: done ? day : null, viewDay: day };
}

/** day -> to-dos (as views) that fall on it, for every day in [from, to]. */
export function todosByDay(todos, from, to) {
  const out = {};
  for (const t of todos || []) {
    if (!t.date) continue;
    if (!t.repeat) {
      if (t.date >= from && t.date <= to) (out[t.date] ||= []).push(t);
      continue;
    }
    for (let d = from < t.date ? t.date : from; d <= to; d = addDays(d, 1)) if (occursOn(t, d)) (out[d] ||= []).push(viewOn(t, d));
  }
  return out;
}

/** Everything the player should see for one day: that day's items plus unfinished ones from before. */
export function todosForToday(todos, today) {
  const out = [];
  for (const t of todos || []) {
    if (t.repeat) {
      if (occursOn(t, today)) out.push(viewOn(t, today));
    } else if ((t.date === today && (!t.done || t.doneOn === today)) || (!t.done && t.date && t.date < today)) out.push(t);
  }
  return out;
}

export function toggleDone(t, day) {
  if (t.repeat) {
    const days = t.doneDays || [];
    return { ...t, doneDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort() };
  }
  return { ...t, done: !t.done, doneOn: t.done ? null : day };
}

export function repeatLabel(r) {
  if (!r) return "";
  let base;
  if (r.kind === "daily" || r.days.length === 7) base = "Zilnic";
  else if (r.kind === "weekly") base = `În fiecare ${RO_DAYS[r.days[0]]}`;
  else base = WEEK_ORDER.filter((d) => r.days.includes(d)).map((d) => RO_DAYS_MIN[d]).join(" ");
  return r.until ? `${base} · până pe ${fmtDay(r.until)}` : base;
}
