import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTION_VERSION,
  authorizeUrl,
  databaseSpec,
  decryptToken,
  encryptToken,
  makeState,
  markdownToBlocks,
  pageBody,
  readState,
  reflectionPage,
  reportPage,
  richText,
  schemaOf,
} from "../../../supabase/functions/_shared/notion-core.js";
import { NotionError, databaseGone, exchangeCode, findOrCreateDatabase, isRetryable, needsReconnect, notionClient, revokeToken, writePages } from "../../../supabase/functions/_shared/notion-api.js";
import { dayFacts } from "../src/lib/mdExport.js";
import { trFor } from "../../../supabase/functions/_shared/app/i18n.js";

const SECRET = "a long random secret kept in the function's settings";
const NOW = Date.parse("2026-11-16T18:00:00Z");

test("the OAuth state names the account that started, for 10 minutes, and cannot be forged or altered", async () => {
  const state = await makeState(SECRET, "user_aaa", { now: NOW });
  assert.match(state, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await readState(SECRET, state, NOW + 60_000), "user_aaa");
  assert.equal(await readState(SECRET, state, NOW + 11 * 60_000), null, "expired");
  assert.equal(await readState("another secret", state, NOW), null);
  const [payload, mac] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "user_bbb", e: Math.floor(NOW / 1000) + 600, n: "x" })).toString("base64url");
  assert.equal(await readState(SECRET, `${forged}.${mac}`, NOW), null, "another account under the same signature");
  assert.equal(await readState(SECRET, `${payload}.${mac.slice(0, -2)}AA`, NOW), null);
  for (const bad of ["", "abc", "a.b.c", `${payload}.`, null, undefined, `.${mac}`]) assert.equal(await readState(SECRET, bad, NOW), null);
  assert.notEqual(await makeState(SECRET, "user_aaa", { now: NOW }), state, "a fresh nonce every time");
  await assert.rejects(() => makeState("", "user_aaa"));
  await assert.rejects(() => makeState(SECRET, ""));
});

