// Chat with the Molt: the AI contract (kind "chat" of the `ai` Edge Function) and the plan it proposes.
// normalizePlan/chatContext are pure; askChat is the only part that calls the server (web build only).

import { askCoach } from "./ai.js";
import { activeContext } from "./memory.js";
import { nextAssignments, nextExams } from "./schoolPlanner.js";

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
  return {
    habits: (s.habits || [])
      .filter((h) => !h.archivedAt)
      .slice(0, 10)
      .map((h) => ({ name: str(h.name, 60), diff: h.diff, days: Array.isArray(h.days) ? h.days : [] })),
    goals: (s.goals || [])
      .filter((g) => !g.done)
      .slice(0, 6)
      .map((g) => ({ text: str(g.text, 100), period: g.period, done: false })),
    todos: (s.todos || [])
      .filter((t) => !t.done)
      .slice(0, 10)
      .map((t) => ({ title: str(t.title, 80), date: t.date || "" })),
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

/** One chat turn. Resolves {reply, plan} (plan normalized or null); throws {code} like the other coach calls. */
export async function askChat({ name, cls, goal, messages, plan, context }, signal) {
  const msgs = arr((messages || []).slice(-12), 12)
    .map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: str(m?.content, 600) }))
    .filter((m) => m.content);
  const r = await askCoach("chat", { name, cls, goal, messages: msgs, plan: plan || null, context }, signal);
  const reply = str(r?.reply, 600);
  if (!reply) throw { code: "invalid_json" };
  return { reply, plan: normalizePlan(r.plan) };
}
