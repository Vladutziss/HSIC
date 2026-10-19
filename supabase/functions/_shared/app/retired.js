// Deleting a habit must not rewind the player. Its check-ins already earned momentum and evolution points, and
// the days it was scheduled already counted, so when a habit is deleted its history moves into
// `companion.retired` (a plain JSON value that is saved with the profile) instead of disappearing.
// The engine reads state through `withHistory`, so momentum, streak and the companion's stage are computed as if
// the habit were still there up to the day it was deleted; from that day on it is no longer scheduled.

export const MAX_RETIRED = 200;

export const retiredOf = (state) => state?.companion?.retired || [];

// the habit as the engine needs it: when it existed, which days it was scheduled, how hard it was
const asHabit = (r) => ({ id: r.id, name: r.name, diff: r.diff, days: r.days || [], createdAt: r.createdAt, archivedAt: r.archivedAt });

/** The state with the deleted habits and their check-ins put back in, for the engine only. */
export function withHistory(state) {
  const retired = retiredOf(state);
  if (!retired.length) return state;
  const log = { ...(state.log || {}) };
  for (const r of retired) {
    for (const [day, code] of Object.entries(r.log || {})) log[day] = { ...(log[day] || {}), [r.id]: code };
  }
  return { ...state, habits: [...(state.habits || []), ...retired.map(asHabit)], log };
}

/** Deletes a habit but keeps what it earned. A habit that never counted for anything is simply dropped. */
export function retireHabit(state, habitId, today) {
  const habit = (state.habits || []).find((h) => h.id === habitId);
  if (!habit) return state;
  const mine = {};
  const log = {};
  for (const [day, entries] of Object.entries(state.log || {})) {
    const { [habitId]: code, ...rest } = entries || {};
    if (code) mine[day] = code;
    if (Object.keys(rest).length) log[day] = rest;
  }
  const counted = Object.keys(mine).length > 0 || (habit.createdAt && habit.createdAt < today);
  const next = {
    ...state,
    habits: state.habits.filter((h) => h.id !== habitId),
    log,
    todos: (state.todos || []).map((t) => (t.habitId === habitId ? { ...t, habitId: null } : t)),
  };
  if (!counted) return next;
  const record = { id: habit.id, name: habit.name, diff: habit.diff, days: habit.days || [], createdAt: habit.createdAt || null, archivedAt: today, log: mine };
  return { ...next, companion: { ...(state.companion || {}), retired: [...retiredOf(state), record].slice(-MAX_RETIRED) } };
}