test("the stored token is encrypted: it reads back only with the same secret and only if untouched", async () => {
  const token = "ntn_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH";
  const stored = await encryptToken(SECRET, token);
  assert.match(stored, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.equal(stored.includes(token), false);
  assert.equal(await decryptToken(SECRET, stored), token);
  assert.notEqual(await encryptToken(SECRET, token), stored, "a fresh iv every time");
  assert.equal(await decryptToken("another secret", stored), null);
  const [v, iv, data] = stored.split(".");
  const flipped = data.slice(0, -1) + (data.endsWith("A") ? "B" : "A");
  assert.equal(await decryptToken(SECRET, `${v}.${iv}.${flipped}`), null, "a changed ciphertext is refused, not misread");
  for (const bad of ["", "plain-token", "v2.a.b", "v1.a", null]) assert.equal(await decryptToken(SECRET, bad), null);
  // the key that signs states is not the key that encrypts tokens
  const state = await makeState(SECRET, "user_aaa", { now: NOW });
  assert.equal(await decryptToken(SECRET, `v1.${state}`), null);
});

test("the address the player is sent to carries the client, the return address and the state", () => {
  const u = new URL(authorizeUrl({ clientId: "abc-123", redirectUri: "https://x.supabase.co/functions/v1/notion", state: "s.t" }));
  assert.equal(u.origin + u.pathname, "https://api.notion.com/v1/oauth/authorize");
  assert.deepEqual(Object.fromEntries(u.searchParams), { client_id: "abc-123", response_type: "code", owner: "user", redirect_uri: "https://x.supabase.co/functions/v1/notion", state: "s.t" });
});

test("rich text keeps bold runs and is cut into pieces Notion accepts", () => {
  assert.deepEqual(richText("**Sfat:** continuă"), [
    { type: "text", text: { content: "Sfat:" }, annotations: { bold: true } },
    { type: "text", text: { content: " continuă" } },
  ]);
  const long = richText("x".repeat(4500));
  assert.deepEqual(long.map((t) => t.text.content.length), [1900, 1900, 700]);
  assert.deepEqual(richText(""), []);
  assert.deepEqual(richText(null), []);
});

const state = () => ({
  meta: { start: "2026-11-10" },
  habits: [
    { id: "h1", name: "Citit", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10" },
    { id: "h3", name: "Meditație", diff: 1, days: [1], createdAt: "2026-11-10" },
  ],
  log: { "2026-11-16": { h1: 1 } },
  reviews: { "2026-11-16": { ai: 80, at: "2026-11-16T19:00:00Z" } },
  todos: [{ id: "t1", title: "Eseu", date: "2026-11-16", done: true, doneOn: "2026-11-16" }],
});
const facts = () => dayFacts(state(), "2026-11-16", { review: { summary: "O zi bună.\nAi citit.", highlight: "Cititul", tip: "Continuă." } });

test("a day note becomes blocks: headings, a quote with the numbers, tasks with their ticks, paragraphs", () => {
  const page = reportPage(facts(), { tr: trFor("ro"), lang: "ro" });
  assert.equal(page.kind, "report");
  assert.equal(page.key, "2026-11-16");
  assert.equal(page.title, "Raport · Luni, 16 noiembrie 2026");
  assert.equal(page.type, "Raport");
  assert.equal(typeof page.score, "number");
  const types = page.children.map((b) => b.type);
  assert.deepEqual(types, ["quote", "heading_2", "paragraph", "paragraph", "paragraph", "heading_2", "to_do", "to_do", "heading_2", "to_do"]);
  const text = (b) => b[b.type].rich_text.map((t) => t.text.content).join("");
  assert.match(text(page.children[0]), /^Scor: \d+\/100 · Momentum: \d+ · Nivel 1 \(Scânteie\) · Serie: o zi$/);
  assert.equal(text(page.children[1]), "Raportul de seară");
  assert.equal(text(page.children[2]), "O zi bună.\nAi citit.");
  assert.deepEqual(page.children[3].paragraph.rich_text, [
    { type: "text", text: { content: "Momentul zilei:" }, annotations: { bold: true } },
    { type: "text", text: { content: " Cititul" } },
  ]);
  assert.deepEqual([page.children[6].to_do.checked, text(page.children[6])], [true, "Citit"]);
  assert.deepEqual([page.children[7].to_do.checked, text(page.children[7])], [false, "Meditație"]);
  assert.equal(page.children.every((b) => b.object === "block"), true);
  assert.equal(JSON.stringify(page.children).includes("date: 2026"), false, "the front matter is not written into the page");
  assert.equal(reportPage(facts(), { tr: trFor("en"), lang: "en" }).title, "Report · Monday, 16 November 2026");
  assert.deepEqual(markdownToBlocks(""), []);
  assert.equal(markdownToBlocks(Array.from({ length: 150 }, (_, i) => `- [ ] pas ${i}`).join("\n")).length, 100);
});

test("a reflection becomes a page of its own, on the day it was written", () => {
  const row = { id: "9f1c", week: "2026-W47", answer: "Am citit dimineața.", observation: "Dimineața bifezi mai des.", next_step: "Pune cititul la 7:30.", created_at: "2026-11-16T20:00:00Z" };
  const page = reflectionPage(row, { tr: trFor("en"), lang: "en", day: "2026-11-16" });
  assert.deepEqual({ kind: page.kind, key: page.key, title: page.title, date: page.date, type: page.type, week: page.week, score: page.score }, { kind: "reflection", key: "9f1c", title: "Reflection · 2026-W47", date: "2026-11-16", type: "Reflection", week: "2026-W47", score: null });
  assert.deepEqual(page.children.map((b) => b.type), ["paragraph", "paragraph", "to_do"]);
  assert.equal(page.children[2].to_do.rich_text[0].text.content, "Next step: Pune cititul la 7:30.");
  assert.equal(page.children[2].to_do.checked, false);
});

test("the database is made in the player's language and written to by column type, so renaming a column breaks nothing", () => {
  const ro = databaseSpec("page-1", { lang: "ro" });
  assert.deepEqual(ro.parent, { type: "page_id", page_id: "page-1" });
  assert.equal(ro.title[0].text.content, "Molted");
  assert.deepEqual(Object.keys(ro.properties), ["Nume", "Dată", "Tip", "Scor", "Săptămâna"]);
  assert.deepEqual(ro.properties.Tip.select.options.map((o) => o.name), ["Raport", "Reflecție"]);
  assert.deepEqual(Object.keys(databaseSpec("p", { lang: "en" }).properties), ["Name", "Date", "Type", "Score", "Week"]);

  // what Notion answers for a database whose columns the player renamed, reordered and partly deleted
  const renamed = { properties: { "Când": { id: "a", type: "date", date: {} }, Titlu: { id: "title", type: "title", title: {} }, Fel: { id: "b", type: "select", select: {} }, Etichete: { id: "c", type: "multi_select" } } };
  const schema = schemaOf(renamed);
  assert.deepEqual(schema, { title: "Titlu", date: "Când", select: "Fel", number: null, text: null });
  const page = reportPage(facts(), { tr: trFor("ro"), lang: "ro" });
  const body = pageBody("db-1", schema, page);
  assert.deepEqual(body.parent, { database_id: "db-1" });
  assert.deepEqual(Object.keys(body.properties).sort(), ["Când", "Fel", "Titlu"]); // no score: that column is gone
  assert.deepEqual(body.properties["Când"], { date: { start: "2026-11-16" } });
  assert.deepEqual(body.properties.Fel, { select: { name: "Raport" } });
  assert.equal(body.properties.Titlu.title[0].text.content, "Raport · Luni, 16 noiembrie 2026");
  assert.equal(body.children, page.children);
  const full = pageBody("db-1", { title: "Nume", date: "Dată", select: "Tip", number: "Scor", text: "Săptămâna" }, { ...page, week: "2026-W47" });
  assert.equal(full.properties.Scor.number, page.score);
  assert.equal(full.properties["Săptămâna"].rich_text[0].text.content, "2026-W47");
});

/** A stand-in for Notion: records every request and answers from `routes` ("METHOD /path" -> body or function). */
function fakeNotion(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.notion.com/v1", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body, headers: init.headers });
    const route = routes[`${init.method} ${path}`] ?? routes[`${init.method} ${path.replace(/\/[^/]+$/, "/*")}`];
    if (route === undefined) return new Response(JSON.stringify({ code: "object_not_found", message: "not found" }), { status: 404 });
    const answer = typeof route === "function" ? route(body, calls) : route;
    return new Response(JSON.stringify(answer.body ?? answer), { status: answer.status ?? 200 });
  };
  return { calls, fetchImpl };
}

test("OAuth: the code is exchanged with the client's own credentials, and a refusal is an error", async () => {
  const ok = fakeNotion({ "POST /oauth/token": { access_token: "ntn_secret", workspace_id: "w1", workspace_name: "Ana's Notion", bot_id: "b1" } });
  const got = await exchangeCode({ clientId: "cid", clientSecret: "csecret", code: "the-code", redirectUri: "https://x/functions/v1/notion", fetchImpl: ok.fetchImpl });
  assert.deepEqual(got, { accessToken: "ntn_secret", workspaceId: "w1", workspaceName: "Ana's Notion", botId: "b1" });
  assert.equal(ok.calls[0].headers.Authorization, `Basic ${Buffer.from("cid:csecret").toString("base64")}`);
  assert.deepEqual(ok.calls[0].body, { grant_type: "authorization_code", code: "the-code", redirect_uri: "https://x/functions/v1/notion" });
  const refused = fakeNotion({ "POST /oauth/token": { status: 400, body: { error: "invalid_grant", error_description: "expired" } } });
  await assert.rejects(() => exchangeCode({ clientId: "c", clientSecret: "s", code: "old", redirectUri: "r", fetchImpl: refused.fetchImpl }), (e) => e instanceof NotionError && e.status === 400 && e.code === "invalid_grant");
  const silent = fakeNotion({ "POST /oauth/token": { workspace_id: "w1" } });
  await assert.rejects(() => exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r", fetchImpl: silent.fetchImpl }), NotionError);
  // disconnecting never fails because Notion did not answer
  assert.equal(await revokeToken({ clientId: "c", clientSecret: "s", token: "t", fetchImpl: fakeNotion({ "POST /oauth/revoke": {} }).fetchImpl }), true);
  assert.equal(await revokeToken({ clientId: "c", clientSecret: "s", token: "t", fetchImpl: async () => { throw new Error("offline"); } }), false);
});

test("the Molted database: an existing one is reused, else it is made in a shared page, else we say there is none", async () => {
  const db = (id, title, extra = {}) => ({ object: "database", id, url: `https://notion.so/${id}`, title: [{ plain_text: title }], ...extra });
  const page = (id, parent, extra = {}) => ({ object: "page", id, parent, ...extra });
  const searchFor = (dbs, pages) => (body) => ({ results: body.filter.value === "database" ? dbs : pages });

  const existing = fakeNotion({ "POST /search": searchFor([db("d0", "Molted", { archived: true }), db("d1", "Molted notes"), db("d2", "Molted")], []) });
  assert.deepEqual(await findOrCreateDatabase(notionClient("tok", existing), { lang: "ro" }), { id: "d2", url: "https://notion.so/d2", created: false });
  assert.equal(existing.calls.length, 1);
  assert.equal(existing.calls[0].headers.Authorization, "Bearer tok");
  assert.equal(existing.calls[0].headers["Notion-Version"], NOTION_VERSION);

  const fresh = fakeNotion({
    "POST /search": searchFor([], [page("p-row", { type: "database_id", database_id: "x" }), page("p-old", { type: "workspace", workspace: true }, { in_trash: true }), page("p-nested", { type: "page_id", page_id: "y" }), page("p-top", { type: "workspace", workspace: true })]),
    "POST /databases": (body) => ({ id: "d-new", url: "https://notion.so/d-new", parent: body.parent }),
  });
  assert.deepEqual(await findOrCreateDatabase(notionClient("tok", fresh), { lang: "en" }), { id: "d-new", url: "https://notion.so/d-new", created: true });
  const made = fresh.calls.find((c) => c.path === "/databases").body;
  assert.deepEqual(made.parent, { type: "page_id", page_id: "p-top" }); // the top-level page, not the row or the nested one
  assert.deepEqual(Object.keys(made.properties), ["Name", "Date", "Type", "Score", "Week"]);

  const nothing = fakeNotion({ "POST /search": searchFor([], []) });
  assert.equal(await findOrCreateDatabase(notionClient("tok", nothing)), null);
  assert.equal(nothing.calls.some((c) => c.path === "/databases"), false);
});

test("pages are written once; a changed report replaces its page; the first failure stops the run and is reported", async () => {
  const pages = [reportPage(facts(), { tr: trFor("ro"), lang: "ro" }), reflectionPage({ id: "r1", week: "2026-W47", answer: "a", observation: "b", next_step: "c" }, { tr: trFor("ro"), lang: "ro", day: "2026-11-16" })];
  const routes = {
    "GET /databases/db-1": { properties: { Nume: { type: "title" }, "Dată": { type: "date" }, Tip: { type: "select" }, Scor: { type: "number" }, "Săptămâna": { type: "rich_text" } } },
    "POST /pages": (body, calls) => ({ id: `page-${calls.filter((c) => c.path === "/pages").length}` }),
    "PATCH /pages/*": { archived: true },
  };
  const memory = new Map();
  const store = { pageId: async (kind, key) => memory.get(`${kind}:${key}`) ?? null, savePage: async (kind, key, id) => void memory.set(`${kind}:${key}`, id) };

  const first = fakeNotion(routes);
  assert.deepEqual(await writePages(notionClient("tok", first), "db-1", pages, store), { written: 2, skipped: 0, error: null });
  assert.deepEqual(first.calls.map((c) => `${c.method} ${c.path}`), ["GET /databases/db-1", "POST /pages", "POST /pages"]); // the columns are read once
  assert.deepEqual(first.calls[1].body.parent, { database_id: "db-1" });
  assert.deepEqual(first.calls[1].body.properties.Tip, { select: { name: "Raport" } });
  assert.deepEqual(first.calls[2].body.properties["Săptămâna"].rich_text[0].text.content, "2026-W47");
  assert.deepEqual([...memory], [["report:2026-11-16", "page-1"], ["reflection:r1", "page-2"]]);

  const again = fakeNotion(routes);
  assert.deepEqual(await writePages(notionClient("tok", again), "db-1", pages, store), { written: 0, skipped: 2, error: null });
  assert.equal(again.calls.length, 0, "nothing is asked of Notion when everything already has a page");

  const changed = fakeNotion(routes);
  assert.deepEqual(await writePages(notionClient("tok", changed), "db-1", [pages[0]], store, { replace: true }), { written: 1, skipped: 0, error: null });
  assert.deepEqual(changed.calls.map((c) => `${c.method} ${c.path}`), ["GET /databases/db-1", "PATCH /pages/page-1", "POST /pages"]);
  assert.deepEqual(changed.calls[1].body, { archived: true });
  assert.equal(memory.get("report:2026-11-16"), "page-1"); // the new page's id (this stand-in numbers per run)

  memory.clear();
  const broken = fakeNotion({ ...routes, "POST /pages": { status: 401, body: { code: "unauthorized", message: "API token is invalid." } } });
  const r = await writePages(notionClient("tok", broken), "db-1", pages, store);
  assert.equal(r.written, 0);
  assert.ok(r.error instanceof NotionError);
  assert.equal(broken.calls.filter((c) => c.path === "/pages").length, 1, "it stops at the first failure");
  assert.equal(memory.size, 0);
});

test("which failures are worth another try, which mean reconnect, which mean the database is gone", async () => {
  const e = (status) => new NotionError(status, "x", "y");
  assert.deepEqual([e(429), e(500), e(503), e(409), e(null), new Error("other")].map(isRetryable), [true, true, true, true, true, true]);
  assert.deepEqual([e(400), e(401), e(403), e(404)].map(isRetryable), [false, false, false, false]);
  assert.equal(needsReconnect(e(401)), true);
  assert.equal(needsReconnect(e(404)), false);
  assert.equal(databaseGone(e(404)), true);
  const offline = notionClient("tok", { fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(() => offline.search({}), (err) => err instanceof NotionError && err.status === null && isRetryable(err));
});
