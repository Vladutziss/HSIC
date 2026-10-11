// The player's side of the coach agent's action log (table agent_actions): list what the agent did or
// proposed, apply a proposal to the app state reversibly, undo it, reject it.
// Pure functions first (state patches the app runs through update(fn)), then a thin data layer on the
// player's own supabase client. Errors are thrown as {code}: unavailable | db_error.

import { CATALOG, habitFromCatalog } from "./catalog.js";
import { recordFeedback } from "./memory.js";

export const SUPPORTED = ["create_todo", "change_habit", "add_habit"];

// ------------------------------------------------------------ pure

/** agent_actions row -> camelCase action. */
export function mapRow(r) {
  return {
    id: r.id,
    runId: r.run_id,
    kind: r.kind,
    autonomy: r.autonomy,
    status: r.status,
    habitId: r.habit_id ?? null,
    payload: r.payload || {},
    before: r.before ?? null,
    reason: r.reason,
    sources: r.sources || [],
    baseline: r.baseline ?? null,
    outcome: r.outcome ?? null,
    outcomeDue: r.outcome_due ?? null,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
  };
}

const isPending = (a) => a.status === "pending";
export const pendingAuto = (actions) => (actions || []).filter((a) => a.autonomy === "auto" && isPending(a));
export const pendingConfirm = (actions) => (actions || []).filter((a) => a.autonomy === "confirm" && isPending(a));
/** Decided actions, newest first. */
export const recent = (actions) =>
  (actions || []).filter((a) => !isPending(a)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

// Deterministic ids make applying twice a no-op.
const todoIdOf = (a) => `tag-${a.id}`;
const habitIdOf = (a) => `hag-${a.id}`;
const validDays = (d) => Array.isArray(d) && d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);

/**
 * What applying `action` does to `state`: { patch: (state) => state, before } or { error }.
 * `before` is what planUndo needs; store it with markApplied.
 */
export function planApply(action, state, today) {
  const p = action?.payload || {};
  const todos = state?.todos || [];
  const habits = state?.habits || [];
  switch (action?.kind) {
    case "create_todo": {
      const id = action.before?.todoId || todoIdOf(action);
      const title = String(p.title ?? p.name ?? "").trim().slice(0, 120);
      if (!title) return { error: "invalid" };
      const todo = {
        id,
        title,
        date: p.date || today,
        time: null,
        dur: Number.isFinite(p.dur) ? p.dur : 30,
        done: false,
        doneOn: null,
        createdAt: today,
        fromAgent: true,
      };
      return {
        before: { todoId: id },
        patch: (s) => ((s.todos || []).some((t) => t.id === id) ? s : { ...s, todos: [...(s.todos || []), todo] }),
      };
    }
    case "change_habit": {
      const id = action.habitId || p.habitId;
      const habit = habits.find((h) => h.id === id);
      if (!habit) return { error: "not_found" };
      const diff = Number.isInteger(p.diff) ? p.diff : habit.diff;
      const days = validDays(p.days) ? [...p.days] : habit.days;
      // Re-applying keeps the values captured the first time, so the undo stays correct.
      const before = action.before && "diff" in action.before ? action.before : { diff: habit.diff, days: [...habit.days] };
      return { before, patch: (s) => ({ ...s, habits: (s.habits || []).map((h) => (h.id === id ? { ...h, diff, days } : h)) }) };
    }
    case "add_habit": {
      const id = action.before?.habitId || habitIdOf(action);
      const name = String(p.name ?? "").trim().slice(0, 60);
      if (!name || !validDays(p.days)) return { error: "invalid" };
      const base = { id: null, name, icon: "target", cat: state?.profile?.path || CATALOG[0]?.cat || "sport", diff: Number.isInteger(p.diff) ? p.diff : 2, days: p.days, time: null, target: "" };
      return {
        before: { habitId: id },
        patch: (s) => {
          if ((s.habits || []).some((h) => h.id === id)) return s;
          return { ...s, habits: [...(s.habits || []), { ...habitFromCatalog(base, s.habits || [], today), id, catalogId: undefined, fromAgent: true }] };
        },
      };
    }
    default:
      return { error: "unsupported" };
  }
}

/** Reverses a previously applied action using `action.before`. Habits are archived, never deleted. */
export function planUndo(action, state, today = new Date().toISOString().slice(0, 10)) {
  const b = action?.before;
  if (!b) return { error: "no_before" };
  switch (action.kind) {
    case "create_todo":
      return { patch: (s) => ({ ...s, todos: (s.todos || []).filter((t) => t.id !== b.todoId) }) };
    case "change_habit": {
      const id = action.habitId || action.payload?.habitId;
      return { patch: (s) => ({ ...s, habits: (s.habits || []).map((h) => (h.id === id ? { ...h, diff: b.diff, days: [...b.days] } : h)) }) };
    }
    case "add_habit":
      return { patch: (s) => ({ ...s, habits: (s.habits || []).map((h) => (h.id === b.habitId && !h.archivedAt ? { ...h, archivedAt: today } : h)) }) };
    default:
      return { error: "unsupported" };
  }
}

// ------------------------------------------------------------ data layer

function need(client) {
  if (!client) throw { code: "unavailable" };
  return client;
}
const must = ({ error }) => {
  if (error) throw { code: "db_error" };
};
const proposalOf = (a) => {
  const p = a.payload || {};
  return { action: a.kind, habitId: a.habitId || p.habitId, name: p.name || p.title, diff: p.diff, days: p.days, reason: a.reason };
};
const now = () => new Date().toISOString();

/** Newest first. RLS limits the rows to the signed-in user. */
export async function loadActions(client, { limit = 30 } = {}) {
  const { data, error } = await need(client).from("agent_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw { code: "db_error" };
  return (data || []).map(mapRow);
}

/** Marks the action applied, keeps what undo needs, and tells the agent it was accepted (`opts.action` = the action). */
export async function markApplied(client, id, before, { outcomeDue = null, action = null } = {}) {
  const c = need(client);
  must(await c.from("agent_actions").update({ status: "applied", before, outcome_due: outcomeDue, decided_at: now() }).eq("id", id));
  if (action) await recordFeedback(c, { proposal: proposalOf(action), decision: "accepted" });
}

export async function markUndone(client, id, action = null) {
  const c = need(client);
  must(await c.from("agent_actions").update({ status: "undone", decided_at: now() }).eq("id", id));
  if (action) await recordFeedback(c, { proposal: proposalOf(action), decision: "rejected", reason: "Anulat după aplicare" });
}

export async function markRejected(client, id, reason, action = null) {
  const c = need(client);
  must(await c.from("agent_actions").update({ status: "rejected", decided_at: now() }).eq("id", id));
  if (action) await recordFeedback(c, { proposal: proposalOf(action), decision: "rejected", reason });
}
