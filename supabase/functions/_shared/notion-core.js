// Pure rules of the Notion integration (supabase/functions/notion and the automatic writes in `webhooks`), free of
// Deno APIs so apps/app/tests/notion.test.mjs can run them.
//
//   * the OAuth `state` is signed with the functions' secret and names the Molted account that started the flow, so
//     the answer from Notion can only ever be attached to that account, and only for 10 minutes;
//   * the access token is encrypted before it is stored (AES-256-GCM); the key never leaves the function's secrets;
//   * a page is the same day note the app exports as Markdown, turned into Notion blocks (one layout to maintain);
//   * the "Molted" database is written to by the TYPE of its columns, not their names, so renaming a column in
//     Notion (or having made it in another language) does not break anything.

import { dayMarkdown, longDate, reflectionMarkdown } from "./app/mdExport.js";

export const NOTION_VERSION = "2022-06-28";
export const STATE_TTL_SEC = 600;
const TEXT_LIMIT = 1900; // Notion allows 2000 characters per text object

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** A key for one purpose, derived from the one secret (so the state key can never decrypt a token). */
async function keyFor(secret, purpose, algorithm, usages) {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(`molted:${purpose}:${secret}`));
  return crypto.subtle.importKey("raw", material, algorithm, false, usages);
}

// ------------------------------------------------------------ OAuth state

/** A signed `state` for the account `userId`. opts: { now (ms), ttlSec, nonce }. */
export async function makeState(secret, userId, { now = Date.now(), ttlSec = STATE_TTL_SEC, nonce = crypto.randomUUID() } = {}) {
  if (!secret || !userId) throw new Error("state needs a secret and a user");
  const payload = toB64u(enc.encode(JSON.stringify({ u: userId, e: Math.floor(now / 1000) + ttlSec, n: nonce })));
  const key = await keyFor(secret, "notion-state", { name: "HMAC", hash: "SHA-256" }, ["sign"]);
  return `${payload}.${toB64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))))}`;
}

/** The user id a `state` was made for, or null (bad signature, expired, malformed). */
export async function readState(secret, state, now = Date.now()) {
  try {
    const [payload, mac, extra] = String(state ?? "").split(".");
    if (!secret || !payload || !mac || extra !== undefined) return null;
    const key = await keyFor(secret, "notion-state", { name: "HMAC", hash: "SHA-256" }, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, fromB64u(mac), enc.encode(payload)))) return null;
    const data = JSON.parse(dec.decode(fromB64u(payload)));
    if (typeof data?.u !== "string" || !data.u || !(Number(data.e) > now / 1000)) return null;
    return data.u;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ the stored token

/** "v1.<iv>.<ciphertext>", with a fresh random iv each time. */
export async function encryptToken(secret, plain) {
  if (!secret) throw new Error("no secret");
  const key = await keyFor(secret, "notion-token", { name: "AES-GCM" }, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(String(plain))));
  return `v1.${toB64u(iv)}.${toB64u(data)}`;
}

/** The token back, or null (another secret, a damaged value). */
export async function decryptToken(secret, stored) {
  try {
    const [v, iv, data, extra] = String(stored ?? "").split(".");
    if (!secret || v !== "v1" || !iv || !data || extra !== undefined) return null;
    const key = await keyFor(secret, "notion-token", { name: "AES-GCM" }, ["decrypt"]);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv) }, key, fromB64u(data)));
  } catch {
    return null;
  }
}

/** Where the player is sent to allow Molted into their workspace. */
export function authorizeUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({ client_id: clientId, response_type: "code", owner: "user", redirect_uri: redirectUri, state });
  return `https://api.notion.com/v1/oauth/authorize?${q}`;
}

// ------------------------------------------------------------ blocks

/** Text as Notion rich text: cut into pieces Notion accepts, `**bold**` runs kept bold. */
export function richText(text) {
  const out = [];
  const push = (content, bold) => {
    for (let i = 0; i < content.length; i += TEXT_LIMIT) {
      out.push({ type: "text", text: { content: content.slice(i, i + TEXT_LIMIT) }, ...(bold ? { annotations: { bold: true } } : {}) });
    }
  };
  for (const [i, part] of String(text ?? "").split(/\*\*(.+?)\*\*/g).entries()) if (part) push(part, i % 2 === 1);
  return out;
}

