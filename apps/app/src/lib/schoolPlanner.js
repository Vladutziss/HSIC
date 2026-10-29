import { addDays, diffDays } from "./dates.js";

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

/** Not done and past their deadline, the most overdue first; `daysLate` counts local calendar days (1 = yesterday). nextAssignments leaves these out, so the card shows them apart. */
export function overdueAssignments(state, today) {
  return schoolPlanner(state)
    .assignments.filter((a) => !a.done && a.due && a.due < today)
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((a) => ({ ...a, daysLate: diffDays(a.due, today) }));
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

// ------------------------------------------------------------ writing (the Acasă card; no AI involved)
// These take the current `schoolPlanner` object and return the next one, so the screen only calls onStateChange.

/** A new assignment or exam typed by the student. `kind` is "assignment" or "exam"; returns the planner unchanged for an empty title. */
export function addSchoolItem(planner, kind, raw, today, id = `${kind === "exam" ? "e" : "a"}-${Date.now()}`) {
  const p = { ...planner, assignments: planner.assignments || [], exams: planner.exams || [], sessions: planner.sessions || [] };
  if (kind === "exam") {
    const exam = normalizeExams([raw], today)[0];
    return exam ? { ...p, exams: [...p.exams, { ...exam, id, done: false }] } : planner;
  }
  const a = normalizeAssignments([raw], today)[0];
  return a ? { ...p, assignments: [...p.assignments, { ...a, id, done: false }] } : planner;
}

/** Ticks (or unticks) one assignment or exam by id. */
export function setSchoolDone(planner, kind, id, done) {
  const key = kind === "exam" ? "exams" : "assignments";
  return { ...planner, [key]: (planner[key] || []).map((x) => (x.id === id ? { ...x, done: !!done } : x)) };
}

/** Deletes one assignment or exam by id (a typo, a test that was cancelled); logged study blocks stay. */
export function removeSchoolItem(planner, kind, id) {
  const key = kind === "exam" ? "exams" : "assignments";
  return { ...planner, [key]: (planner[key] || []).filter((x) => x.id !== id) };
}

/** One logged study block against a subject / assignment; unchanged when the minutes are not valid. */
export function addStudySession(planner, raw, today, id = `s-${Date.now()}`) {
  const s = normalizeSession(raw, today);
  return s ? { ...planner, sessions: [...(planner.sessions || []), { ...s, id }] } : planner;
}

/** The seven days ending today: minutes per day and per subject (blank subjects count as "no subject"), for Progres. */
export function studyWeek(state, today) {
  const sessions = schoolPlanner(state).sessions;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    days.push({ day, minutes: sessions.filter((s) => s.day === day).reduce((n, s) => n + (Number(s.minutes) || 0), 0) });
  }
  const from = days[0].day;
  const subjects = new Map();
  for (const s of sessions) {
    if (s.day < from || s.day > today) continue;
    const name = String(s.subject || "").trim();
    subjects.set(name, (subjects.get(name) || 0) + (Number(s.minutes) || 0));
  }
  const bySubject = [...subjects.entries()].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes);
  return { total: days.reduce((n, d) => n + d.minutes, 0), days, bySubject };
}

// ------------------------------------------------------------ exam preparation plan
// Study blocks spread over the days before an exam instead of one evening, the last one a self-test. The two ideas are the
// ones Dunlosky et al. (2013) rated highest (distributed practice and practice testing); see knowledge/dunlosky-2013.md.
// No AI: the dates come from the exam date, the titles from the subject the student typed.

export const PLAN_MAX_SESSIONS = 5;

/**
 * Sessions from today up to the day before the exam: `{ i, n, date, last }`, evenly spaced, at most PLAN_MAX_SESSIONS.
 * Fewer than two free days (exam today, tomorrow or past) gives an empty plan.
 */
export function examPlan(exam, today) {
  if (!exam?.date || !DATE.test(exam.date)) return [];
  const free = diffDays(today, exam.date); // today .. the day before the exam
  if (free < 2) return [];
  const n = Math.min(PLAN_MAX_SESSIONS, free);
  return Array.from({ length: n }, (_, i) => ({ i: i + 1, n, date: addDays(today, n === 1 ? 0 : Math.round((i * (free - 1)) / (n - 1))), last: i === n - 1 }));
}

/** The plan as to-do drafts (no id): `title(session)` builds the text so the screen can translate it. Skips a to-do that already exists on that day. */
export function examPlanTodos(exam, today, existing, title, dur = 45) {
  const have = new Set((existing || []).map((t) => `${t.date}|${t.title}`));
  return examPlan(exam, today)
    .map((s) => ({ title: title(s), date: s.date, dur }))
    .filter((t) => !have.has(`${t.date}|${t.title}`));
}
