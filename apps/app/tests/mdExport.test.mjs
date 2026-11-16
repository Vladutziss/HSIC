import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFacts, dayMarkdown, exportNotes, hasContent, longDate, noteName, reflectionDay } from "../src/lib/mdExport.js";
import { crc32, zipFiles } from "../src/lib/zip.js";
import { trFor } from "../../../supabase/functions/_shared/app/i18n.js";

const DAY = "2026-11-16"; // a Monday
const state = () => ({
  profile: { nick: "Ana", path: "studiu" },
  meta: { start: "2026-11-10" },
  habits: [
    { id: "h1", name: "Citit", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10" },
    { id: "h2", name: "Sală", diff: 3, days: [2, 4], createdAt: "2026-11-10" }, // not on a Monday
    { id: "h3", name: "Meditație", diff: 1, days: [1], createdAt: "2026-11-10" },
  ],
  companion: { retired: [{ id: "hx", name: "Pian", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10", archivedAt: "2026-11-16", log: { "2026-11-15": 1 } }] },
  log: { "2026-11-14": { h1: 1 }, "2026-11-15": { h1: 1 }, [DAY]: { h1: 1, h2: 1 } },
  reviews: { [DAY]: { ai: 80, at: "2026-11-16T19:00:00Z" } },
  todos: [
    { id: "t1", title: "Recapitulare   mate", date: DAY, done: true, doneOn: DAY },
    { id: "t2", title: "Eseu", date: DAY, done: true, doneOn: "2026-11-18" }, // finished two days later
    { id: "t3", title: "Apă", date: "2026-11-10", repeat: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6], until: null }, doneDays: [DAY] },
    { id: "t4", title: "Altă zi", date: "2026-11-17" },
  ],
  focusSessions: [
    { start: new Date(2026, 10, 16, 17, 0).getTime(), work: 25 * 60, cycles: 1 },
    { start: new Date(2026, 10, 16, 18, 0).getTime(), work: 20 * 60, cycles: 0 },
    { start: new Date(2026, 10, 15, 18, 0).getTime(), work: 600, cycles: 0 },
  ],
});
const review = { summary: "Ai bifat cititul și sala.\nBine.", highlight: "Sala,  deși nu era programată", tip: "Mâine începe cu cititul.", ai: true };
const reflection = { week: "2026-W47", answer: "M-a ajutat să citesc dimineața.", observation: "Dimineața bifezi mai des.", nextStep: "Pune cititul la 7:30.", createdAt: new Date(2026, 10, 16, 20, 0).toISOString() };

test("the facts of a day: habits scheduled or ticked, the to-dos of that day, focus time, the report", () => {
  const f = dayFacts(state(), DAY, { review, reflections: [reflection] });
  assert.deepEqual(f.habits, [
    { name: "Citit", scheduled: true, done: true },
    { name: "Sală", scheduled: false, done: true }, // ticked without being scheduled
    { name: "Meditație", scheduled: true, done: false },
  ]);
  assert.deepEqual(f.todos, [
    { title: "Recapitulare   mate", done: true },
    { title: "Eseu", done: false }, // it was still open on that day
    { title: "Apă", done: true },
  ]);
  assert.deepEqual(f.focus, { minutes: 45, sessions: 2 });
  assert.equal(f.streak, 3);
  assert.equal(typeof f.score, "number");
  assert.ok(f.momentum > 0);
  assert.equal(f.review.summary, review.summary);
  assert.equal(f.reflections[0].nextStep, "Pune cititul la 7:30.");
  assert.equal(hasContent(f), true);
  // a habit deleted since is still part of the day it was ticked on
  assert.ok(dayFacts(state(), "2026-11-15").habits.some((h) => h.name === "Pian" && h.done));
  // rows straight from the database (snake_case) are understood too
  assert.equal(dayFacts(state(), DAY, { reflections: [{ week: "2026-W47", answer: "a", observation: "b", next_step: "c" }] }).reflections[0].nextStep, "c");
  assert.equal(hasContent(dayFacts({}, DAY)), false);
});

test("the note: front matter Obsidian reads as properties, tasks as check boxes, one line per item", () => {
  const md = dayMarkdown(dayFacts(state(), DAY, { review, reflections: [reflection] }), { tr: trFor("ro"), lang: "ro" });
  const [, front, body] = md.split(/^---$/m);
  assert.match(front, /^\ndate: 2026-11-16\ntags: \[molted\]\nscore: \d+\nmomentum: \d+\nlevel: \d+\nstreak: 3\nhabits_done: 2\nhabits_scheduled: 2\nfocus_minutes: 45\n$/);
  assert.match(body, /^\n\n# Luni, 16 noiembrie 2026\n\n> Scor: \d+\/100 · Momentum: \d+ · Nivel \d \([^)]+\) · Serie: 3 zile\n/);
  assert.ok(body.includes("## Raportul de seară\n\nAi bifat cititul și sala.\nBine.\n\n**Momentul zilei:** Sala, deși nu era programată\n\n**Sfat pentru mâine:** Mâine începe cu cititul.\n"));
  assert.ok(body.includes("## Obiceiuri\n\n- [x] Citit\n- [x] Sală (opțional)\n- [ ] Meditație\n"));
  assert.ok(body.includes("## To-do-uri\n\n- [x] Recapitulare mate\n- [ ] Eseu\n- [x] Apă\n"));
  assert.ok(body.includes("## Focus\n\n45 min de concentrare, în 2 sesiuni.\n"));
  assert.ok(body.includes("## Reflecția săptămânii (2026-W47)\n\n**Ce am scris:** M-a ajutat să citesc dimineața.\n\n**Observația lui Molt:** Dimineața bifezi mai des.\n\n- [ ] Pasul următor: Pune cititul la 7:30.\n"));
  assert.equal(md.includes("\n\n\n"), false, "no runs of empty lines");
  assert.ok(md.endsWith("\n") && !md.endsWith("\n\n"));
});

test("the note in English, and a day with nothing but a tick", () => {
  const md = dayMarkdown(dayFacts(state(), DAY, { review }), { tr: trFor("en"), lang: "en" });
  assert.ok(md.includes("# Monday, 16 November 2026"));
  assert.ok(md.includes("## Evening report"));
  assert.ok(md.includes("**Highlight of the day:**"));
  assert.ok(md.includes("- [x] Sală (optional)"));
  assert.ok(md.includes("## To-dos"));
  assert.match(md, /Level \d \((Spark|Ember|Flame|Torch|Campfire|Lighthouse|Blaze|Comet|Star|Supernova)\)/);
  // with nothing Romanian typed by the player, nothing Romanian is left in an English note
  const plain = { ...state(), habits: [{ id: "h1", name: "Reading", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10" }], companion: {}, todos: [{ id: "t", title: "Essay", date: DAY }] };
  const english = dayMarkdown(dayFacts(plain, DAY, { review: { summary: "Good.", highlight: "Reading", tip: "Again." }, reflections: [{ week: "2026-W47", answer: "a", observation: "b", nextStep: "c" }] }), { tr: trFor("en"), lang: "en" });
  assert.equal(/[ăâîșțĂÂÎȘȚ]/.test(english), false, english);
  assert.ok(english.includes("## The week's reflection (2026-W47)") && english.includes("- [ ] Next step: c") && english.includes("min of focus, in 2 sessions."));
  const quiet = dayMarkdown(dayFacts(state(), "2026-11-14"), { tr: trFor("ro"), lang: "ro" });
  assert.ok(quiet.includes("- [x] Citit"));
  assert.equal(quiet.includes("## Raportul de seară"), false);
  assert.ok(quiet.includes("Serie: o zi"));
  assert.equal(longDate("2026-01-01", "en"), "Thursday, 1 January 2026");
});

test("many days at once: one note per day that has something, reflections on the day they were written", () => {
  const days = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", DAY, "bad"];
  const notes = exportNotes(state(), days, { today: "2026-11-18", reviews: { [DAY]: review }, reflections: [reflection], tr: trFor("ro"), lang: "ro" });
  assert.deepEqual(notes.map((n) => n.name), ["2026-11-12.md", "2026-11-13.md", "2026-11-14.md", "2026-11-15.md", "2026-11-16.md"]); // the daily to-do gives every day a line
  assert.deepEqual(exportNotes({ ...state(), todos: [] }, days, { today: "2026-11-18" }).map((n) => n.day), ["2026-11-14", "2026-11-15", DAY]);
  assert.ok(notes[4].text.includes("## Reflecția săptămânii (2026-W47)"));
  assert.equal(notes[3].text.includes("Reflecția"), false);
  // a past day is a closed day: it has its score even without a report
  assert.match(notes[2].text, /\nscore: \d+\n/);
  assert.equal(noteName(DAY), "2026-11-16.md");
  assert.deepEqual(exportNotes(state(), []), []);
  // the day a reflection belongs to follows the player's clock, not the server's
  assert.equal(reflectionDay({ created_at: "2026-11-16T22:30:00Z" }, 120), "2026-11-17");
  assert.equal(reflectionDay({ created_at: "2026-11-16T22:30:00Z" }, 0), "2026-11-16");
  assert.equal(reflectionDay({ created_at: "nonsense" }), null);
});

test("the zip archive: stored files with the right checksums, sizes and UTF-8 names", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926); // the standard check value
  const files = [{ name: "Molted/2026-11-16.md", text: "# Luni\n\nȘase țânțari.\n" }, { name: "Molted/2026-11-17.md", text: "" }];
  const zip = zipFiles(files, new Date(2026, 10, 16, 21, 30, 10));
  const view = new DataView(zip.buffer);
  const dec = new TextDecoder();
  // end record: 2 entries, and the central directory is where it says
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  let p = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(end + 12, true), end - p);
  for (const f of files) {
    assert.equal(view.getUint32(p, true), 0x02014b50);
    const data = new TextEncoder().encode(f.text);
    assert.equal(view.getUint16(p + 8, true), 0x0800);
    assert.equal(view.getUint16(p + 10, true), 0);
    assert.equal(view.getUint32(p + 16, true), crc32(data));
    assert.equal(view.getUint32(p + 20, true), data.length);
    assert.equal(view.getUint32(p + 24, true), data.length);
    const nameLen = view.getUint16(p + 28, true);
    assert.equal(dec.decode(zip.subarray(p + 46, p + 46 + nameLen)), f.name);
    // the local header it points at carries the same file
    const local = view.getUint32(p + 42, true);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint32(local + 14, true), crc32(data));
    const localName = view.getUint16(local + 26, true);
    assert.equal(dec.decode(zip.subarray(local + 30 + localName, local + 30 + localName + data.length)), f.text);
    p += 46 + nameLen;
  }
  assert.equal(p, end);
});
