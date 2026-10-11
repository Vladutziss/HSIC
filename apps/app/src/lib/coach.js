// What the AI coach sees: the last 4 weeks of each active habit, per weekday.
// Pure, so it is tested without the AI (tests/coach.test.mjs).

import { addDays, dayRange, weekday } from "./dates.js";
import { isScheduled } from "./engine.js";

const WINDOW = 28; // days before today; today is still open

export function coachData(state, today) {
  const days = dayRange(addDays(today, -WINDOW), addDays(today, -1));
  const habits = (state.habits || [])
    .filter((h) => !h.archivedAt)
    .map((h) => {
      const wd = Array.from({ length: 7 }, () => [0, 0]); // [scheduled, done], index = weekday (0 = Sunday)
      for (const day of days) {
        if (!isScheduled(h, day)) continue;
        const cell = wd[weekday(day)];
        cell[0]++;
        if (state.log?.[day]?.[h.id]) cell[1]++;
      }
      return {
        id: h.id,
        name: h.name,
        diff: h.diff,
        days: h.days,
        sched: wd.reduce((a, c) => a + c[0], 0),
        done: wd.reduce((a, c) => a + c[1], 0),
        wd,
      };
    });
  return { goal: state.profile?.goal || "", habits, count: habits.length };
}

/** Enough history for the numbers to mean something. */
export const hasHistory = (data) => data.habits.some((h) => h.sched >= 7);
