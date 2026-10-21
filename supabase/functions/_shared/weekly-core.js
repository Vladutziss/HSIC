// Deterministic decision core of the coach's weekly run (Sunday evening). No LLM, no I/O, no Deno APIs:
// given the player's state and the statistics already computed (analyzePatterns), decide which actions
// to log for next week (Monday..Sunday after `today`), split into 'auto' (reversible, low risk: a to-do)
// and 'confirm' (changes the plan: needs the player's tap). Every action is explainable from numbers.
//
// Rules:
//   1 weak_weekday_prompt   auto/create_todo: weekday finding, direction 'lower', strength moderate|strong, habit
//                           scheduled that weekday next week -> one 10-min to-do the day before, asking for an if-then plan.
//                           Max `maxTodos`; never a duplicate of an open to-do (same title+date), never a past date.
//   2 repeat_miss_downshift confirm/change_habit: miss_dynamics finding with P(miss | previous missed) >= 0.6
//                           (and higher than after a done day) on a habit with diff > 1 -> propose diff - 1, same days.
//   3 memory                skip a kind the player rejected >= 2 times (feedback.rejectedByAction[kind]);
//                           skip any action on a habit whose name appears (case-insensitive) in an active
//                           'constraint' note. Recorded in `skipped`.
//   5 exam_recap           confirm/create_todo: an exam in 1..7 days whose subject has 0 study minutes in the last 7 days
//                           -> one 25-min "Recapitulare <subject>" tomorrow (one per subject, dedupe by title+date).
//   4 data + cap            no action on a habit with < 14 scheduled days in the last 56 (recorded);
//                           at most `maxActions` in total, 'auto' first, then 'confirm'.
import { addDays, dayRange, NAMES, weekday } from "./app/dates.js";
import { isScheduled, streakInfo } from "./app/engine.js";
import { withObservedStart } from "./app/history.js";
import { nextExams, schoolPlanner } from "./app/schoolPlanner.js";

export const THRESHOLDS = { minScheduled: 14, repeatMiss: 0.6, rejectedLimit: 2, baselineDays: 28, historyDays: 56, promptDur: 10, examWithin: 7, recapDur: 25 };

const pct = (x) => `${Math.round(x * 100)}%`;
const round = (x) => Math.round(x * 10000) / 10000;

/** Completion over the 28 days before `today` (habit start moved back to its first logged day). */
function baselineOf(h, state, today) {
  const sched = dayRange(addDays(today, -THRESHOLDS.baselineDays), addDays(today, -1)).filter((d) => isScheduled(h, d));
  const done = sched.filter((d) => state.log?.[d]?.[h.id]).length;
  return { rate28: sched.length ? round(done / sched.length) : null, asOf: today };
}

