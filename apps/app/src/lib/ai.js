// AI features. In the claude.ai artifact they run on Claude through the
// `sample` capability, on the viewer's own account. In the Supabase build they
// go through the `ai` Edge Function (supabase/functions/ai), which holds the
// OpenRouter key, the prompts and the daily limit. There are no written fallbacks:
// when the AI is unavailable or fails, the feature says so (see aiErrorCopy) and shows nothing generated.

import { PATHS } from "./catalog.js";
import { fmtLong } from "./dates.js";
import { capability, inViewer } from "./platform.js";
import { getClient } from "./supabase.js";

const HIDE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);
let disabled = false;

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** The Supabase client when the AI should go through the Edge Function (signed in, not in the artifact), else null. */
async function serverClient() {
  if (inViewer()) return null;
  const client = await getClient();
  if (!client) return null;
  return window.Clerk?.session ? client : null;
}

/** Calls an Edge Function; throws {code} (see aiErrorCopy) on any failure. */
async function invoke(client, fn, body, signal) {
  if (signal?.aborted) throw { code: "cancelled" };
  const { data, error } = await client.functions.invoke(fn, { body, signal });
  if (signal?.aborted) throw { code: "cancelled" };
  if (error) {
    let code = "upstream_error";
    try {
      code = (await error.context.json()).code || code;
    } catch {
      /* not an error the function produced */
    }
    throw { code };
  }
  return data;
}

async function askServer(client, kind, params, signal) {
  const data = await invoke(client, "ai", { kind, params }, signal);
  if (!data?.result) throw { code: "invalid_json" };
  return data.result;
}

export async function aiStatus() {
  if (await serverClient()) return { available: true, server: true }; // `server`: the coach features need the Edge Function
  if (disabled) return { available: false };
  return { available: !!(await capability("sample")) };
}

async function askJson(prompt, opts) {
  if (disabled) throw { code: "not_granted" };
  const sample = await capability("sample");
  if (!sample) throw { code: "unavailable" };
  try {
    return await sample.json(prompt, opts);
  } catch (e) {
    if (e && HIDE.has(e.code)) disabled = true;
    throw e;
  }
}

export function aiErrorCopy(code) {
  switch (code) {
    case "not_granted":
    case "sampling_disabled":
      return "AI-ul nu are permisiune în această pagină.";
    case "rate_limited":
      return "Prea multe cereri către AI acum. Încearcă din nou peste puțin timp.";
    case "session_expired":
      return "Sesiunea a expirat. Reîncarcă pagina și autentifică-te din nou.";
    case "unavailable":
      return "AI-ul nu e disponibil aici.";
    case "cancelled":
      return "";
    default:
      return "AI-ul nu a răspuns de data asta.";
  }
}

// ------------------------------------------------------------ daily review

export async function dailyReview(p, signal) {
  const server = await serverClient();
  const lines = p.habits
    .map((h) => `- ${h.name} (${h.diffLabel}${h.scheduled ? "" : ", optional today"}): ${h.done ? "done" : "not done"}`)
    .join("\n");
  const prompt = `You are the evening coach in "Molted", a self-improvement RPG. Review the player's day and score it.

Player: ${p.name || "the player"}. Goal: "${clip(p.goal, 200) || "-"}" (path: ${PATHS[p.pathId]?.label || "-"}).
Day: ${fmtLong(p.day)}.
Habits:
${lines || "- nothing scheduled"}
To-dos done: ${p.todos.done} of ${p.todos.total}${p.todos.titles.length ? ` (${p.todos.titles.slice(0, 5).join("; ")})` : ""}.
Momentum: level ${p.level.lvl} (${p.level.name}), ${p.momentum} points. Streak: ${p.streak} days.

Score the day from 0 to 100 for effort and consistency against the plan: 100 = everything scheduled done; about 60 = most of it done; about 30 = a small start; 0 = nothing. Then write, in Romanian, addressing the player as "tu":
- summary: 2 sentences, specific to what was done today, honest and encouraging, without guilt or pressure.
- highlight: the best thing today, at most 8 words.
- tip: one concrete suggestion for tomorrow, at most 18 words.

Reply with only JSON: {"score": <integer 0-100>, "summary": "...", "highlight": "...", "tip": "..."}`;
  const r = server
    ? await askServer(
        server,
        "review",
        {
          name: p.name,
          goal: p.goal,
          pathLabel: PATHS[p.pathId]?.label,
          dayLabel: fmtLong(p.day),
          habits: p.habits,
          todos: { done: p.todos.done, total: p.todos.total, titles: p.todos.titles },
          level: { lvl: p.level.lvl, name: p.level.name },
          momentum: p.momentum,
          streak: p.streak,
        },
        signal
      )
    : await askJson(prompt, { modelTier: "quick", cache: false, signal });
  const score = Math.round(Number(r?.score));
  if (!Number.isFinite(score)) throw { code: "invalid_json" };
  return {
    score: Math.max(0, Math.min(100, score)),
    summary: clip(r.summary, 420),
    highlight: clip(r.highlight, 90),
    tip: clip(r.tip, 180),
    ai: true,
  };
}

