// Integrations, client side (Settings → Integrări). The rules and tables are in supabase/migrations/0042_integrations.sql,
// the server side in supabase/functions/{calendar,webhooks,notion,mcp}; docs/INTEGRATIONS.md has the whole picture.
// Everything that needs the account runs only in the web build (getClient() is null in the artifact); the Markdown
// and .ics files are made in the browser from the app state, so they work everywhere.

import { getClient } from "./supabase.js";
import { buildCalendar } from "./ics.js";
import { exportNotes } from "./mdExport.js";
import { zipFiles } from "./zip.js";
import { addDays, dayRange } from "./dates.js";
import { tr } from "./i18n.js";

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bucharest";
  } catch {
    return "Europe/Bucharest";
  }
};

async function need() {
  const c = await getClient();
  if (!c || !window.Clerk?.session) throw { code: "unavailable" };
  return c;
}
const must = ({ data, error }) => {
  if (error) throw { code: error.message?.includes("limit") ? "limit" : "db_error", message: error.message };
  return data;
};
const one = (data) => (Array.isArray(data) ? data[0] : data);

async function invoke(fn, body) {
  const c = await need();
  const { data, error } = await c.functions.invoke(fn, { body });
  if (error) {
    let code = "upstream_error";
    try {
      code = (await error.context.json()).code || code;
    } catch {
      /* not one of ours */
    }
    throw { code };
  }
  return data;
}

/** Is the account side available here (web build, signed in)? */
export async function integrationsAvailable() {
  const c = await getClient();
  return !!(c && window.Clerk?.session);
}

/** The functions' base address: https://<project>.supabase.co/functions/v1 */
export const functionsUrl = () => `${String(import.meta.env?.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "")}/functions/v1`;

// ------------------------------------------------------------ calendar

export async function loadCalendarFeed() {
  const c = await need();
  return one(must(await c.from("calendar_feeds").select("token, tz, habits, created_at, last_fetched_at").maybeSingle())) || null;
}
export async function saveCalendarFeed({ habits = false, rotate = false } = {}) {
  const c = await need();
  return one(must(await c.rpc("save_calendar_feed", { p_tz: zone(), p_habits: habits, p_rotate: rotate })));
}
export async function removeCalendarFeed() {
  must(await (await need()).rpc("remove_calendar_feed"));
}
export const calendarUrl = (token) => `${functionsUrl()}/calendar/molted.ics?t=${token}`;
/** webcal:// makes Apple Calendar and Outlook offer to subscribe; Google Calendar takes the https address. */
export const webcalUrl = (token) => calendarUrl(token).replace(/^https:/, "webcal:");
export const googleCalendarUrl = (token) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(token))}`;

// ------------------------------------------------------------ webhooks

export async function loadWebhooks() {
  const c = await need();
  return must(await c.from("webhook_endpoints").select("*").order("created_at"));
}
export async function createWebhook(url, events) {
  return one(must(await (await need()).rpc("create_webhook_endpoint", { p_url: url, p_events: events })));
}
export async function updateWebhook(id, { events = null, active = null } = {}) {
  return one(must(await (await need()).rpc("update_webhook_endpoint", { p_id: id, p_events: events, p_active: active })));
}
export async function deleteWebhook(id) {
  must(await (await need()).rpc("delete_webhook_endpoint", { p_id: id }));
}
export const testWebhook = (id) => invoke("webhooks", { action: "test", id });
/** The latest deliveries of one address (or all), newest first. */
export async function loadDeliveries(limit = 10) {
  const c = await need();
  return must(await c.from("integration_events").select("id, endpoint_id, target, event, status, attempts, response_status, error, created_at, delivered_at").order("created_at", { ascending: false }).limit(limit));
}

// ------------------------------------------------------------ Notion

export async function loadNotion() {
  return one(must(await (await need()).rpc("my_notion_connection"))) || null;
}
export const startNotion = async () => (await invoke("notion", { action: "start" })).url;
export const setupNotion = async () => (await invoke("notion", { action: "setup" })).status;
export const syncNotion = async (days = 30) => (await invoke("notion", { action: "sync", days })).written;
export const disconnectNotion = () => invoke("notion", { action: "disconnect" });
export async function setNotionAutoSync(on) {
  must(await (await need()).rpc("set_notion_auto_sync", { p_on: !!on }));
}

// ------------------------------------------------------------ MCP tokens

export async function loadMcpTokens() {
  const c = await need();
  return must(await c.from("mcp_tokens").select("id, name, hint, can_propose, created_at, last_used_at").order("created_at"));
}
/** Returns { id, token }: the token is shown once and never again. */
export async function createMcpToken(name, canPropose) {
  return one(must(await (await need()).rpc("create_mcp_token", { p_name: name, p_can_propose: canPropose, p_tz: zone() })));
}
export async function revokeMcpToken(id) {
  must(await (await need()).rpc("revoke_mcp_token", { p_id: id }));
}
export const mcpUrl = () => `${functionsUrl()}/mcp`;
/** A ready-to-paste config for clients that read an mcpServers block (Claude Desktop through mcp-remote, Cursor, ...). */
export const mcpConfig = (token) =>
  JSON.stringify({ mcpServers: { molted: { command: "npx", args: ["-y", "mcp-remote", mcpUrl(), "--header", `Authorization:Bearer ${token}`] } } }, null, 2);

// ------------------------------------------------------------ files made here

/** Offers bytes or text as a file to save. */
export function saveFile(name, data, type) {
  const blob = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The calendar as a one-off .ics file (no subscription: it does not update by itself). */
export function calendarFile(state, today, { habits = false } = {}) {
  return buildCalendar(state, { today, tz: zone(), habits, tr });
}

/**
 * The last `days` days as Markdown notes, in one zip ("Molted/2026-11-16.md", ...). `reviews` are the report texts
 * the app has loaded (month documents), `reflections` the history the server keeps (empty in the artifact).
 */
export function notesZip(state, today, { days = 30, reviews = {}, reflections = [] } = {}) {
  const notes = exportNotes(state, dayRange(addDays(today, -(days - 1)), today), { today, reviews, reflections });
  return { count: notes.length, bytes: zipFiles(notes.map((n) => ({ name: `Molted/${n.name}`, text: n.text }))) };
}
