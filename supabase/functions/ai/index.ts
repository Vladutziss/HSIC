// AI for Molted, through OpenRouter. Deployed as a Supabase Edge Function:
//
//   supabase secrets set OPENROUTER_API_KEY=... AI_MODEL=<a model id from openrouter.ai/models>
//   supabase functions deploy ai
//
// Body: {kind: "review"|"moment"|"chapter", params: {...}}
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
  const { data: who, error: authError } = await supabase.auth.getUser();
  if (authError || !who.user) return fail(401, "session_expired");

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

  const content = buildPrompt(kind, body.params);

  // AI_MODEL may list several models, comma separated. The next one is tried when a model
  // is rate-limited, fails, or answers with something that is not JSON; the reasons go to the logs.
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
          max_tokens: 600,
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
      return reply(200, { result: parseJson(typeof text === "string" ? text : "") });
    } catch {
      console.error("openrouter", m, "the answer was not JSON");
      failure = { status: 502, code: "invalid_json" };
    }
  }
  return fail(failure.status, failure.code);
});
