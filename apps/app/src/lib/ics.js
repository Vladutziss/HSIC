// The calendar feed: Molted's dated things as iCalendar text (RFC 5545), for Google Calendar, Apple Calendar and
// Outlook to subscribe to. Read-only by nature: a calendar app shows the feed, it cannot write back.
//
// What goes in: to-dos that have a date (a repeating one as its single days), homework on its due day, exams,
// goal steps put on a day, goal deadlines and, when asked, habits that have a time.
//
// Two choices keep every calendar app happy without shipping time-zone tables:
//   * repeats are written out day by day inside a rolling window (the app's own occursOn() decides, so the calendar
//     and Molted cannot disagree, and a ticked day can carry its tick);
//   * a time is converted from the player's wall clock to UTC for that very day, so clock changes are right.
//
// Pure: served by supabase/functions/calendar (copied there by `npm run sync:functions`), tested in tests/ics.test.mjs.

import { addDays, dayRange } from "./dates.js";
import { isScheduled } from "./engine.js";
import { tr as trPage } from "./i18n.js";
import { goalTodoIndex } from "./objectives.js";
import { schoolPlanner } from "./schoolPlanner.js";
import { isDoneOn, occursOn } from "./todos.js";

export const WINDOW = { past: 30, ahead: 90, habitsAhead: 45 };
export const MAX_EVENTS = 2000;
const HABIT_MIN = { 1: 20, 2: 30, 3: 60 }; // like the blocks in the app's own calendar (screens/Planner.jsx)
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ------------------------------------------------------------ time zones

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    let f = null;
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      f = null; // not a zone this runtime knows
    }
    formatters.set(tz, f);
  }
  return formatters.get(tz);
}
export const isTimeZone = (tz) => typeof tz === "string" && !!tz && !!formatter(tz);

/** The calendar day ("YYYY-MM-DD") it is in `tz` at the instant `now` (in Bucharest when the zone is not a known one). */
export function dayInZone(now, tz) {
  const zone = isTimeZone(tz) ? tz : "Europe/Bucharest";
  const p = {};
  for (const x of formatter(zone).formatToParts(now)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(utcMs, tz) {
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(utcMs))) p[x.type] = Number(x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs) / 60000;
}

/** The instant a wall-clock time ("YYYY-MM-DD", "HH:MM") happens in `tz`, as a Date. */
export function zonedToUtc(day, hm, tz) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMinutes(wall, tz) * 60000;
  return new Date(wall - offsetMinutes(first, tz) * 60000); // the second pass settles the hours around a clock change
}

// ------------------------------------------------------------ text

