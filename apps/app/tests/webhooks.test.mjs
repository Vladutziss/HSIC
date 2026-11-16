import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WEBHOOK_EVENTS, checkWebhookUrl, isPrivateIp } from "../src/lib/webhookUrl.js";
import { deliver, envelope, habitCheckedData, planAppliedData, proposedBy, reflectionData, reportData, signedHeaders } from "../../../supabase/functions/_shared/webhooks-core.js";
import { verifySvix } from "../../../supabase/functions/_shared/svix.js";
import { trFor } from "../../../supabase/functions/_shared/app/i18n.js";

const SECRET = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

test("an address must be https, public and without credentials", () => {
  const ok = (u) => checkWebhookUrl(u).ok;
  const why = (u) => checkWebhookUrl(u).reason;
  assert.equal(ok("https://hooks.zapier.com/hooks/catch/1/abc/"), true);
  assert.equal(ok("  https://example.com:8443/molted?x=1  "), true);
  assert.equal(checkWebhookUrl("https://Example.COM/a").host, "example.com");
  assert.equal(ok("https://8.8.8.8/hook"), true);
  assert.equal(why("http://example.com/hook"), "scheme");
  assert.equal(why("ftp://example.com"), "scheme");
  assert.equal(why("javascript:alert(1)"), "scheme");
  assert.equal(why("example.com/hook"), "format");
  assert.equal(why(""), "format");
  assert.equal(why("https://exa mple.com"), "format");
  assert.equal(why("https://" + "a".repeat(500) + ".com"), "format");
  assert.equal(why("https://user:pw@example.com/"), "credentials");
  assert.equal(why("https://[::1]/"), "host");
  assert.equal(why("https://[2001:4860:4860::8888]/"), "host");
  assert.equal(why("https://router/"), "host");
  for (const u of [
    "https://localhost/x",
    "https://LOCALHOST:8443/",
    "https://api.localhost/",
    "https://127.0.0.1/",
    "https://127.1/", // short forms are read the way a browser reads them
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://10.0.0.5/",
    "https://172.16.0.1/",
    "https://172.31.255.255/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/",
    "https://0.0.0.0/",
    "https://224.0.0.1/",
    "https://255.255.255.255/",
    "https://metadata.google.internal/",
    "https://printer.local/",
    "https://nas.lan/",
    "https://db.corp/",
    "https://kubernetes.default.svc.cluster.local/",
    "https://foo.home.arpa/",
    "https://example.test/",
  ]) {
    assert.equal(why(u), "private", u);
  }
  assert.equal(ok("https://172.32.0.1/"), true); // just outside the private range
  assert.equal(ok("https://example.com."), true); // a trailing dot is the same name
  assert.equal(why("https://localhost./"), "private");
  assert.deepEqual(WEBHOOK_EVENTS, ["habit.checked", "plan.applied", "report.created", "reflection.created"]);
});

test("addresses a name resolves to: private ones are recognised, IPv4 and IPv6", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "169.254.169.254", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:c0a8:0101", "64:ff9b::7f00:1", "ff02::1", "2001:db8::1", "fe80::1%eth0", "not an ip", ""]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("a delivery is signed the Standard Webhooks way, and a tampered body or an old timestamp does not verify", async () => {
  const body = JSON.stringify(envelope("evt_1", "habit.checked", "2026-11-16T18:00:00Z", { day: "2026-11-16" }));
  const now = Date.parse("2026-11-16T18:00:05Z");
  const h = await signedHeaders(SECRET, "evt_1", body, now);
  assert.equal(h["webhook-id"], "evt_1");
  assert.equal(h["webhook-timestamp"], "1794852005");
  assert.equal(h["Content-Type"], "application/json");
  // the signature, computed here independently: base64(HMAC-SHA256(secret bytes, "id.timestamp.body"))
  const expected = createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`evt_1.1794852005.${body}`).digest("base64");
  assert.equal(h["webhook-signature"], `v1,${expected}`);
  // a receiver that uses a Svix-style verifier (other header names, same scheme) accepts it
  const asSvix = (headers) => ({ get: (k) => headers[k.replace("svix-", "webhook-")] ?? null });
  assert.equal(await verifySvix(asSvix(h), body, SECRET, { now }), true);
  assert.equal(await verifySvix(asSvix(h), body.replace("16", "17"), SECRET, { now }), false);
  assert.equal(await verifySvix(asSvix(h), body, SECRET, { now: now + 10 * 60_000 }), false);
  assert.equal(await verifySvix(asSvix(h), body, "whsec_" + Buffer.from("another secret, 32 bytes long!!!").toString("base64"), { now }), false);
});

