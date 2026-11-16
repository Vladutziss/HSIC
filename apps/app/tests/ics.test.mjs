import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EVENTS, buildCalendar, calendarItems, escapeText, fold, isTimeZone, zonedToUtc } from "../src/lib/ics.js";
import { trFor } from "../../../supabase/functions/_shared/app/i18n.js";

const TODAY = "2026-11-16"; // a Monday
const state = () => ({
  profile: { nick: "Ana" },
  habits: [
    { id: "h1", name: "Sală", diff: 3, days: [1, 3, 5], time: "18:00", target: "1 oră", createdAt: "2026-10-01" },
    { id: "h2", name: "Citit", diff: 1, days: [0, 1, 2, 3, 4, 5, 6], time: null, createdAt: "2026-10-01" },
    { id: "h3", name: "Vechi", diff: 2, days: [1], time: "07:00", createdAt: "2026-10-01", archivedAt: "2026-11-01" },
  ],
  log: { [TODAY]: { h1: 1 } },
  todos: [
    { id: "t1", title: "Recapitulare; mate, cap. 3", date: "2026-11-17", time: "16:30", dur: 45, done: false },
    { id: "t2", title: "Cumpărături", date: "2026-11-15", time: null, done: true, doneOn: "2026-11-15" },
    { id: "t3", title: "Fără dată", date: null },
    { id: "t4", title: "Apă", date: "2026-11-14", time: null, repeat: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6], until: "2026-11-19" }, doneDays: ["2026-11-15"], skipDays: ["2026-11-17"] },
    { id: "t5", title: "Prea vechi", date: "2026-09-01", time: null },
    { id: "t6", title: "Cursul 5", date: "2026-11-18", time: null },
  ],
  schoolPlanner: {
    assignments: [{ id: "a1", title: "Eseu", subject: "Română", due: "2026-11-20", estimatedMinutes: 90, done: false }],
    exams: [{ id: "e1", title: "Teză", subject: "Mate", date: "2026-12-02", done: false }],
  },
  objectives: [
    {
      id: "o1",
      title: "Termin teoria",
      deadline: "2026-12-20",
      steps: [
        { id: "s1", title: "Cursul 5", date: "2026-11-18", todoId: "t6", done: false },
        { id: "s2", title: "Cursul 6", date: "2026-11-21", todoId: null, done: false },
        { id: "s3", title: "Cursul 7", date: "2026-11-22", todoId: "gone", done: true },
      ],
    },
    { id: "o2", title: "Arhivat", archived: true, deadline: "2026-11-30", steps: [{ id: "s9", title: "x", date: "2026-11-19" }] },
  ],
});

/** Unfolds the text and returns its events as objects of property -> value. */
function parse(text) {
  const lines = text.replace(/\r\n /g, "").split("\r\n");
  const events = [];
  let cur = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT") {
      events.push(cur);
      cur = null;
    } else if (cur) cur[l.slice(0, l.indexOf(":"))] = l.slice(l.indexOf(":") + 1);
  }
  return { lines, events };
}

test("a wall-clock time becomes the right instant, in winter, in summer and on the days the clocks change", () => {
  const iso = (day, hm, tz) => zonedToUtc(day, hm, tz).toISOString();
  assert.equal(iso("2026-11-16", "18:00", "Europe/Bucharest"), "2026-11-16T16:00:00.000Z"); // UTC+2
  assert.equal(iso("2026-07-10", "18:00", "Europe/Bucharest"), "2026-07-10T15:00:00.000Z"); // UTC+3
  assert.equal(iso("2026-03-29", "10:00", "Europe/Bucharest"), "2026-03-29T07:00:00.000Z"); // clocks went forward at 03:00
  assert.equal(iso("2026-03-29", "01:30", "Europe/Bucharest"), "2026-03-28T23:30:00.000Z"); // still winter time
  assert.equal(iso("2026-10-25", "10:00", "Europe/Bucharest"), "2026-10-25T08:00:00.000Z"); // clocks went back at 04:00
  assert.equal(iso("2026-11-16", "00:15", "America/New_York"), "2026-11-16T05:15:00.000Z"); // behind UTC, across midnight
  assert.equal(iso("2026-01-01", "00:00", "Asia/Kolkata"), "2025-12-31T18:30:00.000Z"); // a half-hour zone, across the year
  assert.equal(isTimeZone("Europe/Bucharest"), true);
  assert.equal(isTimeZone("Nowhere/Land"), false);
  assert.equal(isTimeZone(""), false);
});

