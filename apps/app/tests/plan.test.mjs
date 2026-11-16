import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLANS, cleanCode, normalizePlan } from "@molted/ui/plans-core.js";

test("normalizePlan treats unknown, missing and ended grants as free", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  assert.deepEqual(normalizePlan(null, now), { plan: "free", until: null });
  assert.deepEqual(normalizePlan({ plan: "gold", until: "2027-01-01T00:00:00Z" }, now), { plan: "free", until: null });
  assert.deepEqual(normalizePlan({ plan: "pro", until: "2026-11-30T00:00:00Z" }, now), { plan: "free", until: null });
  assert.deepEqual(normalizePlan({ plan: "pro", until: null }, now), { plan: "free", until: null });
  assert.deepEqual(normalizePlan({ plan: "school", until: "2027-01-01T00:00:00Z" }, now), { plan: "school", until: "2027-01-01T00:00:00.000Z" });
  assert.deepEqual(normalizePlan({ plan: "free", until: "2027-01-01T00:00:00Z" }, now), { plan: "free", until: null });
});

test("cleanCode upper-cases and rejects what the database would", () => {
  assert.equal(cleanCode("  liceul-x-2027 "), "LICEUL-X-2027");
  assert.equal(cleanCode("abc"), null);
  assert.equal(cleanCode("a b c d"), null);
  assert.equal(cleanCode("x".repeat(41)), null);
  assert.equal(cleanCode(null), null);
});

test("the AI factors in plans-core equal the ones in bump_ai_usage (0041)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0041_plans.sql", import.meta.url), "utf8");
  const m = sql.match(/case p\.plan when 'pro' then (\d+) when 'school' then (\d+) else (\d+) end/);
  assert.ok(m, "bump_ai_usage factors not found in the migration");
  assert.equal(Number(m[1]), PLANS.pro.aiFactor);
  assert.equal(Number(m[2]), PLANS.school.aiFactor);
  assert.equal(Number(m[3]), PLANS.free.aiFactor);
});

test("the migration lists exactly the plans of plans-core", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0041_plans.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("check (plan in ('pro', 'school'))"));
  assert.deepEqual(Object.keys(PLANS), ["free", "pro", "school"]);
});
