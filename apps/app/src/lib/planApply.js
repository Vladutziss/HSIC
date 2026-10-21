// Turns a plan from the chat (see lib/chat.js normalizePlan) into the things the app stores:
// one parent goal with milestones, to-dos and habits. Pure: App.jsx runs the results through its actions.

import { MAX_TEXT, periodKey } from "./goals.js";
import { hasOpenTodo } from "./agentActions.js";
import { MAX_HABITS } from "./catalog.js";
import { tr } from "./i18n.js";

export const LIMITS = { steps: 7, todos: 7, habits: 3 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const norm = (t) => String(t || "").trim().toLowerCase();

/** { parent, children } for goals.addSet, or null when the plan has no steps. Steps live in the parent's month. */
export function goalSet(plan, today) {
  const steps = (plan?.steps || []).filter((s) => str(s?.text, 1)).slice(0, LIMITS.steps);
  if (!steps.length) return null;
  const key = periodKey("month", today);
  return {
    parent: { text: str(plan.title, MAX_TEXT) || tr("Plan"), period: "month", key },
    children: steps.map((s) => ({
      text: str(s.text, MAX_TEXT),
      period: "month",
      key,
      due: DAY.test(s.due || "") ? s.due : undefined,
      criteria: str(s.criteria, 160) || undefined,
    })),
  };
}

/** To-dos to propose: no blank titles, no copies (inside the plan or already open that day). */
export function todoList(plan, state, today) {
  const seen = new Set();
  const out = [];
  for (const t of plan?.todos || []) {
    const title = str(t?.title, 120);
    const date = DAY.test(t?.date || "") ? t.date : today;
    const k = `${date}|${norm(title)}`;
    if (!title || seen.has(k) || hasOpenTodo(state, title, date)) continue;
    seen.add(k);
    out.push({ title, date, dur: Number.isFinite(t.dur) && t.dur > 0 ? Math.round(t.dur) : 30 });
    if (out.length >= LIMITS.todos) break;
  }
  return out;
}

/** Habits to add: valid weekdays, not already there (by name), within the room left. */
export function habitList(plan, state) {
  const active = (state?.habits || []).filter((h) => !h.archivedAt);
  const names = new Set(active.map((h) => norm(h.name)));
  const room = Math.max(0, MAX_HABITS - active.length);
  const out = [];
  for (const h of plan?.habits || []) {
    const name = str(h?.name, 60);
    const days = Array.isArray(h?.days) ? [...new Set(h.days)].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).sort() : [];
    if (!name || !days.length || names.has(norm(name))) continue;
    names.add(norm(name));
    out.push({ name, days, diff: Number.isInteger(h.diff) && h.diff >= 1 && h.diff <= 3 ? h.diff : 2 });
    if (out.length >= Math.min(LIMITS.habits, room)) break;
  }
  return out;
}

/** "3 pași, 2 to-do-uri, 1 obicei" from what was actually added. */
export function summary({ steps = 0, todos = 0, habits = 0 }) {
  const p = [];
  if (steps) p.push(`${steps} ${steps === 1 ? tr("pas") : tr("pași")}`);
  if (todos) p.push(`${todos} ${todos === 1 ? tr("to-do") : tr("to-do-uri")}`);
  if (habits) p.push(`${habits} ${habits === 1 ? tr("obicei") : tr("obiceiuri")}`);
  return p.length ? tr("Adăugat: {join}.", { join: p.join(", ") }) : tr("Nu era nimic nou de adăugat: totul exista deja.");
}