/** The texts the run writes for the player (to-do titles, reasons) are Romanian by default and English for `lang: "en"`. */
export function planWeek({ state: raw, today, patterns, context, feedback, pastActions = [], maxActions = 3, maxTodos = 2, lang = "ro" } = {}) {
  const en = lang === "en";
  const L = (ro, eng) => (en ? eng : ro);
  const DAYS = (NAMES[lang] || NAMES.ro).days;
  const state = withObservedStart(raw || {});
  const habits = new Map((state.habits || []).map((h) => [h.id, h]));
  const findings = patterns?.findings || [];
  const skipped = [];
  const skip = (rule, reason) => skipped.push({ rule, reason });
  const rejected = feedback?.rejectedByAction || {};
  const constraints = (context || []).filter((n) => n?.kind === "constraint").map((n) => String(n.body || "").toLowerCase());
  const nextWeek = dayRange(addDays(today, 1), addDays(today, 7));
  const taken = new Set((state.todos || []).filter((t) => !t.done).map((t) => `${t.date}|${t.title}`));
  // ponytail: pastActions is accepted for the caller's API; dedupe goes against state.todos only, use it when a rule needs run history.
  void pastActions;

  const histOk = (h) =>
    dayRange(addDays(today, -THRESHOLDS.historyDays), addDays(today, -1)).filter((d) => isScheduled(h, d)).length >= THRESHOLDS.minScheduled;

  // Shared gates (rules 3 and 4). Returns the habit when the action may go ahead, else records why not.
  function gate(rule, kind, habitId) {
    const h = habits.get(habitId);
    if (!h) return null;
    if ((rejected[kind] || 0) >= THRESHOLDS.rejectedLimit) {
      skip(rule, L(`Jucătorul a respins de ${rejected[kind]} ori acțiuni de tip ${kind}; nu mai propun.`, `The player rejected ${kind} actions ${rejected[kind]} times; not proposing any more.`));
      return null;
    }
    const name = String(h.name || "").toLowerCase();
    if (name && constraints.some((c) => c.includes(name))) {
      skip(rule, L(`Există o constrângere activă care menționează „${h.name}"; nu ating obiceiul.`, `An active constraint mentions "${h.name}"; leaving the habit alone.`));
      return null;
    }
    if (!histOk(h)) {
      skip(rule, L(`„${h.name}" are sub ${THRESHOLDS.minScheduled} zile programate în ultimele ${THRESHOLDS.historyDays}; prea puține date.`, `"${h.name}" has fewer than ${THRESHOLDS.minScheduled} scheduled days in the last ${THRESHOLDS.historyDays}; too little data.`));
      return null;
    }
    return h;
  }

  const todos = [];
  const confirms = [];
  for (const f of findings) {
    if (f.kind === "weekday" && f.params?.direction === "lower" && (f.strength === "moderate" || f.strength === "strong")) {
      const h = habits.get(f.habitId);
      const target = h && nextWeek.find((d) => weekday(d) === f.params.weekday && isScheduled(h, d));
      if (!target) continue; // not scheduled that weekday next week: nothing to prepare
      const date = addDays(target, -1);
      if (date < today) {
        skip("weak_weekday_prompt", L(`Data ${date} e în trecut.`, `The date ${date} is in the past.`));
        continue;
      }
      if (!gate("weak_weekday_prompt", "create_todo", f.habitId)) continue;
      const title = L(`Mâine: ${h.name} (ziua ta mai grea). Alege acum când o faci.`, `Tomorrow: ${h.name} (your harder day). Pick now when you will do it.`);
      const key = `${date}|${title}`;
      if (taken.has(key)) {
        skip("weak_weekday_prompt", L(`Există deja un to-do deschis „${title}" pe ${date}.`, `There is already an open to-do "${title}" on ${date}.`));
        continue;
      }
      taken.add(key);
      todos.push({
        kind: "create_todo",
        autonomy: "auto",
        habitId: h.id,
        payload: { title, date, dur: THRESHOLDS.promptDur },
        reason: L(`${h.name} merge mai greu ${DAYS[f.params.weekday]}: ${pct(f.rateA)} bifat (n=${f.n.a}) față de ${pct(f.rateB)} în rest (n=${f.n.b}); e o asociație, nu o cauză, așa că îți las un memento cu o zi înainte.`, `${h.name} is harder on ${DAYS[f.params.weekday]}s: ${pct(f.rateA)} checked off (n=${f.n.a}) versus ${pct(f.rateB)} the rest of the time (n=${f.n.b}); that is an association, not a cause, so I'm leaving you a reminder the day before.`),
        sources: ["gollwitzer-1999", "sheeran-2025"],
        baseline: baselineOf(h, state, today),
      });
    } else if (f.kind === "miss_dynamics" && f.rateA >= THRESHOLDS.repeatMiss && f.diff > 0) {
      const h = habits.get(f.habitId);
      if (!h || !(h.diff > 1)) continue;
      if (!gate("repeat_miss_downshift", "change_habit", f.habitId)) continue;
      confirms.push({
        kind: "change_habit",
        autonomy: "confirm",
        habitId: h.id,
        payload: { habitId: h.id, diff: h.diff - 1, days: [...(h.days || [])] },
        reason: L(`După o zi ratată, ${h.name} se ratează din nou în ${pct(f.rateA)} din cazuri (n=${f.n.a}) față de ${pct(f.rateB)} după o zi bifată (n=${f.n.b}); e o asociație, propun o dificultate mai mică (${h.diff} -> ${h.diff - 1}) cu aceleași zile.`, `After a missed day, ${h.name} is missed again in ${pct(f.rateA)} of cases (n=${f.n.a}) versus ${pct(f.rateB)} after a day it was done (n=${f.n.b}); that is an association, so I suggest a lower difficulty (${h.diff} -> ${h.diff - 1}) on the same days.`),
        sources: ["fogg-2009", "lally-2010"],
        baseline: baselineOf(h, state, today),
      });
    }
  }

  // Rule 5: an exam within a week and no study logged for its subject in the last 7 days.
  const recaps = [];
  const sessions = schoolPlanner(raw).sessions;
  const studyFrom = addDays(today, -6);
  const seen = new Set();
  for (const e of nextExams(raw, today)) {
    if (e.daysLeft < 1 || e.daysLeft > THRESHOLDS.examWithin) continue;
    const subject = String(e.subject || "").trim();
    const key = subject.toLowerCase();
    if (!subject || seen.has(key)) continue;
    seen.add(key);
    if (sessions.some((s) => s.day >= studyFrom && s.day <= today && String(s.subject || "").trim().toLowerCase() === key && Number(s.minutes) > 0)) continue;
    if ((rejected.create_todo || 0) >= THRESHOLDS.rejectedLimit) {
      skip("exam_recap", L(`Jucătorul a respins de ${rejected.create_todo} ori acțiuni de tip create_todo; nu mai propun.`, `The player rejected create_todo actions ${rejected.create_todo} times; not proposing any more.`));
      continue;
    }
    if (constraints.some((c) => c.includes(key))) {
      skip("exam_recap", L(`Există o constrângere activă care menționează „${subject}"; nu propun.`, `An active constraint mentions "${subject}"; not proposing.`));
      continue;
    }
    const title = L(`Recapitulare ${subject}`, `Review ${subject}`);
    const date = addDays(today, 1);
    if (taken.has(`${date}|${title}`)) {
      skip("exam_recap", L(`Există deja un to-do deschis „${title}" pe ${date}.`, `There is already an open to-do "${title}" on ${date}.`));
      continue;
    }
    taken.add(`${date}|${title}`);
    recaps.push({
      kind: "create_todo",
      autonomy: "confirm",
      payload: { title, date, dur: THRESHOLDS.recapDur },
      reason: L(`Examen la ${subject} peste ${e.daysLeft} ${e.daysLeft === 1 ? "zi" : "zile"} (${e.date}) și 0 minute de studiu notate la ${subject} în ultimele 7 zile; îți propun o recapitulare scurtă.`, `Exam in ${subject} in ${e.daysLeft} ${e.daysLeft === 1 ? "day" : "days"} (${e.date}) and 0 minutes of study logged for ${subject} in the last 7 days; I suggest a short review.`),
      sources: [],
      baseline: null,
    });
  }

  for (const t of todos.slice(maxTodos)) skip("weak_weekday_prompt", L(`Peste limita de ${maxTodos} to-do-uri pe săptămână: „${t.payload.title}".`, `Over the limit of ${maxTodos} to-dos a week: "${t.payload.title}".`));
  const ordered = [...todos.slice(0, maxTodos), ...confirms, ...recaps];
  for (const a of ordered.slice(maxActions)) skip(recaps.includes(a) ? "exam_recap" : a.kind === "create_todo" ? "weak_weekday_prompt" : "repeat_miss_downshift", L(`Peste limita de ${maxActions} acțiuni pe săptămână.`, `Over the limit of ${maxActions} actions a week.`));

  return { runDay: today, actions: ordered.slice(0, maxActions), skipped };
}

/**
 * Daily evening check (a separate, opt-in run): is a streak of `minStreak`+ days about to break, because today has
 * scheduled habits and nothing is done yet? Returns {streak, habit} (the first open habit) or null. No text here:
 * the message is written by the model, or not sent.
 */
export function streakAlert({ state, today, minStreak = 3 } = {}) {
  const streak = streakInfo(state || {}, today);
  if (streak.todayDone || streak.current < minStreak) return null;
  const left = (state?.habits || []).filter((h) => !h.archivedAt && isScheduled(h, today) && !state.log?.[today]?.[h.id]);
  return left.length ? { streak: streak.current, habit: left[0] } : null;
}
