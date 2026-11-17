// The calendar feed endpoint (supabase/functions/calendar), free of Deno APIs so apps/app/tests/calendar.test.mjs
// can run it: the function itself only supplies the two database calls.
//
// A calendar app cannot send a header, so the secret token in the address is the credential. It can only ever read,
// the answer says nothing about why a link does not work (unknown and malformed tokens look the same), and the feed
// is marked private so nothing in between keeps a copy.

import { buildCalendar, dayInZone } from "./app/ics.js";
import { trFor } from "./app/i18n.js";

const TOKEN = /^[a-f0-9]{64}$/;
const plain = (status, text) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

async function etagOf(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return `"${[...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

/**
 * deps:
 *   owner(token)  -> Promise<{ userId, tz, habits } | null>     whose link this is
 *   state(userId) -> Promise<state | null>                      the app state (null before onboarding)
 *   now()         -> Date
 */
export async function handleCalendar(request, deps) {
  if (request.method !== "GET" && request.method !== "HEAD") return plain(405, "Method not allowed");
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!TOKEN.test(token)) return plain(404, "Not found");
  let feed;
  let state;
  try {
    feed = await deps.owner(token);
    if (!feed) return plain(404, "Not found");
    state = await deps.state(feed.userId);
  } catch (e) {
    deps.onError?.(e);
    return plain(503, "Try again later");
  }
  const lang = state?.settings?.prefs?.lang === "en" ? "en" : "ro";
  const today = dayInZone(deps.now ? deps.now() : new Date(), feed.tz);
  const text = buildCalendar(state || {}, { today, tz: feed.tz, habits: !!feed.habits, tr: trFor(lang) });
  const etag = await etagOf(text);
  const headers = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="molted.ics"',
    "Cache-Control": "private, max-age=900",
    ETag: etag,
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : text, { status: 200, headers });
}
