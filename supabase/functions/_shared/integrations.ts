// What the integration functions (calendar, webhooks, notion, mcp) share: the clients, who is calling, the player's
// language and day, and writing report / reflection pages to Notion (used by `notion` on demand and by `webhooks`
// when a new report or reflection arrives). Secrets: docs/INTEGRATIONS.md.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { loadState } from "./app/remote.js";
import { trFor } from "./app/i18n.js";
import { dayFacts } from "./app/mdExport.js";
import { dayInZone } from "./app/ics.js";
import { decryptToken, reflectionPage, reportPage } from "./notion-core.js";
import { databaseGone, isRetryable, needsReconnect, notionClient, writePages } from "./notion-api.js";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
export const fail = (status: number, code: string) => reply(status, { code });

export const adminClient = (): SupabaseClient => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** The signed-in player behind a request (their Clerk token, checked by PostgREST), or null. */
export async function callerOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await asUser.rpc("requesting_user_id");
  return error || !data ? null : String(data);
}

/** "ro" or "en", from the account's saved choice. */
export async function langOf(admin: SupabaseClient, userId: string): Promise<"ro" | "en"> {
  const { data } = await admin.from("profiles").select("settings").eq("id", userId).maybeSingle();
  return data?.settings?.prefs?.lang === "en" ? "en" : "ro";
}

const TZ = "Europe/Bucharest"; // the app's audience, as in `weekly`

export type NotionResult = { ok: boolean; status: number | null; error: string | null; retry: boolean; written?: number };

/**
 * Writes reports (by day) and reflections (by id) of one player into their Molted database. `replace`: a report that
 * already has a page gets a new one (its text changed). A token Notion no longer accepts clears the connection's
 * database so the app asks the player to reconnect.
 */
export async function syncToNotion(admin: SupabaseClient, userId: string, what: { days?: string[]; reflectionIds?: string[]; replace?: boolean }): Promise<NotionResult> {
  const { data: conn } = await admin.from("notion_connections").select("access_token, database_id").eq("user_id", userId).maybeSingle();
  if (!conn?.database_id) return { ok: false, status: null, error: "not connected", retry: false };
  const token = await decryptToken(Deno.env.get("INTEGRATIONS_SECRET") ?? "", conn.access_token);
  if (!token) return { ok: false, status: null, error: "the stored token cannot be read (INTEGRATIONS_SECRET changed?)", retry: false };
  const lang = await langOf(admin, userId);
  const tr = trFor(lang);
  const state = await loadState(admin, userId);
  const pages: unknown[] = [];

  const days = [...new Set(what.days ?? [])].sort();
  if (days.length && state) {
    const { data: reviews } = await admin.from("day_reviews").select("day, summary, highlight, tip, ai, ai_score").eq("user_id", userId).in("day", days).not("summary", "is", null);
    for (const r of reviews ?? []) pages.push(reportPage(dayFacts(state, r.day, { review: r }), { tr, lang }));
  }
  if (what.reflectionIds?.length) {
    const { data: rows } = await admin.from("reflections").select("*").eq("user_id", userId).in("id", what.reflectionIds);
    for (const r of rows ?? []) pages.push(reflectionPage(r, { tr, lang, day: dayInZone(new Date(r.created_at), TZ) }));
  }
  if (!pages.length) return { ok: true, status: null, error: null, retry: false, written: 0 };

  const store = {
    pageId: async (kind: string, key: string) => (await admin.from("notion_pages").select("page_id").eq("user_id", userId).eq("kind", kind).eq("key", key).maybeSingle()).data?.page_id ?? null,
    savePage: async (kind: string, key: string, pageId: string) => {
      const { error } = await admin.from("notion_pages").upsert({ user_id: userId, kind, key, page_id: pageId, synced_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
  const r = await writePages(notionClient(token), conn.database_id, pages, store, { replace: !!what.replace });
  const now = new Date().toISOString();
  if (!r.error) {
    await admin.from("notion_connections").update({ last_sync_at: now, last_error: null }).eq("user_id", userId);
    return { ok: true, status: 200, error: null, retry: false, written: r.written };
  }
  // deno-lint-ignore no-explicit-any
  const e = r.error as any;
  if (needsReconnect(e) || databaseGone(e)) {
    await admin.from("notion_connections").update({ database_id: null, database_url: null, last_error: needsReconnect(e) ? "reconnect" : "database_gone" }).eq("user_id", userId);
  } else {
    await admin.from("notion_connections").update({ last_error: String(e?.message ?? "error").slice(0, 300) }).eq("user_id", userId);
  }
  return { ok: false, status: e?.status ?? null, error: String(e?.message ?? "error").slice(0, 300), retry: isRetryable(e), written: r.written };
}