// ------------------------------------------------------------ moments

export async function momentLineAI(situation, quote, signal) {
  const server = await serverClient();
  const prompt = `In one sentence in Romanian (at most 170 characters), connect this quote to the player's situation in a self-improvement game. Address the player as "tu", be warm and concrete, and do not repeat the quote.
Situation: ${situation}.
Quote: "${quote.text}" (${quote.author}).
Reply with only JSON: {"line":"..."}`;
  const r = server ? await askServer(server, "moment", { situation, quote }, signal) : await askJson(prompt, { modelTier: "quick", signal });
  return clip(r?.line, 200);
}

export async function evolutionChapter({ name, pathId, from, to, recent = [] }, signal) {
  const server = await serverClient();
  const prompt = `In "Molted", a self-improvement RPG, the player's companion ${name || "the Molt"} (a ${PATHS[pathId]?.cls || "hero"}) just evolved from "${from}" to "${to}" thanks to the player's daily check-ins.
Recent story (newest last):
${recent.slice(-3).map((s) => `- ${s}`).join("\n") || "- (none yet)"}
Write a short celebratory chapter: 3 sentences, at most 380 characters, in Romanian, third person, present tense, describing the transformation and what the companion can do now. Give it a title of 2-4 words.
Reply with only JSON: {"title":"...","story":"..."}`;
  const r = server
    ? await askServer(server, "chapter", { name, cls: PATHS[pathId]?.cls, from, to, recent: recent.slice(-3) }, signal)
    : await askJson(prompt, { modelTier: "quick", cache: false, signal });
  return { title: clip(r?.title, 40) || to, story: clip(r?.story, 460), ai: true };
}

// ------------------------------------------------------------ coach (server build only, no artifact copy of the prompts)

async function askCoach(kind, params, signal) {
  const server = await serverClient();
  if (!server) throw { code: "unavailable" };
  return askServer(server, kind, params, signal);
}

/** [{title, text}] patterns found in the last 4 weeks (see coach.js for `data`). */
export async function habitInsights(data, signal) {
  const r = await askCoach("insights", data, signal);
  const out = (Array.isArray(r?.insights) ? r.insights : [])
    .slice(0, 3)
    .map((i) => ({ title: clip(i?.title, 60), text: clip(i?.text, 260) }))
    .filter((i) => i.title && i.text);
  if (!out.length) throw { code: "invalid_json" };
  return out;
}

/**
 * The coach agent (supabase/functions/agent). It reads the player's rows itself, so only the day is sent.
 * Returns {summary, proposals, steps}; proposals were validated on the server and each carries the
 * sources the agent really retrieved (cite, doi, strength, limits).
 */
export async function coachAgent(today, signal) {
  const server = await serverClient();
  if (!server) throw { code: "unavailable" };
  const r = await invoke(server, "agent", { today }, signal);
  if (!r || !Array.isArray(r.proposals)) throw { code: "invalid_json" };
  return {
    summary: clip(r.summary, 700),
    steps: Array.isArray(r.steps) ? r.steps : [],
    proposals: r.proposals.map((p) => ({
      action: p.action === "add" ? "add" : "change",
      habitId: p.habitId,
      name: clip(p.name, 40),
      diff: Math.min(3, Math.max(1, Number(p.diff) || 2)),
      days: (Array.isArray(p.days) ? p.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      reason: clip(p.reason, 200),
      sources: (Array.isArray(p.sources) ? p.sources : []).filter(Boolean),
    })),
  };
}
