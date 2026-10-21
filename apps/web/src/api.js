// Calls the giveaway functions (supabase/migrations/0031_giveaways.sql) over REST: the anon key for public reads,
// the signed-in player's Clerk token for everything that is about them. The database decides; this only carries.
import { SUPABASE_URL, SUPABASE_KEY, configured } from "./team-data.js";

export const apiConfigured = configured;

export async function rpc(name, args = {}, token = null) {
  if (!configured) throw Object.assign(new Error("not_configured"), { network: true });
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw Object.assign(new Error("network"), { network: true });
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) throw Object.assign(new Error(body?.message || `http_${res.status}`), { detail: body?.details, status: res.status });
  return body;
}
