// AI for Molted, through OpenRouter. Deployed as a Supabase Edge Function:
//
//   supabase secrets set OPENROUTER_API_KEY=... AI_MODEL=<a model id from openrouter.ai/models>
//   supabase functions deploy ai
//
// Body: {background?: true (chat only), kind: "review"|"moment"|"chapter"|"insights"|"daily_plan"|"homework_parse"|"goal_decompose"|"reflection"|"chat", params: {...}}
// Reply: {result: {...}} or {code: "..."} with a non-2xx status. Codes match aiErrorCopy() in src/lib/ai.js.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildPrompt, KINDS, type Kind } from "../_shared/prompts.ts";

const DAILY_MAX = Number(Deno.env.get("AI_DAILY_MAX") ?? 40); // calls per user per day
const MAX_BODY = 100_000; // bytes; the prompts only carry short texts

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string) => reply(status, { code });

/** Models sometimes wrap JSON in a code fence; take the outermost object. */
function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no json");
  return JSON.parse(text.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request");

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("AI_MODEL");
  if (!apiKey || !model) return fail(503, "unavailable");

  // who is asking: the caller's own JWT, so the rate limit and RLS apply to them
  const auth = req.headers.get("Authorization");
  if (!auth) return fail(401, "session_expired");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  // Clerk token: PostgREST verifies it, and requesting_user_id() hands back its `sub`
  const { data: userId, error: authError } = await supabase.rpc("requesting_user_id");
  if (authError || !userId) return fail(401, "session_expired");

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "bad_request");
  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request");
  }
  const kind = body?.kind as Kind;
  if (!KINDS.includes(kind)) return fail(400, "bad_request");

  const { data: allowed, error: usageError } = await supabase.rpc("bump_ai_usage", { daily_max: DAILY_MAX });
  if (usageError) return fail(500, "upstream_error");
  if (!allowed) return fail(429, "rate_limited");

  const content = buildPrompt(kind, body.params, body.lang);

  // A chat reply can outlive the page that asked for it (refresh, closed tab, a phone that slept): with `background` the
  // function answers "started" at once and goes on by itself, writing the assistant message into chat_messages and the
  // outcome into chat_runs (migration 0039); the page only polls that row.
  if (kind === "chat" && body.background === true) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return fail(503, "unavailable");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { error: runError } = await admin
      .from("chat_runs")
      .upsert({ user_id: userId, status: "running", error: null, started_at: new Date().toISOString(), finished_at: null });
    if (runError) return fail(500, "upstream_error");
    const finish = (status: "done" | "error", error: string | null) =>
      admin.from("chat_runs").update({ status, error, finished_at: new Date().toISOString() }).eq("user_id", userId);
    const task = (async () => {
      const r = await runModels(content, apiKey, model);
      if (!r.ok) return finish("error", r.code);
      // deno-lint-ignore no-explicit-any
      const out = r.result as any;
      const text = String(out?.reply ?? "").trim().slice(0, 600);
      if (!text) return finish("error", "invalid_json");
      const { error } = await admin.from("chat_messages").insert({ user_id: userId, role: "assistant", content: text, plan: out?.plan && typeof out.plan === "object" ? out.plan : null });
      return error ? finish("error", "upstream_error") : finish("done", null);
    })().catch((e) => {
      console.error("chat background", e);
      return finish("error", "upstream_error");
    });
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(task);
    else await task; // no background support: the request simply waits
    return reply(202, { started: true });
  }

  const r = await runModels(content, apiKey, model);
  return r.ok ? reply(200, { result: r.result }) : fail(r.status, r.code);
});

/**
 * AI_MODEL may list several models, comma separated. The next one is tried when a model is rate-limited, fails, or
 * answers with something that is not JSON; the reasons go to the logs.
 */
async function runModels(content: string, apiKey: string, model: string): Promise<{ ok: true; result: unknown } | { ok: false; status: number; code: string }> {
  const models = model.split(",").map((m) => m.trim()).filter(Boolean);
  let failure = { status: 502, code: "upstream_error" };
  for (const m of models) {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Molted" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
          max_tokens: 2500, // the free models reason first; 600 left no room for the answer
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      console.error("openrouter", m, "network error or timeout");
      failure = { status: 504, code: "upstream_error" };
      continue;
    }
    if (!res.ok) {
      console.error("openrouter", m, res.status, (await res.text()).slice(0, 300));
      failure = res.status === 429 ? { status: 429, code: "rate_limited" } : { status: 502, code: "upstream_error" };
      continue;
    }
    try {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      return { ok: true, result: parseJson(typeof text === "string" ? text : "") };
    } catch {
      console.error("openrouter", m, "the answer was not JSON");
      failure = { status: 502, code: "invalid_json" };
    }
  }
  return { ok: false, ...failure };
}
