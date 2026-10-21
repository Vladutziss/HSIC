// Pure rules of the coach agent (supabase/functions/agent), kept free of Deno APIs so
// apps/app/tests/agent.test.mjs and scripts/build-knowledge.mjs can import them.
import { nextAssignments, nextExams, schoolPlanner } from "./app/schoolPlanner.js";
import { addDays, diffDays } from "./app/dates.js";

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** Factors the agent may test on a player (the catalog with texts is lib/experiments.js FACTORS). */
export const EXPERIMENT_FACTORS = ["if_then", "easier_version"];

/** Kinds of note the agent may propose (lib/memory.js KINDS minus the free-form "note"). */
export const NOTE_KINDS = ["constraint", "preference", "event"];

/** The most goals (Obiective) a player can have at once: MAX_OBJECTIVES in src/lib/objectives.js. */
export const GOAL_LIMIT = 6;

/**
 * What the agent may know about the player's goals (tool get_goals): the active ones with their progress in steps, how
 * many slots are free, and the goal the player named in their profile. `free` 0 means it proposes no goal.
 */
export function goalsSnapshot(state, today) {
  const active = (state?.objectives || [])
    .filter((o) => !o.archived && !o.doneOn)
    .map((o) => {
      const steps = o.steps || [];
      return { title: clip(o.title, 80), deadline: o.deadline || null, steps: steps.length, stepsDone: steps.filter((x) => x.done).length };
    });
  return { today, active, free: Math.max(0, GOAL_LIMIT - active.length), profileGoal: clip(state?.profile?.goal, 200) || null };
}

const CONFIDENCE = new Set(["low", "medium", "high"]);

/** Normalizes optional recommendation evidence without making old proposals invalid. */
export function recommendationExplanation(raw) {
  const dataUsed = Array.isArray(raw?.dataUsed)
    ? [...new Set(raw.dataUsed.map((x) => clip(x, 100)).filter(Boolean))].slice(0, 6)
    : [];
  const confidence = CONFIDENCE.has(raw?.confidence) ? raw.confidence : "unknown";
  const expectedEffect = clip(raw?.expectedEffect, 240) || null;
  return { dataUsed, confidence, expectedEffect };
}

const explanationOf = (raw) => {
  const explanation = recommendationExplanation(raw);
  return explanation.dataUsed.length || explanation.confidence !== "unknown" || explanation.expectedEffect ? { explanation } : {};
};

/**
 * What the agent may know about school (tool get_school): upcoming exams (daysLeft counts local calendar days),
 * open assignments due within 14 days and study minutes per subject over the last 14 days.
 * `hasData` is false when the player logged nothing school-related, so the agent says nothing about it.
 */
export function schoolSnapshot(state, today) {
  const exams = nextExams(state, today)
    .filter((e) => e.daysLeft <= 30)
    .slice(0, 8)
    .map((e) => ({ subject: e.subject || null, title: e.title, date: e.date, daysLeft: e.daysLeft }));
  const assignments = nextAssignments(state, today)
    .filter((a) => a.due && diffDays(today, a.due) <= 14)
    .slice(0, 10)
    .map((a) => ({ title: a.title, subject: a.subject || null, due: a.due, daysLeft: diffDays(today, a.due), estimatedMinutes: a.estimatedMinutes ?? null }));
  const from = addDays(today, -13);
  const bySubject = new Map();
  for (const s of schoolPlanner(state).sessions) {
    if (!(s.day >= from && s.day <= today)) continue;
    const key = String(s.subject || "").trim().toLowerCase();
    const cur = bySubject.get(key) || { subject: String(s.subject || "").trim() || null, minutes: 0 };
    cur.minutes += Number(s.minutes) || 0;
    bySubject.set(key, cur);
  }
  const studyMinutes14d = [...bySubject.values()].sort((a, b) => b.minutes - a.minutes);
  return { today, exams, assignments, studyMinutes14d, hasData: !!(exams.length || assignments.length || studyMinutes14d.length) };
}

/** One file of knowledge/ -> {meta, chunks}. Frontmatter, then `## shows` and `## limits` sections. */
export function parseKnowledge(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("missing frontmatter");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["id", "cite", "doi", "strength"]) if (!meta[k]) throw new Error(`${meta.id || "?"}: missing ${k}`);
  if (!["strong", "moderate", "theory"].includes(meta.strength)) throw new Error(`${meta.id}: bad strength`);
  const chunks = [];
  for (const part of m[2].split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    const kind = part.slice(0, nl).trim();
    const body = part.slice(nl + 1).trim();
    if (!["shows", "limits"].includes(kind) || !body) throw new Error(`${meta.id}: bad chunk "${kind}"`);
    chunks.push({ id: `${meta.id}#${kind}`, source: meta.id, kind, body });
  }
  if (chunks.length !== 2) throw new Error(`${meta.id}: needs one shows and one limits chunk`);
  return { meta, chunks };
}