test("text is escaped, and long lines are folded at 75 octets without cutting a character", () => {
  assert.equal(escapeText("a; b, c\\d\ne\r\nf\u0007"), "a\\; b\\, c\\\\d\\ne\\nf");
  const line = "SUMMARY:" + "ășțîâ ".repeat(30);
  const folded = fold(line);
  const enc = new TextEncoder();
  for (const part of folded.split("\r\n")) assert.ok(enc.encode(part).length <= 75, `a folded line has ${enc.encode(part).length} octets`);
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.equal(fold("SUMMARY:scurt"), "SUMMARY:scurt");
});

test("the dated things of the app, each once: to-dos, a repeat as its days, homework, exams, steps and deadlines", () => {
  const items = calendarItems(state(), { today: TODAY });
  const titles = (kind) => items.filter((i) => i.kind === kind).map((i) => `${i.day} ${i.title}`);
  assert.deepEqual(titles("todo"), [
    "2026-11-14 Apă",
    "2026-11-15 Cumpărături", // the same day: in the order of their ids
    "2026-11-15 Apă",
    "2026-11-16 Apă",
    // the 17th was taken off for that day only
    "2026-11-17 Recapitulare; mate, cap. 3",
    "2026-11-18 Apă",
    "2026-11-18 Cursul 5",
    "2026-11-19 Apă", // the last day of the repeat
  ]);
  assert.equal(items.find((i) => i.uid === "todo-t4-20261115").done, true); // only the ticked day carries the tick
  assert.equal(items.find((i) => i.uid === "todo-t4-20261116").done, false);
  assert.equal(items.find((i) => i.uid === "todo-t6").note, "Din obiectivul: Termin teoria"); // a step put in the plan is its to-do
  assert.deepEqual(titles("step"), ["2026-11-21 Termin teoria: Cursul 6", "2026-11-22 Termin teoria: Cursul 7"]);
  assert.deepEqual(titles("deadline"), ["2026-12-20 Termen: Termin teoria"]);
  assert.deepEqual(titles("homework"), ["2026-11-20 Temă: Română · Eseu"]);
  assert.deepEqual(titles("exam"), ["2026-12-02 Examen: Mate · Teză"]);
  assert.equal(items.some((i) => i.kind === "habit"), false);
  assert.equal(new Set(items.map((i) => i.uid)).size, items.length, "every item has its own id");
});

test("habits are listed only when asked, only those with a time, from today on, on their days", () => {
  const items = calendarItems(state(), { today: TODAY, habits: true, ahead: 6 }).filter((i) => i.kind === "habit");
  assert.deepEqual(items.map((i) => `${i.day} ${i.time} ${i.title} ${i.minutes}`), ["2026-11-16 18:00 Sală 60", "2026-11-18 18:00 Sală 60", "2026-11-20 18:00 Sală 60"]);
  assert.equal(items[0].done, true);
  assert.equal(items[1].done, false);
});

