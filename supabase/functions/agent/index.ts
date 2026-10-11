// Coach agent for Molted: reads the player's habit data, looks things up in a small cited
// knowledge base (pgvector) and proposes changes the player confirms. Deployed as a Supabase Edge Function:
//
//   npm run sync:functions && supabase functions deploy agent
//   (migration 0013_knowledge.sql, then supabase/seed/knowledge.sql from `node scripts/build-knowledge.mjs`)
//
// Body: {today: "YYYY-MM-DD"}. Reply: {summary, proposals, steps} or {code} with a non-2xx status.
// Codes match aiErrorCopy() in src/lib/ai.js. Secrets: OPENROUTER_API_KEY, AGENT_MODEL (else AI_MODEL; the
// model must support tool calling; comma separated list = fallbacks).
//
// What keeps it honest, in code and not only in the prompt:
//  - the data comes from the caller's own rows (their JWT, RLS applies), never from the request body;
//  - a source can only be cited if search_knowledge returned it in this run (validateProposals);
//  - search_knowledge always returns the source's `limits` together with what it `shows`;
//  - proposals are validated against the player's real habits and the habit limit; nothing is applied here.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadState } from "../_shared/app/remote.js";
import { coachData } from "../_shared/app/coach.js";
import { validateProposals } from "../_shared/agent-core.js";

// deno-lint-ignore no-explicit-any
declare const Supabase: any; // Edge runtime global (built-in embedding models)

const MAX_STEPS = 6; // model calls per run
const MAX_HABITS = 8; // HABIT_COLORS.length in src/lib/catalog.js
const DAILY_MAX = Number(Deno.env.get("AGENT_DAILY_MAX") ?? 15);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string) => reply(status, { code });
const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

