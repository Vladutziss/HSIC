import { test } from "node:test";
import assert from "node:assert/strict";
import { activeContext, addNote, cleanNote, recordFeedback, removeNote, summarizeFeedback } from "../src/lib/memory.js";

const code = async (p) => p.then(() => null, (e) => e?.code);

test("cleanNote trims, clips, strips control characters", () => {
  const n = cleanNote({ kind: "event", body: "  Examen\u0000 \n vineri\t ", endsOn: "2026-10-20" });
  assert.deepEqual(n, { kind: "event", body: "Examen vineri", starts_on: null, ends_on: "2026-10-20" });
  assert.equal(cleanNote({ kind: "note", body: "x".repeat(500) }).body.length, 300);
});

test("cleanNote rejects empty, bad kind, bad or reversed dates", () => {
  for (const bad of [
    { kind: "note", body: "   " },
    { kind: "note", body: "\u0001\u0002" },
    { kind: "nope", body: "x" },
    { kind: "note", body: "x", endsOn: "2026-13-40" },
    { kind: "note", body: "x", startsOn: "2026-10-05", endsOn: "2026-10-04" },
    { kind: "note", body: "x", startsOn: "05/10/2026" },
  ]) assert.throws(() => cleanNote(bad), { code: "invalid_note" });
  assert.equal(cleanNote({ kind: "note", body: "x", startsOn: "2026-10-05", endsOn: "2026-10-05" }).ends_on, "2026-10-05");
});

test("activeContext: inclusive date boundaries, newest first, max 20", () => {
  const rows = [
    { id: "past", ends_on: "2026-10-04", created_at: "2026-10-01" },
    { id: "ends-today", ends_on: "2026-10-05", created_at: "2026-10-02" },
    { id: "starts-today", starts_on: "2026-10-05", created_at: "2026-10-03" },
    { id: "future", starts_on: "2026-10-06", created_at: "2026-10-04" },
    { id: "open", created_at: "2026-10-06" },
  ];
  assert.deepEqual(activeContext(rows, "2026-10-05").map((r) => r.id), ["open", "starts-today", "ends-today"]);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: i, created_at: `2026-09-${String(i + 1).padStart(2, "0")}` }));
  assert.equal(activeContext(many, "2026-10-05").length, 20);
  assert.deepEqual(activeContext(null, "2026-10-05"), []);
});

test("summarizeFeedback counts rejections and keeps the last 5 reasons", () => {
  const rows = [
    { decision: "accepted", proposal: { action: "add" }, created_at: "2026-10-01" },
    ...Array.from({ length: 7 }, (_, i) => ({
      decision: "rejected",
      proposal: { action: i % 2 ? "change" : "add", days: [4, 0, 2] },
      reason: `motiv ${i}`,
      created_at: `2026-10-0${i + 1}`,
    })),
    { decision: "rejected", proposal: { action: "add" }, reason: "  ", created_at: "2026-10-09" },
  ];
  const s = summarizeFeedback(rows);
  assert.equal(s.accepted, 1);
  assert.equal(s.rejected, 8);
  assert.deepEqual(s.rejectedByAction, { add: 5, change: 3 });
  assert.deepEqual(s.rejectedByDays, { "0,2,4": 7 });
  assert.deepEqual(s.lastReasons, ["motiv 6", "motiv 5", "motiv 4", "motiv 3", "motiv 2"]);
  assert.equal(summarizeFeedback(undefined).rejected, 0);
});

/** Minimal fake of the supabase-js query chain used by memory.js. */
function fakeClient(rows = [], { insertError } = {}) {
  const log = [];
  return {
    log,
    from(table) {
      const q = {
        select: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: rows, error: null }),
        insert(row) {
          log.push(["insert", table, row]);
          const res = insertError ? { data: null, error: insertError } : { data: { id: "new", ...row }, error: null };
          return { select: () => ({ single: () => Promise.resolve(res) }), then: (f) => f({ error: res.error }) };
        },
        delete: () => ({ eq: (c, v) => (log.push(["delete", table, c, v]), Promise.resolve({ error: null })) }),
      };
      return q;
    },
  };
}

test("addNote enforces the 50 active note cap, expired notes do not count", async () => {
  const active = Array.from({ length: 49 }, (_, i) => ({ id: i, ends_on: null }));
  const expired = { id: "old", ends_on: "2026-01-01" };
  const ok = await addNote(fakeClient([...active, expired]), { kind: "note", body: "a 50-a" }, "2026-10-05");
  assert.equal(ok.body, "a 50-a");
  const full = fakeClient([...active, { id: 49, ends_on: "2026-10-05" }]);
  assert.equal(await code(addNote(full, { kind: "note", body: "a 51-a" }, "2026-10-05")), "context_limit");
  assert.equal(full.log.length, 0);
});

test("data layer errors are {code} objects", async () => {
  assert.equal(await code(addNote(null, { kind: "note", body: "x" })), "unavailable");
  assert.equal(await code(addNote(fakeClient(), { kind: "note", body: "" })), "invalid_note");
  assert.equal(await code(addNote(fakeClient([], { insertError: { message: "context_limit" } }), { kind: "note", body: "x" })), "context_limit");
  assert.equal(await code(addNote(fakeClient([], { insertError: { message: "boom" } }), { kind: "note", body: "x" })), "db_error");
  assert.equal(await code(removeNote(fakeClient(), "")), "invalid_note");
  assert.equal(await code(recordFeedback(fakeClient(), { proposal: {}, decision: "maybe" })), "invalid_note");
});

test("recordFeedback clips the reason and removeNote deletes by id", async () => {
  const c = fakeClient();
  await recordFeedback(c, { proposal: { action: "add" }, decision: "rejected", reason: "y".repeat(400) });
  assert.equal(c.log[0][2].reason.length, 200);
  await removeNote(c, "abc");
  assert.deepEqual(c.log[1], ["delete", "user_context", "id", "abc"]);
});
