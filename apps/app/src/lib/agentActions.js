// The player's side of the coach agent's action log (table agent_actions): list what the agent did or
// proposed, apply a proposal to the app state reversibly, undo it, reject it.
// Pure functions first (state patches the app runs through update(fn)), then a thin data layer on the
// player's own supabase client. Errors are thrown as {code}: unavailable | db_error.

import { CATALOG, habitFromCatalog } from "./catalog.js";
import { addNote, recordFeedback, removeNote } from "./memory.js";

export const SUPPORTED = ["create_todo", "plan_focus", "change_habit", "add_habit", "add_note"];

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
    explanation: r.explanation || r.payload?.explanation || null,
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
    case "create_todo":
    case "plan_focus": {
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
        ...(action.kind === "plan_focus" ? { focus: true } : {}),
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
    case "plan_focus":
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

// ------------------------------------------------------------ notes (live in user_context, not in the app state)

/** Inserts the proposed note; returns `before` for markApplied so undo can delete it. */
export async function applyNote(client, action, today) {
  const p = action?.payload || {};
  const row = await addNote(client, { kind: p.noteKind, body: p.body, startsOn: p.startsOn, endsOn: p.endsOn }, today);
  return { noteId: row.id };
}

export async function undoNote(client, action) {
  if (!action?.before?.noteId) throw { code: "db_error" };
  await removeNote(client, action.before.noteId);
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
  return { action: a.kind, habitId: a.habitId || p.habitId, name: p.name || p.title || p.body, diff: p.diff, days: p.days, reason: a.reason };
};
const now = () => new Date().toISOString();

/** Newest first. RLS limits the rows to the signed-in user. */
export async function loadActions(client, { limit = 30 } = {}) {
  const { data, error } = await need(client).from("agent_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw { code: "db_error" };
  return (data || []).map(mapRow);
}


/**
 * Logs an action the app itself proposes (daily plan step, rescue, chat plan) as a pending row, so it gets the same
 * apply / undo / outcome path as the agent's. `kind` is one of SUPPORTED; `payload` is what planApply reads
 * (`explanation` is merged into it). Returns the mapped action.
 * `explanation` = {dataUsed, confidence, expectedEffect}, shown by AgentLog.
 */
export async function recordAction(client, { kind, payload = {}, reason, explanation = null, habitId = null }) {
  const row = {
    run_id: `ui-${Date.now()}`,
    kind,
    autonomy: "confirm",
    status: "pending",
    payload: { ...payload, ...(explanation ? { explanation } : {}) },
    reason: String(reason || payload.title || payload.name || kind).slice(0, 400),
    ...(habitId ? { habit_id: habitId } : {}),
  };
  const { data, error } = await need(client).from("agent_actions").insert(row).select().single();
  if (error || !data) throw { code: "db_error" };
  return mapRow(data);
}

/** A to-do (or, with `focus`, a Focus session) the app proposes: recordAction for create_todo / plan_focus. */
export const recordTodo = (client, { title, date, dur, reason, explanation = null, focus = false }) =>
  recordAction(client, { kind: focus ? "plan_focus" : "create_todo", payload: { title, date, dur }, reason: reason || title, explanation });

/** Is there already an open to-do with this title that day? Keeps repeated taps from piling up copies. */
export const hasOpenTodo = (state, title, date) => (state?.todos || []).some((t) => !t.done && t.date === date && t.title === title);

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
