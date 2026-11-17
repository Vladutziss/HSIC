// Pure rules of outgoing webhooks (supabase/functions/webhooks), free of Deno APIs so apps/app/tests/webhooks.test.mjs
// can run them: what an event says, how a delivery is signed, and how it is sent without letting an address reach
// anything that is not on the public internet.
//
// A delivery is one HTTPS POST of JSON:
//   { "id": "<delivery id>", "type": "habit.checked", "created_at": "<ISO time of the event>", "data": { ... } }
// signed the Standard Webhooks way (https://www.standardwebhooks.com), which Svix-style libraries verify as is:
//   webhook-id: <delivery id>      webhook-timestamp: <seconds>
//   webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body" with the address's secret>
// The same id is sent again on a retry, so a receiver can ignore what it has already handled.

import { sign } from "./svix.js";
import { habitExists, isScheduled, streakInfo } from "./app/engine.js";
import { dayFacts, dayMarkdown } from "./app/mdExport.js";
import { checkWebhookUrl, isPrivateIp } from "./app/webhookUrl.js";

export const USER_AGENT = "Molted-Webhooks/1.0 (+https://molted.eu)";
export const TIMEOUT_MS = 8000;

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

/** The headers of one delivery. `now` in milliseconds. */
export async function signedHeaders(secret, id, body, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": await sign(secret, id, timestamp, body),
  };
}

export const envelope = (id, type, createdAt, data) => ({ id, type, created_at: createdAt, data });
export const pingData = () => ({ message: "Molted webhook test" });

// ------------------------------------------------------------ what each event says
// Every builder reads the rows as they are when the delivery goes out and returns null when the thing is no longer
// there (a tick taken back, a deleted habit): then nothing is sent.

/** habit.checked. `ref` = { habit_id, day }. */
export function habitCheckedData(state, ref) {
  const day = ref?.day;
  const habit = (state?.habits || []).find((h) => h.id === ref?.habit_id);
  if (!habit || !day || !state.log?.[day]?.[habit.id]) return null;
  const existing = (state.habits || []).filter((h) => habitExists(h, day));
  const scheduled = existing.filter((h) => isScheduled(h, day));
  const ticked = (h) => !!state.log[day][h.id];
  return {
    day,
    habit: { id: habit.id, name: habit.name, difficulty: habit.diff ?? null, scheduled: isScheduled(habit, day) },
    day_progress: { done: existing.filter(ticked).length, scheduled: scheduled.length, scheduled_done: scheduled.filter(ticked).length },
    streak: streakInfo(state, day).current,
  };
}

/** Who proposed an action, from how its run was named (see the functions that write agent_actions). */
export function proposedBy(row) {
  const run = String(row?.run_id || "");
  if (run.startsWith("mcp-")) return { source: "external_agent", agent: clip(row?.payload?.source?.name, 40) || null };
  if (run.startsWith("weekly-")) return { source: "molt_weekly", agent: null };
  if (run.startsWith("ui-")) return { source: "app", agent: null };
  return { source: "molt", agent: null };
}

/** plan.applied. `row` is the agent_actions row. */
export function planAppliedData(row) {
  if (!row || row.status !== "applied") return null;
  const p = row.payload || {};
  return {
    action: {
      id: row.id,
      kind: row.kind,
      title: clip(p.title ?? p.name ?? p.body ?? "", 200) || null,
      date: p.date || null,
      minutes: Number.isFinite(p.dur) ? p.dur : null,
      habit_id: row.habit_id || p.habitId || null,
      reason: clip(row.reason, 400),
    },
    proposed_by: proposedBy(row),
    applied_at: row.decided_at || null,
  };
}

/** report.created. `review` is the day_reviews row; the note is the same Markdown the app exports. */
export function reportData(review, state, { tr, lang } = {}) {
  if (!review?.summary) return null;
  const facts = dayFacts(state, review.day, { review: { summary: review.summary, highlight: review.highlight, tip: review.tip, ai: review.ai } });
  return {
    day: review.day,
    score: facts.score,
    ai_score: review.ai_score ?? null,
    summary: review.summary,
    highlight: review.highlight || null,
    tip: review.tip || null,
    habits: { done: facts.habits.filter((h) => h.done).length, scheduled: facts.habits.filter((h) => h.scheduled).length },
    momentum: facts.momentum,
    streak: facts.streak,
    markdown: dayMarkdown(facts, { tr, lang }),
  };
}