const pad = (n) => String(n).padStart(2, "0");
const compact = (day) => day.replace(/-/g, "");
const utcStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** TEXT values: backslash, semicolon, comma and line breaks are escaped; other control characters are dropped. */
export const escapeText = (s) =>
  String(s ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

const utf8 = new TextEncoder();
/** A content line folded at 75 octets (never inside a character); continuation lines start with a space. */
export function fold(line) {
  if (utf8.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    const limit = out.length ? 74 : 75; // the leading space of a continuation counts
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A stable id for things that have none of their own (homework typed before it had rows). */
function hashId(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const uidPart = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);

// ------------------------------------------------------------ events

/**
 * The dated items of `state`, as plain objects (also what the tests look at):
 *   { uid, day, time: "HH:MM"|null, minutes, title, note, kind: "todo"|"homework"|"exam"|"step"|"deadline"|"habit", done }
 * opts: { today, habits, tr, past, ahead }.
 */
export function calendarItems(state, { today, habits = false, tr = trPage, past = WINDOW.past, ahead = WINDOW.ahead } = {}) {
  const from = addDays(today, -past);
  const to = addDays(today, ahead);
  const inWindow = (d) => DAY.test(d || "") && d >= from && d <= to;
  const items = [];
  const goals = goalTodoIndex(state);
  const todoIds = new Set((state?.todos || []).map((t) => t.id));

  for (const t of state?.todos || []) {
    if (!DAY.test(t.date || "") || !String(t.title || "").trim()) continue;
    const goal = goals[t.id];
    const base = { kind: "todo", time: TIME.test(t.time || "") ? t.time : null, minutes: Math.max(5, Math.min(600, Number(t.dur) || 30)), title: t.title, note: goal ? tr("Din obiectivul: {label}", { label: goal.label }) : "" };
    if (!t.repeat) {
      if (inWindow(t.date)) items.push({ ...base, uid: `todo-${uidPart(t.id)}`, day: t.date, done: !!t.done });
      continue;
    }
    for (const day of dayRange(t.date > from ? t.date : from, to)) {
      if (occursOn(t, day)) items.push({ ...base, uid: `todo-${uidPart(t.id)}-${compact(day)}`, day, done: isDoneOn(t, day) });
    }
  }

  const school = schoolPlanner(state);
  for (const a of school.assignments) {
    if (!inWindow(a.due) || !String(a.title || "").trim()) continue;
    items.push({
      kind: "homework",
      uid: `hw-${uidPart(a.id || hashId(`${a.title}|${a.due}`))}`,
      day: a.due,
      time: null,
      title: tr("Temă: {title}", { title: a.subject ? `${a.subject} · ${a.title}` : a.title }),
      note: a.estimatedMinutes ? tr("Estimare: {n} min", { n: a.estimatedMinutes }) : "",
      done: !!a.done,
    });
  }
  for (const e of school.exams) {
    if (!inWindow(e.date) || !String(e.title || "").trim()) continue;
    items.push({ kind: "exam", uid: `exam-${uidPart(e.id || hashId(`${e.title}|${e.date}`))}`, day: e.date, time: null, title: tr("Examen: {title}", { title: e.subject ? `${e.subject} · ${e.title}` : e.title }), note: "", done: !!e.done });
  }

  for (const o of state?.objectives || []) {
    if (o.archived) continue;
    for (const s of o.steps || []) {
      // a step put in the plan is a to-do already; it is listed once, as that to-do
      if (!inWindow(s.date) || (s.todoId && todoIds.has(s.todoId))) continue;
      items.push({ kind: "step", uid: `step-${uidPart(o.id)}-${uidPart(s.id)}`, day: s.date, time: null, title: `${o.title}: ${s.title}`, note: tr("Pas din obiectivul: {label}", { label: o.title }), done: !!s.done });
    }
    if (inWindow(o.deadline)) items.push({ kind: "deadline", uid: `goal-${uidPart(o.id)}`, day: o.deadline, time: null, title: tr("Termen: {title}", { title: o.title }), note: "", done: !!o.doneOn });
  }

  if (habits) {
    const until = addDays(today, Math.min(ahead, WINDOW.habitsAhead));
    for (const h of state?.habits || []) {
      if (h.archivedAt || !TIME.test(h.time || "")) continue;
      for (const day of dayRange(today, until)) {
        if (!isScheduled(h, day)) continue;
        items.push({ kind: "habit", uid: `habit-${uidPart(h.id)}-${compact(day)}`, day, time: h.time, minutes: HABIT_MIN[h.diff] || 30, title: h.name, note: h.target ? String(h.target) : "", done: !!state?.log?.[day]?.[h.id] });
      }
    }
  }

  // nearest first when the list has to be cut: what is far in the past or in the future goes
  if (items.length > MAX_EVENTS) {
    const gap = (i) => Math.abs(Date.parse(i.day) - Date.parse(today));
    items.sort((a, b) => gap(a) - gap(b));
    items.length = MAX_EVENTS;
  }
  return items.sort((a, b) => (a.day + (a.time || "")).localeCompare(b.day + (b.time || "")) || a.uid.localeCompare(b.uid));
}

/**
 * The feed as text. opts: { today (the player's local day), tz (their IANA zone; without one, times are written as
 * "floating" local times), habits, tr, name }.
 */
export function buildCalendar(state, opts = {}) {
  const { today, tr = trPage, name = "Molted" } = opts;
  const tz = isTimeZone(opts.tz) ? opts.tz : null;
  const categories = { todo: tr("To-do"), homework: tr("Teme"), exam: tr("Examene"), step: tr("Obiective"), deadline: tr("Obiective"), habit: tr("Obiceiuri") };
  const stamp = `${compact(today)}T000000Z`; // the same all day, so an unchanged feed is byte for byte the same
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Molted//Calendar 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(tr("To-do-urile, temele și pașii tăi din Molted. Se schimbă doar din aplicație."))}`,
    ...(tz ? [`X-WR-TIMEZONE:${tz}`] : []),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const it of calendarItems(state, opts)) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@molted.eu`, `DTSTAMP:${stamp}`);
    if (it.time) {
      const startDay = compact(it.day);
      const [hh, mm] = it.time.split(":").map(Number);
      if (tz) {
        const start = zonedToUtc(it.day, it.time, tz);
        lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(new Date(start.getTime() + it.minutes * 60000))}`);
      } else {
        const end = hh * 60 + mm + it.minutes;
        const endDay = end >= 1440 ? compact(addDays(it.day, 1)) : startDay;
        lines.push(`DTSTART:${startDay}T${pad(hh)}${pad(mm)}00`, `DTEND:${endDay}T${pad(Math.floor(end / 60) % 24)}${pad(end % 60)}00`);
      }
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(it.day)}`, `DTEND;VALUE=DATE:${compact(addDays(it.day, 1))}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`SUMMARY:${escapeText((it.done ? "✓ " : "") + it.title)}`);
    if (it.note) lines.push(`DESCRIPTION:${escapeText(it.note)}`);
    lines.push(`CATEGORIES:${escapeText(categories[it.kind])}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