const SYSTEM = `You are the coach agent of "Molted", a self-improvement RPG used by teenagers. You look at a player's habits of the last 4 weeks and propose at most 3 changes for next week. The player confirms every change.

Procedure:
1. Call get_habit_stats first.
2. If something should change, call search_knowledge with a short ENGLISH query about the mechanism (for example "if-then plan specific cue", "how long habit formation takes", "broken streak", "make behaviour easier"). Call it again for a different mechanism if needed.
3. For each change call propose_action, citing in "sources" only source ids returned by search_knowledge.
4. Finish with a plain-text message in Romanian, 2 or 3 sentences, addressing the player as "tu", warm, no guilt.

Rules:
- Use only the numbers from get_habit_stats. Never invent data or sources.
- "change" only for habits done under 50% of the scheduled days: lower difficulty (1-3) or move to the weekdays where it was done more. "add" only if every habit is done over 70% of the time, one small habit (difficulty 1 or 2).
- If a habit has fewer than 7 scheduled days of history, or everything is going well, propose nothing and say so.
- When you mention research, say who and when in words (for example "un studiu din 2024") and carry its limit: a source's "limits" is part of what it says. Never present an effect size as a percentage of people who succeed, never say "21 days", never promise results.
- All text for the player is in Romanian. Habit names stay as the player wrote them.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_habit_stats",
      description: "The player's active habits and, for each, how many days it was scheduled and done in the last 4 weeks, in total and per weekday (0 = Sunday).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "Search the cited research notes. Returns up to 3 sources, each with what it shows, its limits and its strength.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Short English query." } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description: "Propose one change for the player to confirm. Returns 'recorded' or why it was rejected.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["change", "add"] },
          habitId: { type: "string", description: "Existing habit id, for change only." },
          name: { type: "string", description: "Name of the new habit, for add only (Romanian, at most 40 characters)." },
          diff: { type: "integer", minimum: 1, maximum: 3 },
          days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 }, description: "Weekdays, 0 = Sunday." },
          reason: { type: "string", description: "Romanian, at most 200 characters, cites the numbers." },
          sources: { type: "array", items: { type: "string" }, description: "Source ids returned by search_knowledge." },
        },
        required: ["action", "diff", "days", "reason"],
        additionalProperties: false,
      },
    },
  },
];

// ------------------------------------------------------------ embeddings

let session: { run: (t: string, o: unknown) => Promise<ArrayLike<number>> } | undefined;
async function embed(text: string): Promise<string> {
  session ??= new Supabase.ai.Session("gte-small");
  const v = await session!.run(text, { mean_pool: true, normalize: true });
  return JSON.stringify(Array.from(v));
}

/** The seed leaves embeddings empty (and clears them when a chunk's text changes); fill them here. */
// deno-lint-ignore no-explicit-any
async function embedMissing(admin: any) {
  const { data } = await admin.from("knowledge_chunks").select("id, body").is("embedding", null);
  for (const r of data ?? []) await admin.from("knowledge_chunks").update({ embedding: await embed(r.body) }).eq("id", r.id);
}

// ------------------------------------------------------------ model

async function chat(models: string[], apiKey: string, messages: unknown[]) {
  let failure = { status: 502, code: "upstream_error" };
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Molted" },
        body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto", max_tokens: 700, temperature: 0.3 }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!res.ok) {
        console.error("agent", model, res.status, (await res.text()).slice(0, 300));
        failure = res.status === 429 ? { status: 429, code: "rate_limited" } : { status: 502, code: "upstream_error" };
        continue;
      }
      const msg = (await res.json())?.choices?.[0]?.message;
      if (msg) return { model, msg };
      failure = { status: 502, code: "invalid_json" };
    } catch {
      console.error("agent", model, "network error or timeout");
      failure = { status: 504, code: "upstream_error" };
    }
  }
  return { failure };
}

// ------------------------------------------------------------ handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request");

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const modelEnv = Deno.env.get("AGENT_MODEL") ?? Deno.env.get("AI_MODEL");
  if (!apiKey || !modelEnv) return fail(503, "unavailable");

  const auth = req.headers.get("Authorization");
  if (!auth) return fail(401, "session_expired");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userId, error: authError } = await supabase.rpc("requesting_user_id");
  if (authError || !userId) return fail(401, "session_expired");

  let today: unknown;
  try {
    today = (await req.json())?.today;
  } catch {
    return fail(400, "bad_request");
  }
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return fail(400, "bad_request");

  const { data: allowed, error: usageError } = await supabase.rpc("bump_ai_usage", { daily_max: DAILY_MAX });
  if (usageError) return fail(500, "upstream_error");
  if (!allowed) return fail(429, "rate_limited");

  let state;
  try {
    state = await loadState(supabase, userId);
  } catch (e) {
    console.error("agent loadState", e);
    return fail(500, "upstream_error");
  }
  if (!state) return reply(200, { summary: "", proposals: [], steps: [] });
  const data = coachData(state, today);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = serviceKey ? createClient(Deno.env.get("SUPABASE_URL")!, serviceKey) : null;

  // what the agent has read this run, by source id; only these can be cited
  const retrieved = new Map<string, { id: string; cite: string; doi: string; strength: string; shows: string; limits: string }>();
  const rawProposals: unknown[] = [];
  const steps: unknown[] = [];

  // deno-lint-ignore no-explicit-any
  async function runTool(name: string, args: any): Promise<string> {
    if (name === "get_habit_stats") {
      steps.push({ kind: "stats" });
      return JSON.stringify({ ...data, maxHabits: MAX_HABITS });
    }
    if (name === "search_knowledge") {
      const query = clip(args?.query, 200);
      if (!query) return "error: empty query";
      if (admin) await embedMissing(admin);
      const { data: hits, error } = await supabase.rpc("match_knowledge", { query_embedding: await embed(query), k: 6 });
      if (error) {
        console.error("agent match_knowledge", error);
        return "error: knowledge base unavailable";
      }
      const sources = [...new Set((hits ?? []).map((h: { source: string }) => h.source))].slice(0, 3) as string[];
      const { data: rows } = sources.length ? await supabase.from("knowledge_chunks").select("id, source, kind, cite, doi, strength, body").in("source", sources) : { data: [] };
      for (const id of sources) {
        // deno-lint-ignore no-explicit-any
        const mine = (rows ?? []).filter((r: any) => r.source === id);
        // deno-lint-ignore no-explicit-any
        const shows = mine.find((r: any) => r.kind === "shows");
        // deno-lint-ignore no-explicit-any
        const limits = mine.find((r: any) => r.kind === "limits");
        if (shows && limits) retrieved.set(id, { id, cite: shows.cite, doi: shows.doi, strength: shows.strength, shows: shows.body, limits: limits.body });
      }
      steps.push({ kind: "search", query, sources: sources.filter((s) => retrieved.has(s)) });
      return JSON.stringify(sources.filter((s) => retrieved.has(s)).map((s) => retrieved.get(s)));
    }
    if (name === "propose_action") {
      const retrievedIds = new Set(retrieved.keys());
      const before = validateProposals(rawProposals, data.habits, retrievedIds, MAX_HABITS).length;
      const after = validateProposals([...rawProposals, args], data.habits, retrievedIds, MAX_HABITS).length;
      const ok = after > before;
      if (ok) rawProposals.push(args);
      steps.push({ kind: "propose", ok });
      return ok ? "recorded" : "rejected: needs an existing habitId (change) or a free slot and a name (add), weekdays 0-6 and a reason; at most 3 proposals";
    }
    return "error: unknown tool";
  }

  const models = modelEnv.split(",").map((m) => m.trim()).filter(Boolean);
  const messages: unknown[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Today is ${today}. Review my habits and propose next week's plan.` },
  ];
  let summary = "";
  let pool = models;
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await chat(pool, apiKey, messages);
    if (!r.msg) return fail(r.failure!.status, r.failure!.code);
    pool = [r.model!]; // the model that handled tools keeps the thread
    const msg = r.msg;
    // deno-lint-ignore no-explicit-any
    const calls: any[] = msg.tool_calls ?? [];
    if (!calls.length) {
      summary = clip(msg.content, 700);
      break;
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try {
        args = JSON.parse(c.function?.arguments || "{}");
      } catch {
        /* the model sent broken arguments: the tool answers with an error */
      }
      let content: string;
      try {
        content = await runTool(c.function?.name, args);
      } catch (e) {
        console.error("agent tool", c.function?.name, e);
        content = "error: tool failed";
      }
      messages.push({ role: "tool", tool_call_id: c.id, content });
    }
  }

  const proposals = validateProposals(rawProposals, data.habits, new Set(retrieved.keys()), MAX_HABITS).map((p) => ({
    ...p,
    sources: p.sources.map((id: string) => retrieved.get(id)),
  }));
  return reply(200, { summary, proposals, steps });
});
