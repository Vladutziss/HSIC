import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_TYPES, CONFIG, chunk, pickCampaign, selectAudience, variantFor, withBackoff } from "../../../supabase/functions/_shared/campaigns-core.js";
import { escapeHtml, fillTemplate, greeting, headersFor, linksFor, sampleValues, valuesFor } from "../../../supabase/functions/_shared/email-render.js";
import { sign, verifySvix } from "../../../supabase/functions/_shared/svix.js";
import { TEMPLATES } from "../../../supabase/functions/_shared/email-templates.generated.js";
import { COPY, SUBJECT_MAX } from "../../../scripts/emails/copy.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const ago = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
// a candidate row as email_candidates() returns it; every field overridable
const row = (o = {}) => ({
  user_id: "user_a", email: "a@molted.test", token: "t".repeat(64), lang: "ro", name: "Ana", onboarded: true,
  signup_at: ago(3), last_active_at: ago(1), completions_total: 0, habits: 1,
  last_email_at: null, last_email_type: null, emails_30d: 0, sent_types: [], ...o,
});
const type = (r) => pickCampaign(r, NOW).campaign_type;

test("onboarding nudge: after 2 days without a single tick, once", () => {
  assert.equal(type(row({ signup_at: ago(3) })), "onboarding_nudge");
  assert.equal(pickCampaign(row({ signup_at: ago(1) }), NOW).skip, "nothing_due");
  assert.equal(pickCampaign(row({ signup_at: ago(3), sent_types: ["onboarding_nudge"] }), NOW).skip, "nothing_due");
  assert.notEqual(type(row({ signup_at: ago(3), completions_total: 4 })), "onboarding_nudge");
});

test("quick win: day 9, only for players who have started ticking", () => {
  assert.equal(type(row({ signup_at: ago(10), completions_total: 5, sent_types: ["onboarding_nudge"], last_email_at: ago(8) })), "quick_win");
  assert.equal(pickCampaign(row({ signup_at: ago(10), completions_total: 0, sent_types: ["onboarding_nudge"], last_email_at: ago(8) }), NOW).skip, "nothing_due");
});

test("feature tour and feedback follow, for players still around", () => {
  const sent = ["onboarding_nudge", "quick_win"];
  assert.equal(type(row({ signup_at: ago(17), completions_total: 9, sent_types: sent, last_email_at: ago(8), emails_30d: 2 })), "feature_tour");
  const more = [...sent, "feature_tour"];
  assert.equal(type(row({ signup_at: ago(36), completions_total: 30, sent_types: more, last_email_at: ago(19), emails_30d: 2 })), "feedback");
});

test("a step that is long overdue is skipped, not sent out of context", () => {
  // 40 days in, nothing sent yet: the first-week email makes no sense any more
  assert.equal(type(row({ signup_at: ago(40), completions_total: 12, last_active_at: ago(1) })), "feature_tour");
  assert.equal(pickCampaign(row({ signup_at: ago(100), completions_total: 12, last_active_at: ago(1) }), NOW).skip, "nothing_due");
});

test("reactivation: exactly one email after 14 inactive days, never a second", () => {
  assert.equal(type(row({ signup_at: ago(60), last_active_at: ago(15), completions_total: 8 })), "reactivation");
  assert.equal(pickCampaign(row({ signup_at: ago(120), last_active_at: ago(13), completions_total: 8, sent_types: ["quick_win", "feature_tour", "feedback"] }), NOW).skip, "nothing_due"); // 13 days away is not 14
  const done = row({ signup_at: ago(80), last_active_at: ago(40), completions_total: 8, sent_types: ["reactivation"], last_email_at: ago(20), last_email_type: "reactivation" });
  assert.equal(pickCampaign(done, NOW).skip, "sunset"); // no reply, no visit: we stop for good
});

test("a player who came back after the reactivation email is a normal player again, but is never reactivated twice", () => {
  const back = row({ signup_at: ago(120), last_active_at: ago(2), completions_total: 20, sent_types: ["reactivation", "feedback"], last_email_at: ago(20), last_email_type: "reactivation" });
  assert.equal(pickCampaign(back, NOW).skip, "nothing_due");
  const away = row({ signup_at: ago(120), last_active_at: ago(30), completions_total: 20, sent_types: ["reactivation"], last_email_at: ago(50), last_email_type: "reactivation" });
  assert.equal(pickCampaign(away, NOW).skip, "nothing_due"); // away again, but one reactivation is all we ever send
});

test("frequency cap: one campaign email per 7 days, and at most 3 in 30 days", () => {
  assert.equal(pickCampaign(row({ signup_at: ago(3), last_email_at: ago(6) }), NOW).skip, "frequency_cap");
  assert.equal(type(row({ signup_at: ago(3), last_email_at: ago(7.5) })), "onboarding_nudge");
  assert.equal(pickCampaign(row({ signup_at: ago(3), last_email_at: ago(8), emails_30d: 3 }), NOW).skip, "monthly_cap");
});

test("no address, no email", () => {
  assert.equal(pickCampaign(row({ email: null }), NOW).skip, "no_email");
});

test("selectAudience: one item per player, reasons counted, nobody invented", () => {
  const rows = [
    row({ user_id: "u1" }),
    row({ user_id: "u2", signup_at: ago(60), last_active_at: ago(20), completions_total: 3 }),
    row({ user_id: "u3", email: null }),
    row({ user_id: "u4", signup_at: ago(0.5) }),
  ];
  const { items, skipped } = selectAudience(rows, NOW);
  assert.deepEqual(items.map((i) => [i.user_id, i.campaign_type]), [["u1", "onboarding_nudge"], ["u2", "reactivation"]]);
  assert.equal(items.every((i) => i.template_version === CONFIG.templateVersion && ["a", "b"].includes(i.variant) && i.period_key === "once"), true);
  assert.deepEqual(skipped, { no_email: 1, nothing_due: 1 });
  assert.equal(new Set(items.map((i) => i.user_id)).size, items.length);
});

