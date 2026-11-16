// Talking to Notion: a thin client over fetch and the jobs the functions need (finish OAuth, find or make the "Molted"
// database, write a page once). `fetchImpl` is injectable, so apps/app/tests/notion.test.mjs checks every request
// this file would send without a network. Used by supabase/functions/notion and by `webhooks` (automatic writes).

import { NOTION_VERSION, databaseSpec, pageBody, schemaOf } from "./notion-core.js";

const API = "https://api.notion.com/v1";
const TIMEOUT_MS = 15000;

/** `status` is the HTTP status (null when Notion was not reached), `code` Notion's own error code. */
export class NotionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "NotionError";
    this.status = status;
    this.code = code;
  }
}

/** Should a failed write be tried again later? Not when the token or the request itself is the problem. */
export const isRetryable = (e) => !(e instanceof NotionError) || e.status === null || e.status === 429 || e.status >= 500 || e.status === 409;
/** The player has to connect again (the token was revoked or Molted was removed from the workspace). */
export const needsReconnect = (e) => e instanceof NotionError && e.status === 401;
/** The database is gone or no longer shared with Molted. */
export const databaseGone = (e) => e instanceof NotionError && e.status === 404;

async function request(fetchImpl, url, init) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new NotionError(null, "network", "Notion could not be reached");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* an error page that is not JSON */
  }
  if (!res.ok) throw new NotionError(res.status, data?.code || data?.error || "error", String(data?.message || data?.error_description || `HTTP ${res.status}`).slice(0, 300));
  return data;
}

export function notionClient(token, { fetchImpl = fetch } = {}) {
  const call = (method, path, body) =>
    request(fetchImpl, `${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return {
    search: (body) => call("POST", "/search", body),
    createDatabase: (body) => call("POST", "/databases", body),
    getDatabase: (id) => call("GET", `/databases/${encodeURIComponent(id)}`),
    createPage: (body) => call("POST", "/pages", body),
    archivePage: (id) => call("PATCH", `/pages/${encodeURIComponent(id)}`, { archived: true }),
  };
}

const basic = (clientId, clientSecret) => `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

/** The last step of OAuth: the code Notion sent back, exchanged for a token. */
export async function exchangeCode({ clientId, clientSecret, code, redirectUri, fetchImpl = fetch }) {
  const data = await request(fetchImpl, `${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!data?.access_token) throw new NotionError(200, "oauth", "Notion sent no token");
  return { accessToken: data.access_token, workspaceId: data.workspace_id ?? null, workspaceName: data.workspace_name ?? null, botId: data.bot_id ?? null };
}

/** Tells Notion the token is no longer wanted. Best effort: disconnecting in Molted works even if this fails. */
export async function revokeToken({ clientId, clientSecret, token, fetchImpl = fetch }) {
  try {
    await request(fetchImpl, `${API}/oauth/revoke`, {
      method: "POST",
      headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
      body: JSON.stringify({ token }),
    });
    return true;
  } catch {
    return false;
  }
}

const plainTitle = (obj) => (obj?.title || []).map((t) => t?.plain_text ?? t?.text?.content ?? "").join("").trim();
const alive = (obj) => !obj?.archived && !obj?.in_trash;

/**
 * The "Molted" database: the one already there, else a new one inside a page the player shared with Molted (a
 * top-level one if there is a choice). Returns { id, url, created } or null when no page is shared yet.
 */
export async function findOrCreateDatabase(notion, { lang = "ro" } = {}) {
  const found = await notion.search({ query: "Molted", filter: { property: "object", value: "database" }, page_size: 20 });
  const existing = (found?.results || []).find((d) => alive(d) && plainTitle(d) === "Molted");
  if (existing) return { id: existing.id, url: existing.url ?? null, created: false };
  const pages = ((await notion.search({ filter: { property: "object", value: "page" }, page_size: 50 }))?.results || []).filter(alive);
  // a page of the workspace itself rather than a row of some database or a page nested deep inside another
  const parent = pages.find((p) => p?.parent?.type === "workspace") || pages.find((p) => p?.parent?.type === "page_id") || null;
  if (!parent) return null;
  const made = await notion.createDatabase(databaseSpec(parent.id, { lang }));
  return { id: made.id, url: made.url ?? null, created: true };
}

/**
 * Writes pages into the database, each one once. `store` keeps which thing has which page:
 *   store.pageId(kind, key) -> Promise<string|null>     store.savePage(kind, key, pageId) -> Promise
 * A thing that already has a page is skipped, or with `replace` its old page is put in the trash and written again
 * (a report whose text changed). Stops at the first failure and reports it: { written, skipped, error }.
 */
export async function writePages(notion, databaseId, pages, store, { replace = false } = {}) {
  const out = { written: 0, skipped: 0, error: null };
  let schema = null;
  for (const page of pages) {
    try {
      const old = await store.pageId(page.kind, page.key);
      if (old && !replace) {
        out.skipped++;
        continue;
      }
      schema ??= schemaOf(await notion.getDatabase(databaseId));
      if (old) await notion.archivePage(old).catch(() => {}); // already gone in Notion: nothing to put in the trash
      const made = await notion.createPage(pageBody(databaseId, schema, page));
      await store.savePage(page.kind, page.key, made.id);
      out.written++;
    } catch (e) {
      out.error = e;
      break;
    }
  }
  return out;
}
