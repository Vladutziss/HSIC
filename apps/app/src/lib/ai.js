// AI features. In the claude.ai artifact they run on Claude through the
// `sample` capability, on the viewer's own account. In the Supabase build they
// go through the `ai` Edge Function (supabase/functions/ai), which holds the
// OpenRouter key, the prompts and the daily limit. There are no written fallbacks:
// when the AI is unavailable or fails, the feature says so (see aiErrorCopy) and shows nothing generated.

import { MAX_HABITS, PATHS } from "./catalog.js";
import { fmtLong } from "./dates.js";
import { capability, inViewer } from "./platform.js";
import { getClient } from "./supabase.js";
import { getLocale, tr } from "./i18n.js";

// The AI writes in the interface language (the Edge Function gets it as `lang`; the artifact's own prompts use these).
const langName = () => (getLocale() === "en" ? "English" : "Romanian");
const addressTu = () => (getLocale() === "en" ? "" : ' as "tu"');

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
  const { data, error } = await client.functions.invoke(fn, { body: { ...body, lang: getLocale() }, signal });
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
      return tr("AI-ul nu are permisiune în această pagină.");
    case "rate_limited":
      return tr("Prea multe cereri către AI acum. Încearcă din nou peste puțin timp.");
    case "session_expired":
      return tr("Sesiunea a expirat. Reîncarcă pagina și autentifică-te din nou.");
    case "unavailable":
      return tr("AI-ul nu e disponibil aici.");
    case "experiment_running":
      return tr("Ai deja un experiment în desfășurare. Termină-l sau anulează-l înainte să începi altul.");
    case "habit_limit":
      return tr("Ai deja {MAX_HABITS} obiceiuri active. Arhivează sau șterge unul ca să adaugi altul.", { MAX_HABITS });
    case "goal_limit":
      return tr("Ai deja 6 obiective active. Termină sau arhivează unul ca să adaugi altul.");
    case "context_limit":
      return tr("Ai deja 50 de note active. Șterge una ca să adaugi alta.");
    case "invalid_note":
      return tr("Nota nu e validă: scrie între 1 și 300 de caractere.");
    case "db_error":
      return tr("Nu s-a putut salva acum. Încearcă din nou.");
    case "cancelled":
      return "";
    default:
      return tr("AI-ul nu a răspuns de data asta.");
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

Score the day from 0 to 100 for effort and consistency against the plan: 100 = everything scheduled done; about 60 = most of it done; about 30 = a small start; 0 = nothing. Then write, in ${langName()}, addressing the player${addressTu()}:
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
  const prompt = `In one sentence in ${langName()} (at most 170 characters), connect this quote to the player's situation in a self-improvement game. Address the player${addressTu()}, be warm and concrete, and do not repeat the quote.
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
Write a short celebratory chapter: 3 sentences, at most 380 characters, in ${langName()}, third person, present tense, describing the transformation and what the companion can do now. Give it a title of 2-4 words.
Reply with only JSON: {"title":"...","story":"..."}`;
  const r = server
    ? await askServer(server, "chapter", { name, cls: PATHS[pathId]?.cls, from, to, recent: recent.slice(-3) }, signal)
    : await askJson(prompt, { modelTier: "quick", cache: false, signal });
  return { title: clip(r?.title, 40) || to, story: clip(r?.story, 460), ai: true };
}

// ------------------------------------------------------------ coach (server build only, no artifact copy of the prompts)

export async function askCoach(kind, params, signal) {
  const server = await serverClient();
  if (!server) throw { code: "unavailable" };
  return askServer(server, kind, params, signal);
}

