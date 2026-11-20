// The account's plan, client side: read it, redeem a code. Rules and tables: supabase/migrations/0041_plans.sql.
// Nothing runs in the artifact build (no client): the plan is then always free.

import { getClient } from "./supabase.js";
import { cleanCode, normalizePlan } from "@molted/ui/plans-core.js";

export { PLANS } from "@molted/ui/plans-core.js";

/** { plan: "free"|"pro"|"school", until: ISO|null }, or null when it cannot be read (offline, artifact build). */
export async function getPlan() {
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client.rpc("my_plan");
  if (error) return null;
  return normalizePlan(Array.isArray(data) ? data[0] : data);
}

/** Returns the new plan, or throws Error("invalid") (malformed, unknown, used up, expired, already used) or Error("too_many") (10 failed tries in an hour). */
export async function redeemCode(input) {
  const code = cleanCode(input);
  if (!code) throw new Error("invalid");
  const client = await getClient();
  if (!client) throw new Error("offline");
  const { data, error } = await client.rpc("redeem_plan_code", { p_code: code });
  if (error) throw new Error(/too_many_attempts/.test(error.message || "") ? "too_many" : "failed");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("invalid");
  return normalizePlan(row);
}
