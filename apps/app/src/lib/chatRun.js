// A chat reply is written by the server (supabase/functions/ai, background mode), not by the page that asked: the page
// only waits for it by polling the player's row in chat_runs. This is what lets a reply survive a refresh, a closed tab
// or a phone that put the browser to sleep. Errors are thrown as {code}, like the other coach calls.

import { normalizePlan } from "./chat.js";
import { mapRow } from "./chatStore.js";

/** A run that has been "running" this long is dead (the function's own limit is well below it). */
export const RUN_STALE_MS = 4 * 60 * 1000;
const POLL_MS = 2000;

/** The player's latest run: {status, error, startedAt} or null. */
export async function readRun(client) {
  const { data, error } = await client.from("chat_runs").select("status,error,started_at").maybeSingle();
  if (error) throw { code: "db_error" };
  return data ? { status: data.status, error: data.error || null, startedAt: data.started_at } : null;
}

export const isLive = (run, now = Date.now()) => run?.status === "running" && now - new Date(run.startedAt).getTime() < RUN_STALE_MS;

const sleep = (ms) =>
  new Promise((resolve) => {
    // waking up the page (a tab or a phone coming back) checks at once instead of waiting out the timer
    const done = () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      resolve();
    };
    const onVisible = () => !document.hidden && done();
    const t = setTimeout(done, ms);
    document.addEventListener("visibilitychange", onVisible);
  });

/** Waits until the run is no longer running; resolves when it is done, throws {code} when it failed or went stale. */
export async function waitForRun(client) {
  for (;;) {
    const run = await readRun(client).catch(() => null); // a missed poll (offline for a moment) just tries again
    if (run && run.status === "done") return;
    if (run && run.status === "error") throw { code: run.error || "upstream_error" };
    if (run && !isLive(run)) throw { code: "upstream_error" };
    await sleep(POLL_MS);
  }
}

/** The newest assistant message of the conversation, as the chat list shows it (plan normalized). */
export async function latestReply(client) {
  const { data, error } = await client.from("chat_messages").select("*").eq("role", "assistant").order("created_at", { ascending: false }).limit(1);
  if (error || !data?.[0]) throw { code: "db_error" };
  const m = mapRow(data[0]);
  return { ...m, plan: normalizePlan(m.plan) };
}

/** Waits for the run to finish and returns the reply it wrote. */
export async function waitForReply(client) {
  await waitForRun(client);
  return latestReply(client);
}

/**
 * Picks up a reply that is still being written (the page was reloaded or the player came back): registers it as the chat's
 * AI job (`track(kind, ask)` = trackAiJob from components/AiCoach.jsx), so the thinking state, the Molt menu spinner and the
 * "ready" toast work as if the page had never left. Does nothing when no run is live.
 */
export async function resumeChatRun(client, track) {
  if (!client) return false;
  const run = await readRun(client).catch(() => null);
  if (!isLive(run)) return false;
  return track("chat", () => waitForReply(client));
}
