import { diffDays } from "./dates.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function schoolPlanner(state) {
  const p = state?.schoolPlanner || {};
  return { ...p, assignments: p.assignments || [], exams: p.exams || [], sessions: p.sessions || [] };
}

export function normalizeAssignments(raw, today) {
  return (Array.isArray(raw) ? raw : [])
    .map((a) => ({
      title: String(a?.title || "").trim().slice(0, 120),
      subject: String(a?.subject || "").trim().slice(0, 60),
      due: DATE.test(a?.due) ? a.due : today,
      estimatedMinutes: Math.max(10, Math.min(600, Math.round(Number(a?.estimatedMinutes) || 30))),
    }))
    .filter((a) => a.title);
}

export function nextAssignments(state, today) {
  return schoolPlanner(state).assignments
    .filter((a) => !a.done && (!a.due || a.due >= today))
    .sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
}

/** AI/user exams -> {title, subject, date}; `date` may arrive as `due` (parseHomework items). A missing date falls back to today. */
export function normalizeExams(raw, today) {
  return (Array.isArray(raw) ? raw : [])
    .map((e) => ({
      title: String(e?.title || "").trim().slice(0, 120),
      subject: String(e?.subject || "").trim().slice(0, 60),
      date: DATE.test(e?.date) ? e.date : DATE.test(e?.due) ? e.due : today,
    }))
    .filter((e) => e.title);
}

/** Not done and not past, nearest first; `daysLeft` counts local calendar days (0 = today). */
export function nextExams(state, today) {
  return schoolPlanner(state)
    .exams.filter((e) => !e.done && e.date && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ ...e, daysLeft: diffDays(today, e.date) }));
}

/** One logged study block; minutes are bounded like the table check (1..1440). `day` is a local day. */
export function normalizeSession(raw, today) {
  const minutes = Math.round(Number(raw?.minutes));
  if (!(minutes >= 1)) return null;
  return {
    subject: String(raw?.subject || "").trim().slice(0, 60),
    assignmentId: raw?.assignmentId || null,
    day: DATE.test(raw?.day) ? raw.day : today,
    minutes: Math.min(1440, minutes),
  };
}

/** Minutes studied on a day, optionally for one subject (case-insensitive). */
export function studiedMinutes(state, day, subject) {
  const key = subject && String(subject).trim().toLowerCase();
  return schoolPlanner(state)
    .sessions.filter((s) => s.day === day && (!key || String(s.subject || "").trim().toLowerCase() === key))
    .reduce((n, s) => n + (Number(s.minutes) || 0), 0);
}
