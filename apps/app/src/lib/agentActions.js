// The player's side of the coach agent's action log (table agent_actions): list what the agent did or
// proposed, apply a proposal to the app state reversibly, undo it, reject it.
// Pure functions first (state patches the app runs through update(fn)), then a thin data layer on the
// player's own supabase client. Errors are thrown as {code}: unavailable | db_error.

import { CATALOG, HABIT_COLORS, MAX_HABITS, habitFromCatalog } from "./catalog.js";
import { MAX_OBJECTIVES, MAX_STEPS } from "./objectives.js";
import { addNote, recordFeedback, removeNote } from "./memory.js";
import { summarizeOutcomes } from "./outcomes.js";
import { tr } from "./i18n.js";

export const SUPPORTED = ["create_todo", "plan_focus", "change_habit", "add_habit", "add_note", "add_goal"];

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
const goalIdOf = (a) => `gag-${a.id}`;
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
      // the list may have filled up since the proposal was made (the player added habits, or accepted another one)
      if (!habits.some((h) => h.id === id) && habits.filter((h) => !h.archivedAt).length >= MAX_HABITS) return { error: "full" };
      const base = { id: null, name, icon: "target", cat: state?.profile?.path || CATALOG[0]?.cat || "sport", diff: Number.isInteger(p.diff) ? p.diff : 2, days: p.days, time: null, target: "" };
      return {
        before: { habitId: id },
        patch: (s) => {
          if ((s.habits || []).some((h) => h.id === id)) return s;
          return { ...s, habits: [...(s.habits || []), { ...habitFromCatalog(base, s.habits || [], today), id, catalogId: undefined, fromAgent: true }] };
        },
      };
    }
    case "add_goal": {
      const id = action.before?.goalId || goalIdOf(action);
      const title = String(p.title ?? "").trim().slice(0, 80);
      const steps = (Array.isArray(p.steps) ? p.steps : []).map((t) => String(t ?? "").trim().slice(0, 80)).filter(Boolean).slice(0, MAX_STEPS);
      if (!title || !steps.length) return { error: "invalid" };
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(p.deadline || "") && p.deadline >= today ? p.deadline : null;
      const list = state?.objectives || [];
      if (!list.some((o) => o.id === id) && list.filter((o) => !o.archived && !o.doneOn).length >= MAX_OBJECTIVES) return { error: "full" };
      const goal = {
        id,
        title,
        why: String(p.why ?? "").trim().slice(0, 240),
        reward: "",
        icon: "target",
        color: HABIT_COLORS[list.length % HABIT_COLORS.length],
        start: today,
        deadline,
        doneOn: null,
        archived: false,
        habitIds: [],
        metric: null,
        steps: steps.map((t, i) => ({ id: `${id}-s${i + 1}`, title: t, done: false, doneOn: null, date: null, todoId: null, subs: [] })),
        reminder: { on: true, days: [1, 3, 5], time: "18:00" },
        log: [],
        seenMarks: [],
        fromAgent: true,
      };
      return { before: { goalId: id }, patch: (s) => ((s.objectives || []).some((o) => o.id === id) ? s : { ...s, objectives: [...(s.objectives || []), goal] }) };
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
    case "add_goal":
      return { patch: (s) => ({ ...s, objectives: (s.objectives || []).map((o) => (o.id === b.goalId && !o.archived ? { ...o, archived: true } : o)) }) };
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
  if (action) await recordFeedback(c, { proposal: proposalOf(action), decision: "rejected", reason: tr("Anulat după aplicare") });
}

export async function markRejected(client, id, reason, action = null) {
  const c = need(client);
  must(await c.from("agent_actions").update({ status: "rejected", decided_at: now() }).eq("id", id));
  if (action) await recordFeedback(c, { proposal: proposalOf(action), decision: "rejected", reason });
}

const STEP = {
  stats: () => tr("a citit statisticile obiceiurilor tale"),
  context: (s) => tr("a citit {notes} {v} despre tine", { notes: s.notes, v: s.notes === 1 ? tr("notiță") : tr("notițe") }),
  feedback: () => tr("a verificat ce ai acceptat sau respins înainte"),
  history: (s) => tr("a verificat {count} {v}", { count: s.count, v: s.count === 1 ? tr("acțiune trecută") : tr("acțiuni trecute") }),
  goals: (s) => tr("a verificat {count} {v}", { count: s.active, v: s.active === 1 ? tr("obiectiv activ") : tr("obiective active") }),
  experiments: (s) => tr("a verificat {count} {v}", { count: s.count, v: s.count === 1 ? tr("experiment") : tr("experimente") }),
  school: (s) => tr("a citit {exams} {v} și {assignments} teme", { exams: s.exams, v: s.exams === 1 ? tr("examen") : tr("examene"), assignments: s.assignments }),
  patterns: (s) => tr("a testat tipare în istoric: {findings} {v} din {tested} testate", { findings: s.findings, v: s.findings === 1 ? tr("găsit") : tr("găsite"), tested: s.tested }),
  search: (s) => tr("a căutat în sursele lui{v}{v2}", { v: s.query ? `: „${s.query}”` : "", v2: s.sources?.length ? ` (${s.sources.length} ${s.sources.length === 1 ? tr("sursă citată") : tr("surse citate")})` : "" }),
};

/** The tools the agent called for a proposal, one plain line each (propose steps are the proposals themselves). */
export function traceLines(trace) {
  if (!Array.isArray(trace)) return [];
  return trace.filter((s) => STEP[s?.kind]).map((s) => STEP[s.kind](s));
}

/** What the player's own log says about the coach: proposals needing a tap, what became of them, measured effects. */
export function agentImpact(actions) {
  const asked = (actions || []).filter((a) => a.autonomy === "confirm");
  const verdicts = summarizeOutcomes(asked).byVerdict;
  const measured = ["improved", "worse", "no_clear_change"].reduce((n, k) => n + (verdicts[k] || 0), 0);
  return {
    proposals: asked.length,
    applied: asked.filter((a) => a.status === "applied").length,
    rejected: asked.filter((a) => a.status === "rejected").length,
    measured,
    improved: verdicts.improved || 0,
    same: verdicts.no_clear_change || 0,
    worse: verdicts.worse || 0,
  };
}
