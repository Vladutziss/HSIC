// A day of Molted as a Markdown note: the evening report, what was ticked, the to-dos, Focus time and the weekly
// reflection written that day. One file per day ("2026-11-16.md"), the shape Obsidian's daily notes use: the front
// matter becomes properties, the lists become tasks. Any other Markdown app reads it too.
//
// dayFacts() gathers the day from the app state (the same object in the browser and in the Edge Functions);
// dayMarkdown() writes it. Texts go through `tr`, so a caller picks the language: the page's on the client, the
// player's saved language on the server (trFor in the functions' i18n.js).
// Pure. Used by the Settings export, the `webhooks` function (report.created carries the note) and `notion`.
// Tested in tests/mdExport.test.mjs.

import { NAMES, dayKey, parseDay } from "./dates.js";
import { LEVELS, computeTimeline, habitExists, isScheduled, streakInfo } from "./engine.js";
import { getLocale, tr as trPage } from "./i18n.js";
import { withHistory } from "./retired.js";
import { occursOn, viewOn } from "./todos.js";

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "luni, 16 noiembrie 2026" / "Monday, 16 November 2026", first letter capital. */
export function longDate(day, lang = getLocale()) {
  const n = NAMES[lang] || NAMES.ro;
  const d = parseDay(day);
  const text = `${n.days[d.getDay()]}, ${d.getDate()} ${n.months[d.getMonth()]} ${d.getFullYear()}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The local day a reflection was written on (its created_at is an instant; `tzOffsetMin` is minutes ahead of UTC). */
export const reflectionDay = (r, tzOffsetMin = null) => {
  const at = new Date(r?.createdAt || r?.created_at || NaN);
  if (Number.isNaN(at.getTime())) return null;
  return tzOffsetMin == null ? dayKey(at) : new Date(at.getTime() + tzOffsetMin * 60000).toISOString().slice(0, 10);
};

/**
 * Everything a day note says, as data.
 *   review:      { summary, highlight, tip, score, ai } | null   (the text of the evening report: a month document
 *                on the client, a day_reviews row on the server)
 *   reflections: the reflections written that day (camelCase, see lib/reflections.js mapRow)
 *   timeline:    computeTimeline(state, today), passed in when many days are exported at once
 */
export function dayFacts(state, day, { review = null, reflections = [], timeline = null } = {}) {
  const full = withHistory(state || {}); // habits deleted since still belong to the days they were ticked on
  const log = full.log?.[day] || {};
  const habits = (full.habits || [])
    .filter((h) => habitExists(h, day))
    .map((h) => ({ name: h.name, scheduled: isScheduled(h, day), done: !!log[h.id] }))
    .filter((h) => h.scheduled || h.done);
  const todos = (state?.todos || [])
    .filter((t) => String(t.title || "").trim() && (t.repeat ? occursOn(t, day) : t.date === day || t.doneOn === day))
    .map((t) => {
      const v = viewOn(t, day);
      return { title: t.title, done: t.repeat ? !!v.done : !!t.done && (!t.doneOn || t.doneOn <= day) };
    });
  const sessions = (state?.focusSessions || []).filter((s) => dayKey(new Date(s.start)) === day);
  const entry = (timeline || computeTimeline(state || {}, day)).byDay[day] || null;
  const text = review && (review.summary || review.highlight || review.tip) ? { summary: review.summary || "", highlight: review.highlight || "", tip: review.tip || "" } : null;
  return {
    day,
    score: entry && (entry.closed || entry.reviewed) ? entry.score : null,
    momentum: entry ? entry.momentum : null,
    level: entry ? entry.level : null,
    streak: streakInfo(state || {}, day).current,
    habits,
    todos,
    focus: { minutes: Math.round(sessions.reduce((a, s) => a + (s.work || 0), 0) / 60), sessions: sessions.length },
    review: text,
    reflections: (reflections || []).map((r) => ({ week: r.week, answer: r.answer, observation: r.observation, nextStep: r.nextStep ?? r.next_step ?? "" })),
  };
}

/** Is there anything worth a note on that day? */
export const hasContent = (f) => !!(f.review || f.reflections.length || f.habits.some((h) => h.done) || f.todos.length || f.focus.sessions);

/** The note. opts: { tr, lang }. */
export function dayMarkdown(f, { tr = trPage, lang = getLocale() } = {}) {
  const done = f.habits.filter((h) => h.done).length;
  const scheduled = f.habits.filter((h) => h.scheduled).length;
  const front = ["---", `date: ${f.day}`, "tags: [molted]"];
  if (f.score != null) front.push(`score: ${f.score}`);
  if (f.momentum != null) front.push(`momentum: ${f.momentum}`);
  if (f.level != null) front.push(`level: ${f.level}`);
  front.push(`streak: ${f.streak}`, `habits_done: ${done}`, `habits_scheduled: ${scheduled}`);
  if (f.focus.minutes) front.push(`focus_minutes: ${f.focus.minutes}`);
  front.push("---");

  const out = [...front, "", `# ${longDate(f.day, lang)}`, ""];
  const numbers = [];
  if (f.score != null) numbers.push(tr("Scor: {score}/100", { score: f.score }));
  if (f.momentum != null) numbers.push(tr("Momentum: {momentum}", { momentum: f.momentum }));
  if (f.level != null) numbers.push(tr("Nivel {lvl} ({name})", { lvl: f.level, name: tr(LEVELS[f.level - 1]?.name || "") }));
  numbers.push(f.streak === 1 ? tr("Serie: o zi") : tr("Serie: {n} zile", { n: f.streak }));
  out.push(`> ${numbers.join(" · ")}`, "");

  if (f.review) {
    out.push(`## ${tr("Raportul de seară")}`, "");
    if (f.review.summary) out.push(String(f.review.summary).trim(), "");
    if (f.review.highlight) out.push(`**${tr("Momentul zilei")}:** ${oneLine(f.review.highlight)}`, "");
    if (f.review.tip) out.push(`**${tr("Sfat pentru mâine")}:** ${oneLine(f.review.tip)}`, "");
  }
  if (f.habits.length) {
    out.push(`## ${tr("Obiceiuri")}`, "");
    for (const h of f.habits) out.push(`- [${h.done ? "x" : " "}] ${oneLine(h.name)}${h.scheduled ? "" : ` (${tr("opțional")})`}`);
    out.push("");
  }
  if (f.todos.length) {
    out.push(`## ${tr("To-do-uri")}`, "");
    for (const t of f.todos) out.push(`- [${t.done ? "x" : " "}] ${oneLine(t.title)}`);
    out.push("");
  }
  if (f.focus.sessions) {
    out.push(`## ${tr("Focus")}`, "", f.focus.sessions === 1 ? tr("{min} min de concentrare, într-o sesiune.", { min: f.focus.minutes }) : tr("{min} min de concentrare, în {n} sesiuni.", { min: f.focus.minutes, n: f.focus.sessions }), "");
  }
  for (const r of f.reflections) {
    out.push(`## ${tr("Reflecția săptămânii")}${r.week ? ` (${r.week})` : ""}`, "");
    if (r.answer) out.push(`**${tr("Ce am scris")}:** ${String(r.answer).trim()}`, "");
    if (r.observation) out.push(`**${tr("Observația lui Molt")}:** ${oneLine(r.observation)}`, "");
    if (r.nextStep) out.push(`- [ ] ${tr("Pasul următor")}: ${oneLine(r.nextStep)}`, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export const noteName = (day) => `${day}.md`;

/**
 * Notes for many days, skipping the empty ones: [{ name, day, text }].
 *   reviews:     { "YYYY-MM-DD": review }
 *   reflections: all of them; each lands on the day it was written
 */
export function exportNotes(state, days, { today, reviews = {}, reflections = [], tr = trPage, lang = getLocale(), tzOffsetMin = null } = {}) {
  const list = (days || []).filter((d) => DAY.test(d)).sort();
  if (!list.length) return [];
  const last = today && today > list[list.length - 1] ? today : list[list.length - 1];
  const timeline = computeTimeline(state || {}, last);
  const byDay = {};
  for (const r of reflections || []) {
    const d = reflectionDay(r, tzOffsetMin);
    if (d) (byDay[d] ||= []).push(r);
  }
  const notes = [];
  for (const day of list) {
    const f = dayFacts(state, day, { review: reviews[day] || null, reflections: byDay[day] || [], timeline });
    if (hasContent(f)) notes.push({ name: noteName(day), day, text: dayMarkdown(f, { tr, lang }) });
  }
  return notes;
}
