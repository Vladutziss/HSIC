import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCalendar } from "../../../supabase/functions/_shared/calendar-core.js";

const TOKEN = "a".repeat(64);
const state = { settings: { prefs: { lang: "en" } }, todos: [{ id: "t1", title: "Essay", date: "2026-11-17", time: "16:00", dur: 30 }], schoolPlanner: { exams: [{ id: "e1", title: "Teză", date: "2026-11-20" }] } };
const deps = (over = {}) => ({
  owner: async (t) => (t === TOKEN ? { userId: "u1", tz: "Europe/Bucharest", habits: false } : null),
  state: async () => state,
  now: () => new Date("2026-11-16T22:30:00Z"), // already the 17th in Bucharest
  ...over,
});
const get = (q, headers = {}, method = "GET") => new Request(`https://x/functions/v1/calendar/molted.ics${q}`, { method, headers });

test("a good link gets the feed, in the owner's language and day, cacheable only privately", async () => {
  const r = await handleCalendar(get(`?t=${TOKEN}`), deps());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.match(r.headers.get("cache-control"), /^private/);
  const text = await r.text();
  assert.ok(text.includes("DTSTART:20261117T140000Z"));
  assert.ok(text.includes("SUMMARY:Exam: Teză"));
  assert.ok(text.includes("DTSTAMP:20261117T000000Z"), "today is the owner's local day");
  const again = await handleCalendar(get(`?t=${TOKEN}`, { "If-None-Match": r.headers.get("etag") }), deps());
  assert.equal(again.status, 304);
  assert.equal((await handleCalendar(get(`?t=${TOKEN}`, {}, "HEAD"), deps())).status, 200);
});

test("bad links look the same, writes are refused, a broken database says try later", async () => {
  for (const q of ["", "?t=", `?t=${"b".repeat(64)}`, "?t=../../etc", `?t=${TOKEN.toUpperCase()}`]) assert.equal((await handleCalendar(get(q), deps())).status, 404, q);
  assert.equal((await handleCalendar(get(`?t=${TOKEN}`, {}, "POST"), deps())).status, 405);
  const seen = [];
  const r = await handleCalendar(get(`?t=${TOKEN}`), deps({ state: async () => { throw new Error("db"); }, onError: (e) => seen.push(e.message) }));
  assert.equal(r.status, 503);
  assert.deepEqual(seen, ["db"]);
  assert.equal((await handleCalendar(get(`?t=${TOKEN}`), deps({ state: async () => null }))).status, 200, "an account before onboarding gets an empty calendar");
});
