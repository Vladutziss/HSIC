// Test fixture: three weeks of generated history (rising momentum, a reset after three quiet
// days, a revived streak, proofs with story fragments, AI reviews, to-dos). Not part of the app.

import { CODE, DIFF, isScheduled } from "../../src/lib/engine.js";
import { addDays, monthKey, weekday } from "../../src/lib/dates.js";
import { uid } from "../../src/lib/catalog.js";
import { TEMPLATE_TITLES, templateReview, templateStory } from "../../src/lib/ai.js";

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERDICT = { [CODE.SELF]: "self", [CODE.PLAUSIBLE]: "plausible", [CODE.VERIFIED]: "verified" };
const NOTES = [
  "Am terminat tot, chiar dacă a fost greu la final.",
  "Azi a mers mai ușor decât săptămâna trecută.",
  "Am făcut-o dimineața, înainte de școală.",
  "Puțin mai scurt decât planul, dar complet.",
];

export function seedHistory(state, today) {
  const rng = mulberry32(20261005);
  const start = addDays(today, -24);
  const gap = new Set([addDays(today, -17), addDays(today, -16), addDays(today, -15)]); // resets momentum
  const missed = addDays(today, -7); // a single missed day, revived the next day
  state.meta = { ...state.meta, start };
  for (const h of state.habits) h.createdAt = start;

  const log = {};
  const reviews = {};
  const proofs = [];
  for (let d = start; d < today; d = addDays(d, 1)) {
    if (gap.has(d) || d === missed) continue;
    const weekend = weekday(d) === 0 || weekday(d) === 6;
    const p = weekend ? 0.7 : 0.85;
    const entries = {};
    for (const h of state.habits) {
      if (!isScheduled(h, d) || rng() > p) continue;
      const r = rng();
      const code = r < 0.24 ? CODE.VERIFIED : r < 0.36 ? CODE.PLAUSIBLE : r < 0.42 ? CODE.SELF : CODE.DONE;
      entries[h.id] = code;
      if (code !== CODE.DONE) proofs.push({ day: d, habit: h, code });
    }
    if (!Object.keys(entries).length) {
      const h = state.habits.find((x) => isScheduled(x, d)) || state.habits[0];
      entries[h.id] = CODE.DONE;
    }
    log[d] = entries;
    if (rng() < 0.75) reviews[d] = { ai: Math.round(58 + rng() * 38), at: `${d}T21:04:00` };
  }
  state.log = log;
  state.reviews = reviews;
  state.streak = { revived: { [missed]: addDays(missed, 1) } };

  const T = (title, date, time, dur, done = false) => ({
    id: uid("t"),
    title,
    date,
    time,
    dur: dur || 30,
    done,
    doneOn: done ? date : null,
    createdAt: start,
  });
  state.todos = [
    T("Cumpărături pentru săptămână", addDays(today, -3), "18:30", 45, true),
    T("Programare la dentist", addDays(today, -2), "10:00", 60, true),
    T("Trimite tema la profesor", addDays(today, -1), null, 30, true),
    T("Planifică săptămâna", today, "09:00", 30),
    T("Sună-l pe bunicul", today, "19:30", 20),
    T("Pregătește lucrurile pentru mâine", today, null, 15),
    T("Termină capitolul 4", addDays(today, 1), "17:00", 90),
    T("Cadou pentru ziua lui Andrei", addDays(today, 3), null, 30),
    T("Revizuiește bugetul lunar", addDays(today, 5), "20:00", 45),
    T("Idei pentru proiectul de vară", null, null, 30),
  ];

  // Story fragments and review texts live in the month documents.
  const months = {};
  const month = (d) => (months[monthKey(d)] ||= { proofs: [], reviews: {} });
  const name = state.companion?.name;
  proofs.slice(-12).forEach((p, i) => {
    const verdict = VERDICT[p.code];
    month(p.day).proofs.push({
      id: uid("p"),
      day: p.day,
      habitId: p.habit.id,
      type: verdict === "verified" ? "photo" : "note",
      note: NOTES[i % NOTES.length],
      verdict,
      reason: verdict === "verified" ? "Poza se potrivește cu misiunea." : verdict === "plausible" ? "Descrierea e credibilă." : "Dovadă salvată fără verificare AI.",
      title: TEMPLATE_TITLES[i % TEMPLATE_TITLES.length],
      story: templateStory({ pathId: state.profile.path, name, habitName: p.habit.name, verdict, seed: `${p.day}${p.habit.id}` }),
      at: `${p.day}T19:0${i % 10}:00`,
    });
  });
  for (const d of Object.keys(reviews).sort().slice(-6)) {
    const habits = state.habits.map((h) => ({
      name: h.name,
      diff: h.diff,
      diffLabel: DIFF[h.diff].label,
      scheduled: isScheduled(h, d),
      done: !!log[d]?.[h.id],
      proof: log[d]?.[h.id] > 1 ? VERDICT[log[d][h.id]] : null,
    }));
    month(d).reviews[d] = { ...templateReview({ habits }, reviews[d].ai), ai: true };
  }
  state.meta.months = Object.keys(months);
  state.seen = null;
  return { state, months };
}