/**
 * The agent's proposals, checked against what is real: `habits` are the player's active habits,
 * `retrieved` the Set of source ids the agent actually read, `max` the habit limit.
 * A source the agent did not retrieve is dropped, so it can never be cited; a proposal with no
 * source left is kept but shown as "fără sursă". Returns at most 3, and at most one experiment
 * (which only names a habit and a factor: the days are drawn by the server, never by the model).
 * A "remember" is a note about the player (noteKind, body, optional startsOn/endsOn) for them to confirm.
 * A "todo" is a small study to-do (title, date YYYY-MM-DD, dur 10-60 min).
 * A "goal" is one new goal (title, optional why and deadline, 1-5 first steps) and needs a free goal slot (`goalSlots`);
 * at most one per run, never a title the player already has (`goalTitles`).
 */
export function validateProposals(raw, habits, retrieved, max, goalSlots = 0, goalTitles = []) {
  const ids = new Set(habits.map((h) => h.id));
  let count = habits.length;
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (out.length >= 3) break;
    const reason = clip(p?.reason, 200);
    if (!reason) continue;
    const sources = [...new Set((Array.isArray(p?.sources) ? p.sources : []).map(String).filter((s) => retrieved.has(s)))].slice(0, 3);
    if (p?.action === "experiment") {
      if (ids.has(p.habitId) && EXPERIMENT_FACTORS.includes(p.factor) && !out.some((o) => o.action === "experiment")) {
        out.push({ action: "experiment", habitId: p.habitId, factor: p.factor, reason, sources, ...explanationOf(p) });
      }
      continue;
    }
    if (p?.action === "remember") {
      // something the player said that should outlive this chat: the app inserts a user_context row once they confirm
      const body = clip(p.body, 300);
      const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
      const startsOn = isDay(p.startsOn) ? p.startsOn : null;
      const endsOn = isDay(p.endsOn) ? p.endsOn : null;
      if (body && NOTE_KINDS.includes(p.noteKind) && !(startsOn && endsOn && endsOn < startsOn) && !out.some((o) => o.action === "remember" && o.body === body)) {
        out.push({ action: "remember", noteKind: p.noteKind, body, startsOn, endsOn, reason, sources, ...explanationOf(p) });
      }
      continue;
    }
    if (p?.action === "goal") {
      const title = clip(p.title, 80);
      const why = clip(p.why, 200);
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) ? p.deadline : null;
      const steps = [...new Set((Array.isArray(p.steps) ? p.steps : []).map((x) => clip(x, 80)).filter(Boolean))].slice(0, 5);
      const taken = goalTitles.some((t) => String(t).trim().toLowerCase() === title.toLowerCase());
      if (goalSlots > 0 && title.length > 2 && steps.length && !taken && !out.some((o) => o.action === "goal")) {
        out.push({ action: "goal", title, why, deadline, steps, reason, sources, ...explanationOf(p) });
      }
      continue;
    }
    if (p?.action === "todo") {
      // a small study to-do: the model gives title/date/duration, the app creates it when the player accepts
      const title = clip(p.title, 120);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
      const dur = Math.round(Number(p.dur));
      if (title && date && dur >= 10 && dur <= 60 && !out.some((o) => o.action === "todo" && o.title === title && o.date === date)) {
        out.push({ action: "todo", title, date, dur, reason, sources, ...explanationOf(p) });
      }
      continue;
    }
    const days = [...new Set((Array.isArray(p?.days) ? p.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (!days.length) continue;
    const base = { diff: Math.min(3, Math.max(1, Math.round(Number(p?.diff)) || 2)), days, reason, sources };
    if (p?.action === "change" && ids.has(p.habitId)) out.push({ ...base, action: "change", habitId: p.habitId, ...explanationOf(p) });
    else if (p?.action === "add" && clip(p.name, 40).length > 1 && count < max) {
      count++;
      out.push({ ...base, action: "add", name: clip(p.name, 40), ...explanationOf(p) });
    }
  }
  return out;
}
