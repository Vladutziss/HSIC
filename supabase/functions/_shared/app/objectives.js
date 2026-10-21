// Obiective: the big goals a player works towards over weeks or months.
//
//   state.objectives = [{
//     id, title, why, reward, icon, color, cat,
//     start: "YYYY-MM-DD", deadline: "YYYY-MM-DD" | null,
//     doneOn: "YYYY-MM-DD" | null, archived: false,
//     habitIds: [habit id],                      // habits that feed this goal
//     metric: { unit, start, target, value } | null,   // optional number to move (kg, pagini, lei…)
//     steps: [{ id, title, done, doneOn, date, todoId, subs: [{ id, title, done, doneOn }] }],
//     reminder: { on, days: [0-6, Sunday = 0], time: "HH:MM" },
//     log: [{ id, day, text, kind: "note" | "metric" | "step" | "done" }],   // newest last
//     seenMarks: [25, 50, ...]                   // progress milestones already celebrated
//   }]
//
// Kept in profiles.extra (no migration). Ticked steps and sub-steps count for momentum like to-dos
// (engine.js reads stepDoneDays). Everything here is pure, so it is tested in tests/objectives.test.mjs.

import { addDays, diffDays, weekday } from "./dates.js";
import { tr } from "./i18n.js";

export const MAX_OBJECTIVES = 6;
export const MAX_STEPS = 30;
export const MAX_SUBS = 12;
export const MARKS = [25, 50, 75, 100];

/** 0..1 for one step: a step with sub-steps is as done as its sub-steps are. */
export function stepProgress(step) {
  const subs = step.subs || [];
  if (step.done) return 1;
  if (!subs.length) return 0;
  return subs.filter((s) => s.done).length / subs.length;
}

function metricProgress(m) {
  if (!m || m.target == null || m.start == null || m.target === m.start) return null;
  const v = m.value ?? m.start;
  return Math.max(0, Math.min(1, (v - m.start) / (m.target - m.start)));
}

/**
 * Overall progress 0..1. Steps and the number weigh the same when both exist;
 * a goal marked done is 1 whatever its parts say.
 */
export function progress(o) {
  if (o.doneOn) return 1;
  const steps = o.steps || [];
  const parts = [];
  if (steps.length) parts.push(steps.reduce((a, s) => a + stepProgress(s), 0) / steps.length);
  const mp = metricProgress(o.metric);
  if (mp != null) parts.push(mp);
  if (!parts.length) return 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export const pct = (o) => Math.round(progress(o) * 100);

/** First unfinished step (and its first unfinished sub-step): what to do next. */
export function nextStep(o) {
  for (const s of o.steps || []) {
    if (s.done) continue;
    const sub = (s.subs || []).find((x) => !x.done) || null;
    return { step: s, sub };
  }
  return null;
}

/**
 * Pace against the deadline: compares progress with the share of time used.
 *   { daysLeft, timeShare, status: "done" | "none" | "ahead" | "ontrack" | "behind" | "late" }
 */
export function pace(o, today) {
  if (o.doneOn) return { status: "done", daysLeft: null, timeShare: null };
  if (!o.deadline) return { status: "none", daysLeft: null, timeShare: null };
  const daysLeft = diffDays(today, o.deadline);
  if (daysLeft < 0) return { status: "late", daysLeft, timeShare: 1 };
  const total = Math.max(1, diffDays(o.start, o.deadline));
  const timeShare = Math.max(0, Math.min(1, diffDays(o.start, today) / total));
  const p = progress(o);
  const status = p >= timeShare + 0.1 ? "ahead" : p >= timeShare - 0.1 ? "ontrack" : "behind";
  return { status, daysLeft, timeShare };
}

/** Days on which anything moved: a step or sub-step ticked, a note, a new number. */
export function activeDays(o) {
  const days = new Set();
  for (const s of o.steps || []) {
    if (s.done && s.doneOn) days.add(s.doneOn);
    for (const x of s.subs || []) if (x.done && x.doneOn) days.add(x.doneOn);
  }
  for (const e of o.log || []) days.add(e.day);
  return days;
}

/** Days since the goal last moved (since it started when it never did). */
export function idleDays(o, today) {
  const days = [...activeDays(o)].filter((d) => d <= today).sort();
  const last = days.length ? days[days.length - 1] : o.start;
  return Math.max(0, diffDays(last, today));
}

/** Consecutive days, ending today or yesterday, on which the goal moved. */
export function goalStreak(o, today) {
  const days = activeDays(o);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Activity of the last `n` days, oldest first: [{ day, count }]. */
export function recentActivity(o, today, n = 14) {
  const counts = {};
  for (const s of o.steps || []) {
    if (s.done && s.doneOn) counts[s.doneOn] = (counts[s.doneOn] || 0) + 1;
    for (const x of s.subs || []) if (x.done && x.doneOn) counts[x.doneOn] = (counts[x.doneOn] || 0) + 1;
  }
  for (const e of o.log || []) counts[e.day] = (counts[e.day] || 0) + (e.kind === "step" ? 0 : 1);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - n + 1);
    return { day, count: counts[day] || 0 };
  });
}

/**
 * Reminders due today for open goals: a reminder fires on its weekdays once its time has passed,
 * unless the goal already moved today. A goal idle for `idleAfter` days nudges on its own.
 *   [{ o, reason: "scheduled" | "idle", idle }]
 */
