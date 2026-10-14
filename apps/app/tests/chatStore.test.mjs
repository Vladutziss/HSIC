import test from "node:test";
import assert from "node:assert/strict";
import { append, clear, load, loadLocal, mapRow, saveLocal } from "../src/lib/chatStore.js";

test("mapRow maps snake_case to camelCase, plan defaults to null", () => {
  assert.deepEqual(mapRow({ id: "1", role: "user", content: "hi", created_at: "t" }), { id: "1", role: "user", content: "hi", plan: null, createdAt: "t" });
  assert.deepEqual(mapRow({ id: "2", role: "assistant", content: "x", plan: { a: 1 }, created_at: "t" }).plan, { a: 1 });
});

test("load returns oldest first and passes the limit", async () => {
  let lim;
  const rows = [{ id: "3", created_at: "c" }, { id: "2", created_at: "b" }, { id: "1", created_at: "a" }];
  const client = { from: () => ({ select: () => ({ order: () => ({ limit: async (n) => ((lim = n), { data: rows, error: null }) }) }) }) };
  const out = await load(client, { limit: 3 });
  assert.equal(lim, 3);
  assert.deepEqual(out.map((m) => m.id), ["1", "2", "3"]);
});

test("append inserts the row and maps the result", async () => {
  let inserted;
  const client = { from: () => ({ insert: (row) => ((inserted = row), { select: () => ({ single: async () => ({ data: { ...row, id: "9", created_at: "t" }, error: null }) }) }) }) };
  const out = await append(client, { role: "assistant", content: "ok", plan: { steps: [] } });
  assert.deepEqual(inserted, { role: "assistant", content: "ok", plan: { steps: [] } });
  assert.equal(out.id, "9");
  assert.equal(out.createdAt, "t");
});

test("clear deletes; errors become {code}", async () => {
  let deleted = false;
  const ok = { from: () => ({ delete: () => ({ not: async () => ((deleted = true), { error: null }) }) }) };
  await clear(ok);
  assert.ok(deleted);
  const bad = { from: () => ({ delete: () => ({ not: async () => ({ error: {} }) }), insert: () => ({ select: () => ({ single: async () => ({ error: {} }) }) }) }) };
  await assert.rejects(clear(bad), { code: "db_error" });
  await assert.rejects(append(bad, { role: "user", content: "x" }), { code: "db_error" });
  await assert.rejects(load(null), { code: "unavailable" });
  await assert.rejects(clear(null), { code: "unavailable" });
});

test("local fallback keeps the last 40 and survives missing storage", () => {
  assert.deepEqual(loadLocal(), []); // no localStorage in node
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  saveLocal(Array.from({ length: 50 }, (_, i) => ({ id: String(i) })));
  const back = loadLocal();
  assert.equal(back.length, 40);
  assert.equal(back[0].id, "10");
  delete globalThis.localStorage;
});