const block = (type, text, extra = {}) => ({ object: "block", type, [type]: { rich_text: richText(text), ...extra } });

/**
 * Our own Markdown (lib/mdExport.js) as Notion blocks. It only has to know what that file writes: front matter and
 * the title (dropped: they become the page's properties), "## " headings, "> " quotes, "- [ ]" tasks, paragraphs.
 */
export function markdownToBlocks(md) {
  const lines = String(md ?? "").replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push(block("paragraph", para.join("\n")));
    para = [];
  };
  for (const line of lines) {
    const task = /^- \[( |x)\] (.*)$/.exec(line);
    if (task) {
      flush();
      blocks.push(block("to_do", task[2], { checked: task[1] === "x" }));
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push(block("heading_2", line.slice(3)));
    } else if (line.startsWith("# ")) {
      flush(); // the title of the note is the title of the page
    } else if (line.startsWith("> ")) {
      flush();
      blocks.push(block("quote", line.slice(2)));
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks.slice(0, 100); // one request carries at most 100 blocks
}

// ------------------------------------------------------------ the database and its pages

// The few words this file writes itself (the columns of the database, the kind of a page). Like weekly-core.js they
// are Romanian by default and English for lang "en"; everything inside a page comes from lib/mdExport.js through `tr`.
const words = (lang) => (ro, en) => (lang === "en" ? en : ro);
export const kindName = (kind, lang) => (kind === "report" ? words(lang)("Raport", "Report") : words(lang)("Reflecție", "Reflection"));

/** The body that creates the "Molted" database inside a page the player shared. */
export function databaseSpec(parentPageId, { lang = "ro" } = {}) {
  const L = words(lang);
  return {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "Molted" } }],
    properties: {
      [L("Nume", "Name")]: { title: {} },
      [L("Dată", "Date")]: { date: {} },
      [L("Tip", "Type")]: { select: { options: [{ name: kindName("report", lang), color: "yellow" }, { name: kindName("reflection", lang), color: "purple" }] } },
      [L("Scor", "Score")]: { number: { format: "number" } },
      [L("Săptămâna", "Week")]: { rich_text: {} },
    },
  };
}

/** The column to use for each kind of value: the first one of the right type, whatever it is called. */
export function schemaOf(database) {
  const first = (type) => Object.entries(database?.properties || {}).find(([, p]) => p?.type === type)?.[0] ?? null;
  return { title: first("title"), date: first("date"), select: first("select"), number: first("number"), text: first("rich_text") };
}

/** A report page: { key, kind, title, date, type, score, week, children } for pageBody(). `facts` = dayFacts(). */
export function reportPage(facts, { tr, lang }) {
  return {
    kind: "report",
    key: facts.day,
    title: `${kindName("report", lang)} · ${longDate(facts.day, lang)}`,
    date: facts.day,
    type: kindName("report", lang),
    score: facts.score,
    week: null,
    children: markdownToBlocks(dayMarkdown({ ...facts, reflections: [] }, { tr, lang })),
  };
}

/** A reflection page. `row` is a reflections row; `day` the player's local day it was written on. */
export function reflectionPage(row, { tr, lang, day }) {
  return {
    kind: "reflection",
    key: String(row.id),
    title: `${kindName("reflection", lang)} · ${row.week || day}`,
    date: day,
    type: kindName("reflection", lang),
    score: null,
    week: row.week || null,
    children: markdownToBlocks(reflectionMarkdown(row, { tr })),
  };
}

/** The body that creates `page` in the database, filling only the columns the database still has. */
export function pageBody(databaseId, schema, page) {
  const properties = { [schema.title || "Name"]: { title: richText(page.title).slice(0, 1) } };
  if (schema.date && page.date) properties[schema.date] = { date: { start: page.date } };
  if (schema.select && page.type) properties[schema.select] = { select: { name: page.type } };
  if (schema.number && typeof page.score === "number") properties[schema.number] = { number: page.score };
  if (schema.text && page.week) properties[schema.text] = { rich_text: richText(page.week) };
  return { parent: { database_id: databaseId }, properties, children: page.children };
}
