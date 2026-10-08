// Statistics for Molted, computed next to the data. Deployed as a Supabase Edge Function:
//
//   npm run sync:functions && supabase functions deploy stats
//
// Body: {today: "YYYY-MM-DD"} (the player's local day). Reply: {stats: {...}} (see src/lib/stats.js)
// or {code} with a non-2xx status. It runs the same rules (src/lib/engine.js) as the client, on the
// caller's own rows (their JWT, so RLS applies).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadState } from "../_shared/app/remote.js";
import { buildStats } from "../_shared/app/stats.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string) => reply(status, { code });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request");

  const auth = req.headers.get("Authorization");
  if (!auth) return fail(401, "session_expired");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: who, error: authError } = await supabase.auth.getUser();
  if (authError || !who.user) return fail(401, "session_expired");

  let today: unknown;
  try {
    today = (await req.json())?.today;
  } catch {
    return fail(400, "bad_request");
  }
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return fail(400, "bad_request");

  try {
    const state = await loadState(supabase, who.user.id);
    return reply(200, { stats: state ? buildStats(state, today) : null });
  } catch (e) {
    console.error("stats", e);
    return fail(500, "upstream_error");
  }
});