/** Starts an answer the server writes by itself (only the chat uses it, see supabase/functions/ai); resolves when it has started. */
export async function askCoachBackground(kind, params, signal) {
  const server = await serverClient();
  if (!server) throw { code: "unavailable" };
  const data = await invoke(server, "ai", { kind, params, background: true }, signal);
  if (!data?.started) throw { code: "invalid_json" };
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

/** A small, explainable plan for today. It proposes steps but does not mutate state. */
export async function dailyPlan({ today, minutes = 60, energy = "medium", habits = [], todos = [], goals = [], assignments = [] }, signal) {
  const r = await askCoach("daily_plan", { today, minutes, energy, habits, todos, goals, assignments }, signal);
  const steps = (Array.isArray(r?.steps) ? r.steps : [])
    .slice(0, 3)
    .map((step) => ({
      title: clip(step?.title, 120),
      minutes: Math.max(5, Math.min(Number(minutes) || 60, Math.round(Number(step?.minutes) || 15))),
      reason: clip(step?.reason, 220),
      focus: step?.focus === true,
      dataUsed: Array.isArray(step?.dataUsed) ? step.dataUsed.map((x) => clip(x, 100)).filter(Boolean).slice(0, 4) : [],
      confidence: ["low", "medium", "high"].includes(step?.confidence) ? step.confidence : "unknown",
    }))
    .filter((step) => step.title && step.reason);
  if (!steps.length) throw { code: "invalid_json" };
  return steps;
}

export async function parseHomework(text, today, signal) {
  const r = await askCoach("homework_parse", { text: clip(text, 1200), today }, signal);
  // `type` is optional in the reply: anything but "exam" stays an assignment
  const assignments = (Array.isArray(r?.assignments) ? r.assignments.slice(0, 8) : []).map((a) => ({ ...a, type: a?.type === "exam" ? "exam" : "assignment" }));
  if (!assignments.length) throw { code: "invalid_json" };
  return assignments;
}

export async function decomposeGoal(goal, signal) {
  const r = await askCoach("goal_decompose", { goal: clip(goal, 300) }, signal);
  const goals = (Array.isArray(r?.goals) ? r.goals : [])
    .slice(0, 3)
    .map((g) => ({
      text: clip(g?.text, 120),
      period: g?.period === "month" ? "month" : "week",
      ...(/^\d{4}-\d{2}-\d{2}$/.test(g?.due || "") ? { due: g.due } : {}),
      ...(g?.criteria ? { criteria: clip(g.criteria, 160) } : {}),
    }))
    .filter((g) => g.text);
  if (!goals.length) throw { code: "invalid_json" };
  return goals;
}

export async function weeklyReflection(data, answer, signal) {
  const r = await askCoach("reflection", { data, answer: clip(answer, 800) }, signal);
  if (!r?.observation || !r?.nextStep) throw { code: "invalid_json" };
  return {
    observation: clip(r.observation, 300),
    nextStep: clip(r.nextStep, 240),
    dataUsed: Array.isArray(r.dataUsed) ? r.dataUsed.map((x) => clip(x, 100)).filter(Boolean).slice(0, 4) : [],
    confidence: ["low", "medium", "high"].includes(r.confidence) ? r.confidence : "unknown",
  };
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
    notEnoughData: r.notEnoughData && Number.isFinite(r.notEnoughData.longest) ? r.notEnoughData : null,
    steps: Array.isArray(r.steps) ? r.steps : [],
    proposals: r.proposals.map((p) => ({
      id: p.id || null, // the row in agent_actions, when the log was written
      action: p.action === "add" ? "add" : p.action === "experiment" ? "experiment" : p.action === "todo" ? "todo" : p.action === "goal" ? "goal" : "change",
      ...(p.action === "goal" ? { title: clip(p.title, 80), why: clip(p.why, 200), deadline: p.deadline || null, steps: (Array.isArray(p.steps) ? p.steps : []).map((x) => clip(x, 80)).filter(Boolean).slice(0, 5) } : {}),
      ...(p.action === "todo" ? { title: clip(p.title, 120), date: p.date, dur: Number(p.dur) || 20 } : {}),
      habitId: p.habitId,
      name: clip(p.name, 40),
      factor: p.factor,
      diff: Math.min(3, Math.max(1, Number(p.diff) || 2)),
      days: (Array.isArray(p.days) ? p.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      reason: clip(p.reason, 200),
      experiment: p.experiment && p.experiment.assignments ? p.experiment : null,
      sources: (Array.isArray(p.sources) ? p.sources : []).filter(Boolean),
      explanation: p.explanation || null,
    })),
  };
}

/** The player's supabase client when signed in on the web build (for the coach log, notes, experiments), else null. */
export const agentClient = serverClient;
