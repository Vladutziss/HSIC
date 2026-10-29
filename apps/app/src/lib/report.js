// The monthly report: what one month of the student's own data adds up to, as a plain object the screen draws and prints.
// Pure: it takes the state, the day entries of the timeline (stats.days) and today. Nothing here is written by AI and
// nothing leaves the device: the student decides whom to show it to (print or save as PDF).

import { addDays, dayKey, diffDays } from "./dates.js";
import { isScheduled } from "./engine.js";
import { focusMinutes, schoolPlanner } from "./schoolPlanner.js";

const pad = (n) => String(n).padStart(2, "0");

/** "2026-10" -> its first day and its last day. */
export function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { first, last: addDays(next, -1) };
}

/** The previous or next month key, `step` months away. */
export function shiftMonth(ym, step) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + step;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Longest run of consecutive active days in a list of day entries (already in date order). */
function longestRun(entries) {
  let best = 0;
  let cur = 0;
  for (const e of entries) {
    cur = e.active ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/**
 * `days` is stats.days (the timeline, one entry per day since the first one). Months before the first entry or after
 * today give an empty report (`empty: true`); a month still running covers the days up to today.
 */
export function monthReport(state, days, ym, today) {
  const { first, last } = monthBounds(ym);
  const to = last < today ? last : today;
  if (first > today || !days?.length) return { ym, from: first, to: first, empty: true };
  const inMonth = days.filter((d) => d.day >= first && d.day <= to);
  const closed = inMonth.filter((d) => d.closed);

  const sched = closed.reduce((n, d) => n + (d.schedCount || 0), 0);
  const done = closed.reduce((n, d) => n + (d.doneSched || 0), 0);

  // habits: ticks in the month and, against the days they were scheduled, the rate (today still open is not a miss)
  const log = state.log || {};
  const habits = (state.habits || [])
    .map((h) => {
      let scheduled = 0;
      let hits = 0;
      let ticks = 0;
      for (let d = first; d <= to; d = addDays(d, 1)) {
        const ticked = !!log[d]?.[h.id];
        if (ticked) ticks++;
        if (!isScheduled(h, d) || (d === today && !ticked)) continue;
        scheduled++;
        if (ticked) hits++;
      }
      return { id: h.id, name: h.name, ticks, scheduled, rate: scheduled ? hits / scheduled : null };
    })
    .filter((h) => h.ticks > 0 || h.scheduled > 0)
    .sort((a, b) => b.ticks - a.ticks || b.scheduled - a.scheduled)
    .slice(0, 6);

  // study: the blocks logged in the month and the Focus time, by subject (Focus has none)
  const plan = schoolPlanner(state);
  const subjects = new Map();
  let logged = 0;
  const studyDays = new Set();
  for (const s of plan.sessions) {
    if (s.day < first || s.day > to) continue;
    const minutes = Number(s.minutes) || 0;
    logged += minutes;
    if (minutes > 0) studyDays.add(s.day);
    const name = String(s.subject || "").trim();
    if (name) subjects.set(name, (subjects.get(name) || 0) + minutes);
  }
  let focus = 0;
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const f = focusMinutes(state, d);
    focus += f;
    if (f > 0) studyDays.add(d);
  }
  const focusCount = (state.focusSessions || []).filter((f) => f?.start && dayKey(new Date(f.start)) >= first && dayKey(new Date(f.start)) <= to).length;

  const exams = plan.exams
    .filter((e) => e.date && e.date >= first && e.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ title: e.title, subject: e.subject || "", date: e.date, done: !!e.done, past: e.date < today }));
  const dueHere = plan.assignments.filter((a) => a.due && a.due >= first && a.due <= last);

  const report = {
    ym,
    from: first,
    to,
    empty: false,
    elapsed: Math.max(1, diffDays(first > days[0].day ? first : days[0].day, to) + 1), // from the first day of use when it began mid-month
    activeDays: new Set([...inMonth.filter((d) => d.active).map((d) => d.day), ...studyDays]).size, // a day of study alone counts
    bestRun: longestRun(inMonth.map((d) => ({ active: d.active || studyDays.has(d.day) }))),
    todosDone: inMonth.reduce((n, d) => n + (d.todos || 0), 0),
    gain: inMonth.reduce((n, d) => n + (d.gain || 0), 0),
    avgScore: closed.length ? Math.round(closed.reduce((n, d) => n + d.score, 0) / closed.length) : null,
    sched,
    done,
    rate: sched ? done / sched : null,
    momentumPeak: inMonth.reduce((n, d) => Math.max(n, d.momentum || 0), 0),
    momentumEnd: inMonth.length ? inMonth[inMonth.length - 1].momentum : 0,
    levelEnd: inMonth.length ? inMonth[inMonth.length - 1].level : null,
    habits,
    study: {
      logged,
      focus,
      total: logged + focus,
      days: studyDays.size,
      bySubject: [...subjects.entries()].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 6),
    },
    focusCount,
    exams,
    assignments: { due: dueHere.length, done: dueHere.filter((a) => a.done).length },
  };
  report.empty = report.activeDays === 0 && report.study.total === 0 && exams.length === 0 && dueHere.length === 0;
  return report;
}