test("backfilled players who never signed in again have no address and are never selected", () => {
  assert.deepEqual(selectAudience([row({ email: null, signup_at: ago(60), last_active_at: ago(40) })], NOW).items, []);
});

test("variant is stable per player and splits the audience", () => {
  assert.equal(variantFor("user_x"), variantFor("user_x"));
  const seen = new Set(Array.from({ length: 40 }, (_, i) => variantFor(`user_${i}`)));
  assert.deepEqual([...seen].sort(), ["a", "b"]);
});

test("chunk and withBackoff", async () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  let calls = 0;
  const waits = [];
  const sleep = async (ms) => waits.push(ms);
  const v = await withBackoff(async () => { if (++calls < 3) throw Object.assign(new Error("slow down"), { statusCode: 429 }); return "ok"; }, { sleep });
  assert.equal(v, "ok");
  assert.deepEqual(waits, [500, 1000]); // exponential
  let bad = 0;
  await assert.rejects(withBackoff(async () => { bad++; throw Object.assign(new Error("invalid"), { statusCode: 422 }); }, { sleep }));
  assert.equal(bad, 1); // a validation error is not retried
  await assert.rejects(withBackoff(async () => { throw Object.assign(new Error("down"), { statusCode: 503 }); }, { tries: 2, sleep }));
});

test("rendering: placeholders are all filled, escaped, and a missing one fails loudly", () => {
  assert.equal(greeting("ro", "Ana"), "Salut, Ana!");
  assert.equal(greeting("en", ""), "Hi,");
  assert.equal(escapeHtml(`<b>"x" & y</b>`), "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
  assert.equal(fillTemplate("a {{x}} b", { x: "<i>" }, { html: true }), "a &lt;i&gt; b");
  assert.throws(() => fillTemplate("{{nope}}", {}), /no value for \{\{nope\}\}/);
  const v = valuesFor({ lang: "ro", name: "<script>", email: "a@b.c", token: "t".repeat(64) });
  assert.match(fillTemplate("{{greeting}}", v, { html: true }), /&lt;script&gt;/);
});

test("every email: both languages, both subject variants under the limit, unsubscribe and preferences links, text version", () => {
  assert.deepEqual(Object.keys(TEMPLATES).sort(), [...CAMPAIGN_TYPES].sort());
  for (const campaign of CAMPAIGN_TYPES) {
    for (const lang of ["ro", "en"]) {
      const t = TEMPLATES[campaign][lang];
      const where = `${campaign}/${lang}`;
      assert.deepEqual(Object.keys(t.subjects).sort(), ["a", "b"], where);
      for (const s of Object.values(t.subjects)) assert.ok(s.length > 0 && s.length <= SUBJECT_MAX, `${where}: subject "${s}" is ${s.length} characters`);
      assert.notEqual(t.subjects.a, t.subjects.b, where);
      // filling every placeholder must not throw (a typo in a template would), and nothing may be left over
      const values = sampleValues(lang);
      const html = fillTemplate(t.html, values, { html: true });
      const text = fillTemplate(t.text, values);
      assert.ok(!/\{\{|\}\}/.test(html + text), `${where}: unfilled placeholder`);
      assert.ok(html.includes("unsubscribe.html?t=SAMPLE-TOKEN") && html.includes('lang="' + lang + '"'), `${where}: unsubscribe link or lang`);
      assert.ok(text.includes("unsubscribe.html?t=SAMPLE-TOKEN"), `${where}: unsubscribe link in text`);
      assert.ok(html.includes(COPY[campaign][lang].preheader), `${where}: preheader`);
      assert.ok(html.includes('alt=""') || html.includes("alt="), `${where}: logo alt text`);
      assert.ok(html.includes("color-scheme"), `${where}: dark-mode meta`);
      assert.ok(text.trim().length > 80, `${where}: plain text`);
      assert.ok(!/gdpr|ofert|limitat|ultima șansă|last chance|hurry|grăbește/i.test(html), `${where}: no fake urgency`);
    }
  }
});

test("headers carry the RFC 8058 one-click unsubscribe, pointing at the same token", () => {
  const token = "ab".repeat(32);
  const h = headersFor(token, "en");
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(h["List-Unsubscribe"], /^<https:\/\/[^>]+\/functions\/v1\/email\?a=unsub&t=abab/);
  assert.equal(linksFor(token, "ro").unsubscribe_url.includes(`t=${token}`), true);
});

test("svix: a payload signed with the secret verifies; tampering, age and a wrong secret do not", async () => {
  const secret = "whsec_" + Buffer.from("molted-test-secret").toString("base64");
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "e1" } });
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const headers = (sig, extra = {}) => new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sig, ...extra });
  const good = await sign(secret, "msg_1", ts, body);
  assert.equal(await verifySvix(headers(good), body, secret, { now }), true);
  assert.equal(await verifySvix(headers(`v1,AAAA ${good}`), body, secret, { now }), true); // several signatures: any one counts
  assert.equal(await verifySvix(headers(good), body + " ", secret, { now }), false);
  assert.equal(await verifySvix(headers(good), body, secret, { now: now + 6 * 60_000 }), false);
  assert.equal(await verifySvix(headers(good), body, "whsec_" + Buffer.from("other").toString("base64"), { now }), false);
  assert.equal(await verifySvix(new Headers(), body, secret, { now }), false);
  assert.equal(await verifySvix(headers(good), body, "", { now }), false);
});