const state = () => ({
  meta: { start: "2026-11-10" },
  habits: [
    { id: "h1", name: "Citit", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10" },
    { id: "h2", name: "Sală", diff: 3, days: [2, 4], createdAt: "2026-11-10" },
    { id: "h3", name: "Meditație", diff: 1, days: [1], createdAt: "2026-11-10" },
  ],
  log: { "2026-11-15": { h1: 1 }, "2026-11-16": { h1: 1, h2: 1 } },
  reviews: { "2026-11-16": { ai: 80, at: "2026-11-16T19:00:00Z" } },
  todos: [],
});

test("habit.checked says which habit, how the day stands and the streak; a tick taken back says nothing", () => {
  assert.deepEqual(habitCheckedData(state(), { habit_id: "h2", day: "2026-11-16" }), {
    day: "2026-11-16",
    habit: { id: "h2", name: "Sală", difficulty: 3, scheduled: false },
    day_progress: { done: 2, scheduled: 2, scheduled_done: 1 },
    streak: 2,
  });
  assert.equal(habitCheckedData(state(), { habit_id: "h3", day: "2026-11-16" }), null); // not ticked (any more)
  assert.equal(habitCheckedData(state(), { habit_id: "gone", day: "2026-11-16" }), null);
  assert.equal(habitCheckedData(null, { habit_id: "h1", day: "2026-11-16" }), null);
});

test("plan.applied describes the action and who proposed it; anything not applied says nothing", () => {
  const row = { id: "a1", run_id: "ui-123", kind: "create_todo", status: "applied", habit_id: null, payload: { title: "Recapitulare mate", date: "2026-11-17", dur: 25 }, reason: "Examen în 3 zile", decided_at: "2026-11-16T18:00:00Z" };
  assert.deepEqual(planAppliedData(row), {
    action: { id: "a1", kind: "create_todo", title: "Recapitulare mate", date: "2026-11-17", minutes: 25, habit_id: null, reason: "Examen în 3 zile" },
    proposed_by: { source: "app", agent: null },
    applied_at: "2026-11-16T18:00:00Z",
  });
  assert.equal(planAppliedData({ ...row, status: "pending" }), null);
  assert.equal(planAppliedData(null), null);
  assert.deepEqual(proposedBy({ run_id: "mcp-ab12cd34-2026-11-16", payload: { source: { kind: "mcp", name: "Claude Desktop" } } }), { source: "external_agent", agent: "Claude Desktop" });
  assert.deepEqual(proposedBy({ run_id: "weekly-2026-11-15" }), { source: "molt_weekly", agent: null });
  assert.deepEqual(proposedBy({ run_id: "0b0e1c0a-3d1e-4a1e-9a55-5a3a51b3c111" }), { source: "molt", agent: null });
  assert.equal(planAppliedData({ ...row, kind: "change_habit", habit_id: "h1", payload: { diff: 1, days: [1] } }).action.habit_id, "h1");
});

test("report.created carries the report, the numbers of the day and the note in the player's language", () => {
  const review = { day: "2026-11-16", ai_score: 80, summary: "O zi bună.", highlight: "Sala", tip: "Continuă.", ai: true };
  const d = reportData(review, state(), { tr: trFor("en"), lang: "en" });
  assert.equal(d.day, "2026-11-16");
  assert.equal(d.ai_score, 80);
  assert.equal(typeof d.score, "number");
  assert.deepEqual(d.habits, { done: 2, scheduled: 2 });
  assert.equal(d.streak, 2);
  assert.ok(d.markdown.startsWith("---\ndate: 2026-11-16\n"));
  assert.ok(d.markdown.includes("## Evening report\n\nO zi bună."));
  assert.ok(reportData(review, state(), { tr: trFor("ro"), lang: "ro" }).markdown.includes("## Raportul de seară"));
  assert.equal(reportData({ day: "2026-11-16", ai_score: 80, summary: null }, state(), {}), null);
  assert.deepEqual(reflectionData({ id: "r1", week: "2026-W47", answer: "a", observation: "b", next_step: "c", created_at: "t" }), { id: "r1", week: "2026-W47", answer: "a", observation: "b", next_step: "c", confidence: "unknown", created_at: "t" });
  assert.equal(reflectionData({}), null);
});

test("sending: a 2xx is a success; errors, redirects and timeouts are failures; private targets are never called", async () => {
  const calls = [];
  const answering = (status) => async (url, init) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : "ignored", { status }); // a 204 cannot carry a body
  };
  const base = { url: "https://hooks.example.com/molted", secret: SECRET, id: "evt_9", body: '{"a":1}', now: Date.parse("2026-11-16T18:00:00Z") };

  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(204) }), { ok: true, status: 204, error: null });
  const sent = calls[0];
  assert.equal(sent.url, "https://hooks.example.com/molted");
  assert.equal(sent.init.method, "POST");
  assert.equal(sent.init.redirect, "manual");
  assert.equal(sent.init.body, '{"a":1}');
  assert.equal(sent.init.headers["webhook-id"], "evt_9");
  assert.match(sent.init.headers["webhook-signature"], /^v1,[A-Za-z0-9+/]{43}=$/);
  assert.match(sent.init.headers["User-Agent"], /^Molted-Webhooks/);

  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(500) }), { ok: false, status: 500, error: "HTTP 500" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(302) }), { ok: false, status: 302, error: "redirects are not followed" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: async () => { throw new TypeError("fetch failed"); } }), { ok: false, status: null, error: "connection failed" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: async () => { throw new DOMException("took too long", "TimeoutError"); } }), { ok: false, status: null, error: "timeout" });

  // never called: an address that is not allowed, a name that leads inside, a name that leads nowhere
  calls.length = 0;
  assert.deepEqual(await deliver({ ...base, url: "https://169.254.169.254/latest", fetchImpl: answering(200) }), { ok: false, status: null, error: "address not allowed (private)" });
  assert.deepEqual(await deliver({ ...base, url: "http://hooks.example.com/", fetchImpl: answering(200) }), { ok: false, status: null, error: "address not allowed (scheme)" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(200), resolve: async () => ["93.184.216.34", "10.0.0.7"] }), { ok: false, status: null, error: "address not allowed (private)" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(200), resolve: async () => ["::ffff:127.0.0.1"] }), { ok: false, status: null, error: "address not allowed (private)" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(200), resolve: async () => [] }), { ok: false, status: null, error: "the name does not resolve" });
  assert.deepEqual(await deliver({ ...base, fetchImpl: answering(200), resolve: async () => { throw new Error("dns"); } }), { ok: false, status: null, error: "the name does not resolve" });
  assert.equal(calls.length, 0);
  assert.equal((await deliver({ ...base, fetchImpl: answering(200), resolve: async (host) => (host === "hooks.example.com" ? ["93.184.216.34", "2606:2800:220:1::1"] : []) })).ok, true);
  assert.equal(calls.length, 1);
});