test("the feed is valid iCalendar: CRLF, folded lines, UTC times, all-day dates, a tick on what is done", () => {
  const text = buildCalendar(state(), { today: TODAY, tz: "Europe/Bucharest", habits: true });
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
  assert.equal(text.replace(/\r\n/g, "").includes("\n"), false, "no bare line feeds");
  const enc = new TextEncoder();
  for (const l of text.split("\r\n")) assert.ok(enc.encode(l).length <= 75);
  const { lines, events } = parse(text);
  assert.ok(lines.includes("X-WR-TIMEZONE:Europe/Bucharest"));
  assert.equal(events.length, calendarItems(state(), { today: TODAY, habits: true }).length);
  assert.equal(new Set(events.map((e) => e.UID)).size, events.length);
  for (const e of events) {
    assert.match(e.UID, /^[A-Za-z0-9._-]+@molted\.eu$/);
    assert.equal(e.DTSTAMP, "20261116T000000Z");
    assert.ok(e.SUMMARY);
  }
  const timed = events.find((e) => e.UID === "todo-t1@molted.eu");
  assert.equal(timed.DTSTART, "20261117T143000Z"); // 16:30 in Bucharest, in winter
  assert.equal(timed.DTEND, "20261117T151500Z"); // 45 minutes
  assert.equal(timed.SUMMARY, "Recapitulare\\; mate\\, cap. 3");
  const allDay = events.find((e) => e.UID === "todo-t2@molted.eu");
  assert.equal(allDay["DTSTART;VALUE=DATE"], "20261115");
  assert.equal(allDay["DTEND;VALUE=DATE"], "20261116");
  assert.equal(allDay.TRANSP, "TRANSPARENT");
  assert.equal(allDay.SUMMARY, "✓ Cumpărături");
  assert.equal(events.find((e) => e.UID === "habit-h1-20261116@molted.eu").DTSTART, "20261116T160000Z");
  // the same state on the same day gives the same bytes, so a calendar app's "has it changed?" check works
  assert.equal(buildCalendar(state(), { today: TODAY, tz: "Europe/Bucharest", habits: true }), text);
});

test("without a known time zone, times are written as local (floating) times", () => {
  const { lines, events } = parse(buildCalendar(state(), { today: TODAY, tz: "Nowhere/Land" }));
  assert.equal(lines.some((l) => l.startsWith("X-WR-TIMEZONE")), false);
  const timed = events.find((e) => e.UID === "todo-t1@molted.eu");
  assert.equal(timed.DTSTART, "20261117T163000");
  assert.equal(timed.DTEND, "20261117T171500");
  const late = { todos: [{ id: "n", title: "Târziu", date: "2026-11-17", time: "23:40", dur: 45 }] };
  assert.equal(parse(buildCalendar(late, { today: TODAY })).events[0].DTEND, "20261118T002500");
});

test("the texts follow the player's language", () => {
  const en = parse(buildCalendar(state(), { today: TODAY, tz: "Europe/London", tr: trFor("en") })).events;
  assert.equal(en.find((e) => e.UID === "hw-a1@molted.eu").SUMMARY, "Homework: Română · Eseu");
  assert.equal(en.find((e) => e.UID === "exam-e1@molted.eu").SUMMARY, "Exam: Mate · Teză");
  assert.equal(en.find((e) => e.UID === "goal-o1@molted.eu").SUMMARY, "Deadline: Termin teoria");
  assert.equal(en.find((e) => e.UID === "hw-a1@molted.eu").DESCRIPTION, "Estimate: 90 min");
  const ro = parse(buildCalendar(state(), { today: TODAY, tr: trFor("ro") })).events;
  assert.equal(ro.find((e) => e.UID === "exam-e1@molted.eu").SUMMARY, "Examen: Mate · Teză");
});

test("a huge plan is cut to the nearest events, and odd input does not break the feed", () => {
  const many = { todos: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, title: `Zilnic ${i}`, date: "2026-01-01", time: null, repeat: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6], until: null } })) };
  const items = calendarItems(many, { today: TODAY });
  assert.equal(items.length, MAX_EVENTS);
  assert.ok(items.some((i) => i.day === TODAY));
  assert.doesNotThrow(() => buildCalendar({}, { today: TODAY, tz: "Europe/Bucharest" }));
  assert.doesNotThrow(() => buildCalendar(null, { today: TODAY }));
  const odd = { todos: [{ id: "x y/z", title: "  ", date: "2026-11-16" }, { id: "ok", title: "Bun", date: "2026-11-16", time: "25:99", dur: "abc" }], schoolPlanner: { assignments: [{ title: "Fără id", due: "2026-11-18" }] } };
  const parsed = parse(buildCalendar(odd, { today: TODAY, tz: "Europe/Bucharest" })).events;
  assert.equal(parsed.length, 2);
  assert.ok(parsed.find((e) => e.UID === "todo-ok@molted.eu")["DTSTART;VALUE=DATE"], "a bad time falls back to an all-day item");
  assert.match(parsed.find((e) => e.UID.startsWith("hw-")).UID, /^hw-[a-z0-9]+@molted\.eu$/);
});
