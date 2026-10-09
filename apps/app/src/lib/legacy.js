// Imports what is worth keeping from the first version of the app
// (document data/users/<id>/momentum): the goal, the habits and the to-dos.
// The old check-in history is not imported: it was mostly sample data.

import { CATALOG, habitFromCatalog, nextColor, uid } from "./catalog.js";

const HABIT_MAP = {
  gym: "gym",
  meditate: "meditate",
  read: "read",
  sleep: "sleep",
  water: "water",
  journal: "journal",
  walk: "steps",
  language: "lang",
};

export function legacyHabits(legacy, today) {
  const out = [];
  for (const id of legacy?.habits || []) {
    const item = CATALOG.find((c) => c.id === HABIT_MAP[id]);
    if (item) out.push(habitFromCatalog(item, out, today));
    else if (id === "deepwork")
      out.push({
        id: uid("h"),
        name: "Deep work",
        icon: "target",
        cat: "studiu",
        diff: 3,
        days: [1, 2, 3, 4, 5],
        time: null,
        target: "90 de minute de lucru concentrat",
        color: nextColor(out),
        createdAt: today,
      });
  }
  return out.slice(0, 8);
}

export function legacyTodos(legacy, today) {
  return (legacy?.todos || [])
    .filter((t) => (t.text || t.title || "").trim())
    .map((t) => ({
      id: uid("t"),
      title: String(t.text || t.title).trim().slice(0, 80),
      date: t.date || null,
      time: null,
      dur: 30,
      done: !!t.done,
      doneOn: t.done ? t.doneOn || t.date || today : null,
      habitId: null,
      createdAt: t.date && t.date < today ? t.date : today,
      imported: true,
    }));
}

export const legacySummary = (legacy) => ({
  todos: (legacy?.todos || []).length,
  open: (legacy?.todos || []).filter((t) => !t.done).length,
  habits: (legacy?.habits || []).length,
  goal: legacy?.goal || "",
});
