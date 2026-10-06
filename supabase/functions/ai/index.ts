// AI for Momentum, through OpenRouter. Deployed as a Supabase Edge Function:
//
//   supabase secrets set OPENROUTER_API_KEY=... AI_MODEL=<a vision-capable model id from openrouter.ai/models>
//   supabase functions deploy ai
//
// Body: {kind: "verify"|"review"|"moment"|"chapter", params: {...}, image?: "data:image/jpeg;base64,..."}
// Reply: {result: {...}} or {code: "..."} with a non-2xx status. Codes match aiErrorCopy() in src/lib/ai.js.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildPrompt, KINDS, type Kind } from "../_shared/prompts.ts";

const DAILY_MAX = Number(Deno.env.get("AI_DAILY_MAX") ?? 40); // calls per user per day
const MAX_BODY = 3_000_000; // bytes; a 1600px JPEG is well below this
const MAX_IMAGE = 2_500_000; // characters of the data URL

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
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
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

  let image: string | null = null;
  if (body.image != null) {
    image = String(body.image);
    if (kind !== "verify" || !image.startsWith("data:image/jpeg;base64,") || image.length > MAX_IMAGE) return fail(400, "image_rejected");
  }

  const { data: allowed, error: usageError } = await supabase.rpc("bump_ai_usage", { daily_max: DAILY_MAX });
  if (usageError) return fail(500, "upstream_error");
  if (!allowed) return fail(429, "rate_limited");

  const prompt = buildPrompt(kind, body.params, !!image);
  const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt;

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Momentum" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return fail(504, "upstream_error");
  }
  if (!res.ok) return fail(res.status === 429 ? 429 : 502, res.status === 429 ? "rate_limited" : image && res.status === 400 ? "image_rejected" : "upstream_error");

  try {
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return reply(200, { result: parseJson(typeof text === "string" ? text : "") });
  } catch {
    return fail(502, "invalid_json");
  }
});
