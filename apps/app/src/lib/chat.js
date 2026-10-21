// Chat with the Molt: the AI contract (kind "chat" of the `ai` Edge Function) and the plan it proposes.
// normalizePlan/chatContext are pure; askChat is the only part that calls the server (web build only).

import { askCoach, askCoachBackground } from "./ai.js";
import { addDays, dayKey } from "./dates.js";
import { isScheduled, streakInfo } from "./engine.js";
import { periodKey } from "./goals.js";
import { activeContext } from "./memory.js";
import { nextAssignments, nextExams } from "./schoolPlanner.js";
import { isDoneOn, todosByDay } from "./todos.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};
const date = (d) => (typeof d === "string" && DATE.test(d) ? d : "");
const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);

/** Raw AI plan -> {title, steps, habits, todos, why} with every field clipped/validated, or null when nothing is usable. */
export function normalizePlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s) => ({
      text: str(s?.text, 120),
      period: s?.period === "month" ? "month" : "week",
      due: date(s?.due),
      criteria: str(s?.criteria, 120),
    }))
    .filter((s) => s.text)
    .slice(0, 6);
  const habits = arr(raw.habits, 3)
    .map((h) => ({
      name: str(h?.name, 40),
      diff: Math.max(1, Math.min(3, Math.round(Number(h?.diff)) || 2)),
      days: [...new Set(arr(h?.days, 14).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    }))
    .filter((h) => h.name && h.days.length);
  const todos = arr(raw.todos, 4)
    .map((t) => ({
      title: str(t?.title, 80),
      date: date(t?.date),
      dur: Math.max(10, Math.min(60, Math.round(Number(t?.dur)) || 25)),
    }))
    .filter((t) => t.title && t.date);
  if (!steps.length && !habits.length && !todos.length) return null;
  return { title: str(raw.title, 80), steps, habits, todos, why: str(raw.why, 200) };
}

/**
 * params.context for the "chat" prompt. `noteRows` are the user_context rows (they live in the database, not in
 * state: load them with memory.loadNotes on the web build); pass [] / omit when unavailable.
 */
export function chatContext(state, today, noteRows = []) {
  const s = state || {};
  const log = s.log || {};
  const habits = (s.habits || []).filter((h) => !h.archivedAt).slice(0, 10);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  // the calendar: today and the next 7 days (repeating to-dos expanded), done or not, earliest first
  const agenda = Object.entries(todosByDay(s.todos, today, addDays(today, 7)))
    .flatMap(([day, list]) => list.map((t) => ({ title: str(t.title, 80), date: day, time: t.time || "", dur: t.dur || 0, done: isDoneOn(t, day) })))
    .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))
    .slice(0, 24);
  const goalKeys = new Set([periodKey("week", today), periodKey("month", today)]);
  return {
    habits: habits.map((h) => ({
      name: str(h.name, 60),
      diff: h.diff,
      days: Array.isArray(h.days) ? h.days : [],
      scheduledToday: isScheduled(h, today),
      doneToday: !!log[today]?.[h.id],
      // last 7 days including today: scheduled days vs ticked days
      weekScheduled: week.filter((d) => isScheduled(h, d)).length,
      weekDone: week.filter((d) => isScheduled(h, d) && log[d]?.[h.id]).length,
    })),
    streak: streakInfo(s, today).current,
    focusMinutesToday: Math.round(
      (s.focusSessions || []).filter((f) => f.start && dayKey(new Date(f.start)) === today).reduce((a, f) => a + (f.work || 0) / 60, 0),
    ),
    goals: (s.goals || [])
      .filter((g) => goalKeys.has(g.key) || !g.done)
      .slice(0, 10)
      .map((g) => ({ text: str(g.text, 100), period: g.period, done: !!g.done })),
    todos: agenda,
    undatedTodos: (s.todos || [])
      .filter((t) => !t.date && !t.done)
      .slice(0, 8)
      .map((t) => str(t.title, 80)),
    assignments: nextAssignments(s, today)
      .slice(0, 6)
      .map((a) => ({ title: str(a.title, 80), subject: str(a.subject, 40), due: a.due || "" })),
    exams: nextExams(s, today)
      .slice(0, 6)
      .map((e) => ({ title: str(e.title, 80), subject: str(e.subject, 40), date: e.date })),
    notes: activeContext(noteRows, today)
      .slice(0, 10)
      .map((n) => str(n.body, 200))
      .filter(Boolean),
    today,
  };
}

const chatParams = ({ name, cls, goal, messages, plan, context }) => ({
  name,
  cls,
  goal,
  messages: arr((messages || []).slice(-12), 12)
    .map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: str(m?.content, 600) }))
    .filter((m) => m.content),
  plan: plan || null,
  context,
});

/** Asks for a reply the server writes into the conversation by itself (see lib/chatRun.js for waiting on it). */
export const startChat = (args, signal) => askCoachBackground("chat", chatParams(args), signal);

/** One chat turn in one call. Resolves {reply, plan} (plan normalized or null); throws {code} like the other coach calls. */
export async function askChat(args, signal) {
  const r = await askCoach("chat", chatParams(args), signal);
  const reply = str(r?.reply, 600);
  if (!reply) throw { code: "invalid_json" };
  return { reply, plan: normalizePlan(r.plan) };
}