/** reflection.created. `row` is the reflections row. */
export function reflectionData(row) {
  if (!row?.answer) return null;
  return { id: row.id, week: row.week, answer: row.answer, observation: row.observation, next_step: row.next_step, confidence: row.confidence || "unknown", created_at: row.created_at };
}

// ------------------------------------------------------------ sending

/**
 * Sends one delivery. Resolves { ok, status, error }: never throws.
 *   resolve(host) -> Promise<string[]>   the addresses a name leads to (Deno.resolveDns in the function); when given,
 *                                        every one of them must be a public address. An empty answer fails the send.
 * Redirects are not followed (a redirect could point inside), and the answer's body is not read.
 */
export async function deliver({ url, secret, id, body, fetchImpl = fetch, resolve = null, now = Date.now(), timeoutMs = TIMEOUT_MS }) {
  const checked = checkWebhookUrl(url);
  if (!checked.ok) return { ok: false, status: null, error: `address not allowed (${checked.reason})` };
  if (resolve) {
    let addresses;
    try {
      addresses = await resolve(checked.host);
    } catch {
      addresses = [];
    }
    if (!addresses.length) return { ok: false, status: null, error: "the name does not resolve" };
    if (addresses.some(isPrivateIp)) return { ok: false, status: null, error: "address not allowed (private)" };
  }
  let res;
  try {
    res = await fetchImpl(checked.url, { method: "POST", headers: await signedHeaders(secret, id, body, now), body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, status: null, error: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "connection failed" };
  }
  try {
    await res.body?.cancel();
  } catch {
    /* nothing to release */
  }
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, error: null };
  return { ok: false, status: res.status, error: res.status >= 300 && res.status < 400 ? "redirects are not followed" : `HTTP ${res.status}` };
}

// ------------------------------------------------------------ the outbox run

/**
 * Handles one claimed outbox row (claim_integration_events) and says how it went: { ok, status, error, retry }.
 * deps (all for the row's own user):
 *   state(userId) · lang(userId) · review(userId, day) · action(id) · reflection(id)
 *   send({ url, secret, id, body })             -> { ok, status, error }           (deliver() with DNS checks)
 *   notion(userId, event, ref)                  -> { ok, status, error, retry }    (writes the page)
 *   tr(lang)                                    -> tr function
 */
export async function processEvent(ev, deps) {
  if (ev.target === "notion") return deps.notion(ev.user_id, ev.event, ev.ref);
  if (!ev.endpoint_id || !ev.url) return { ok: false, status: null, error: "the address was deleted", retry: false };
  if (!ev.endpoint_active) return { ok: false, status: null, error: "the address is switched off", retry: false };

  let data = null;
  if (ev.event === "habit.checked") data = habitCheckedData(await deps.state(ev.user_id), ev.ref);
  else if (ev.event === "plan.applied") data = planAppliedData(await deps.action(ev.ref?.action_id));
  else if (ev.event === "report.created") {
    const lang = await deps.lang(ev.user_id);
    data = reportData(await deps.review(ev.user_id, ev.ref?.day), await deps.state(ev.user_id), { tr: deps.tr(lang), lang });
  } else if (ev.event === "reflection.created") data = reflectionData(await deps.reflection(ev.ref?.id));
  // the thing is gone (a tick taken back, a row deleted): nothing to say, nothing to retry
  if (!data) return { ok: true, status: null, error: null, retry: false, skipped: true };

  const body = JSON.stringify(envelope(ev.id, ev.event, ev.created_at, data));
  const r = await deps.send({ url: ev.url, secret: ev.secret, id: ev.id, body });
  // an address we refuse to call will not become callable by waiting
  return { ...r, retry: !(r.error || "").startsWith("address not allowed") };
}
