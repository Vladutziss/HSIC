import test from "node:test";
import assert from "node:assert/strict";
import { isoWeek, load, mapRow, save } from "../src/lib/reflections.js";

test("mapRow maps snake_case to camelCase", () => {
  const r = mapRow({ id: "1", week: "2026-W41", answer: "a", observation: "o", next_step: "n", data_used: ["x"], confidence: "high", created_at: "t" });
  assert.deepEqual(r, { id: "1", week: "2026-W41", answer: "a", observation: "o", nextStep: "n", dataUsed: ["x"], confidence: "high", createdAt: "t" });
  assert.deepEqual(mapRow({ data_used: null }).dataUsed, []);
});

test("isoWeek", () => {
  assert.equal(isoWeek("2026-10-13"), "2026-W42");
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
});

test("save inserts the snake_case row, errors become {code}", async () => {
  let inserted;
  const client = {
    from: () => ({ insert: (row) => ((inserted = row), { select: () => ({ single: async () => ({ data: { ...row, id: "9" }, error: null }) }) }) }),
  };
  const out = await save(client, { week: "2026-W42", answer: "a", observation: "o", nextStep: "n", dataUsed: ["d"], confidence: "low" });
  assert.equal(inserted.next_step, "n");
  assert.equal(out.nextStep, "n");
  await assert.rejects(save(null, {}), { code: "unavailable" });
  const bad = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ error: {} }) }) }) }) };
  await assert.rejects(load(bad), { code: "db_error" });
});