export function dueReminders(objectives, today, nowMin, idleAfter = 4) {
  const out = [];
  for (const o of objectives || []) {
    if (o.doneOn || o.archived) continue;
    if (activeDays(o).has(today)) continue;
    const r = o.reminder;
    const idle = idleDays(o, today);
    if (r?.on && (r.days || []).includes(weekday(today))) {
      const [h, m] = (r.time || "09:00").split(":").map(Number);
      if (nowMin >= h * 60 + m) {
        out.push({ o, reason: "scheduled", idle });
        continue;
      }
    }
    if (idle >= idleAfter) out.push({ o, reason: "idle", idle });
  }
  return out;
}

/** Progress milestones crossed and not celebrated yet. */
export function newMarks(o) {
  const p = pct(o);
  const seen = new Set(o.seenMarks || []);
  return MARKS.filter((m) => p >= m && !seen.has(m));
}

/** Days with ticked steps or sub-steps across all goals (each tick counts), for the engine. */
export function stepDoneDays(objectives) {
  const out = [];
  for (const o of objectives || []) {
    for (const s of o.steps || []) {
      // a step whose sub-steps are all ticked was finished by them: count the sub-steps, not the step again
      if (s.done && s.doneOn && !(s.subs || []).length) out.push(s.doneOn);
      for (const x of s.subs || []) if (x.done && x.doneOn) out.push(x.doneOn);
    }
  }
  return out;
}

// ------------------------------------------------------------ edits (all return a new goal)

const tick = (item, done, today) => ({ ...item, done, doneOn: done ? today : null });

/** Ticks a step; ticking it ticks its sub-steps too, unticking leaves them. */
export function toggleStep(o, stepId, today) {
  return {
    ...o,
    steps: (o.steps || []).map((s) => {
      if (s.id !== stepId) return s;
      const done = !s.done;
      return { ...tick(s, done, today), subs: done ? (s.subs || []).map((x) => (x.done ? x : tick(x, true, today))) : s.subs || [] };
    }),
  };
}

/** Ticks a sub-step; the step follows: done when all its sub-steps are, open otherwise. */
export function toggleSub(o, stepId, subId, today) {
  return {
    ...o,
    steps: (o.steps || []).map((s) => {
      if (s.id !== stepId) return s;
      const subs = (s.subs || []).map((x) => (x.id === subId ? tick(x, !x.done, today) : x));
      const all = subs.length > 0 && subs.every((x) => x.done);
      return { ...s, subs, done: all, doneOn: all ? s.doneOn || today : null };
    }),
  };
}

export function moveStep(o, stepId, dir) {
  const steps = [...(o.steps || [])];
  const i = steps.findIndex((s) => s.id === stepId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= steps.length) return o;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  return { ...o, steps };
}

export const statusLabel = {
  done: tr("Atins"),
  none: tr("Fără termen"),
  ahead: tr("Înaintea planului"),
  ontrack: tr("Pe drumul bun"),
  behind: tr("Puțin în urmă"),
  late: tr("Termen depășit"),
};

/** Ideas to start from, per path. */
export const TEMPLATES = [
  {
    id: "olimpiada",
    title: tr("Medalie la olimpiadă"),
    icon: "sigma",
    why: tr("Vreau să văd cât de departe pot ajunge când muncesc constant."),
    steps: [tr("Programa și subiectele din ultimii 5 ani"), tr("Câte o problemă grea pe zi"), tr("Simulări cu cronometru"), tr("Recapitularea greșelilor")],
  },
  {
    id: "carte",
    title: tr("Citesc 12 cărți anul acesta"),
    icon: "book",
    why: tr("Vreau să gândesc mai limpede și să am din ce să învăț."),
    metric: { unit: tr("cărți"), start: 0, target: 12 },
    steps: [tr("Lista celor 12 cărți"), tr("20 de pagini pe zi")],
  },
  {
    id: "alergare",
    title: tr("Alerg primii 10 km"),
    icon: "footprints",
    why: tr("Vreau să am energie și să-mi demonstrez că pot."),
    metric: { unit: "km", start: 0, target: 10 },
    steps: [tr("3 ieșiri pe săptămână"), tr("Creștem distanța cu 10% pe săptămână"), tr("Cursa de test")],
  },
  {
    id: "economii",
    title: tr("Fond de urgență"),
    icon: "coins",
    why: tr("Liniște: să nu mă sperie o cheltuială neprevăzută."),
    metric: { unit: tr("lei"), start: 0, target: 5000 },
    steps: [tr("Bugetul lunii"), tr("Transfer automat la salariu"), tr("Taie 2 abonamente inutile")],
  },
  {
    id: "proiect",
    title: tr("Lansez un proiect personal"),
    icon: "rocket",
    why: tr("Vreau ceva construit de mine, pe care să-l arăt."),
    steps: [tr("Ideea într-o pagină"), tr("Prima versiune funcțională"), tr("Feedback de la 5 oameni"), tr("Lansare")],
  },
];

/**
 * To-dos that came from a goal, by to-do id: { label, color }. Built from the goals themselves
 * (Obiective steps' todoId, Scopuri todoIds), so it survives storage that keeps no extra to-do fields.
 */
export function goalTodoIndex(state) {
  const out = {};
  for (const o of state?.objectives || []) {
    for (const s of o.steps || []) if (s.todoId) out[s.todoId] = { label: o.title, color: o.color, oid: o.id, sid: s.id };
  }
  for (const g of state?.goals || []) for (const id of g.todoIds || []) if (!out[id]) out[id] = { label: g.text, color: null, gid: g.id };
  return out;
}
