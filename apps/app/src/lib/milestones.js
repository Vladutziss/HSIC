// Milestones: a goal may have children (parentId). All extra fields are optional, so old flat goals keep working.
//   { ...goal, parentId?, due?: "YYYY-MM-DD", status?: "open"|"done"|"dropped", criteria?, todoIds?: [], habitIds?: [] }
// Stored inside profiles.extra.goals (jsonb), so no migration.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const STATUSES = ["open", "done", "dropped"];

/** Defaults for the optional fields; `status` follows `done` when it is missing. */
export function normalizeGoal(g) {
  return {
    ...g,
    parentId: typeof g?.parentId === "string" && g.parentId ? g.parentId : null,
    due: DAY.test(g?.due || "") ? g.due : null,
    status: STATUSES.includes(g?.status) ? g.status : g?.done ? "done" : "open",
    criteria: typeof g?.criteria === "string" ? g.criteria.slice(0, 160) : "",
    todoIds: Array.isArray(g?.todoIds) ? g.todoIds : [],
    habitIds: Array.isArray(g?.habitIds) ? g.habitIds : [],
  };
}

export const childrenOf = (goals, id) => (goals || []).filter((g) => g.parentId === id);

/** Goals shown at the top level: no parent, or a parent that no longer exists. */
export function topLevel(list, all = list) {
  const ids = new Set((all || []).map((g) => g.id));
  return (list || []).filter((g) => !g.parentId || !ids.has(g.parentId));
}

/** { done, total } over the children that are not dropped. */
export function progressOf(goals, id) {
  const kids = childrenOf(goals, id).filter((g) => normalizeGoal(g).status !== "dropped");
  return { done: kids.filter((g) => g.done || normalizeGoal(g).status === "done").length, total: kids.length };
}

export const MAX_LINKS = 3;

/** Adds or removes `id` from a link list (capped at MAX_LINKS). */
export function toggleLink(ids, id) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= MAX_LINKS ? list : [...list, id];
}

/** Fields to merge into a goal for a status change; keeps `done`/`doneOn` in step with `status`. */
export function statusPatch(status, today) {
  return { status, done: status === "done", doneOn: status === "done" ? today : null };
}

/** Linked ids that still exist (a deleted todo/habit leaves a stale id behind), resolved to their objects. */
export function liveLinks(goal, todos, habits) {
  const g = normalizeGoal(goal);
  return {
    todos: g.todoIds.map((id) => (todos || []).find((t) => t.id === id)).filter(Boolean),
    habits: g.habitIds.map((id) => (habits || []).find((h) => h.id === id && !h.archivedAt)).filter(Boolean),
  };
}

/** True when the goal is open and every linked (still existing) todo is done: the UI suggests marking it done. */
export function suggestDone(goal, todos) {
  if (normalizeGoal(goal).status !== "open") return false;
  const linked = liveLinks(goal, todos, []).todos;
  return linked.length > 0 && linked.every((t) => t.done);
}

/** A parent goal plus children linked to it; `mk` builds a goal from its fields (id, dates, done flags). */
export function milestoneSet(parent, children, mk) {
  const p = mk({ period: parent.period, key: parent.key, text: parent.text });
  // the steps live in the parent's period, or they would show up in another tab than their parent
  return [p, ...children.map((c) => mk({ period: parent.period, key: parent.key, text: c.text, due: c.due, criteria: c.criteria, parentId: p.id }))];
}
