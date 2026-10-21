import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ATTRIBUTION_WINDOW_DAYS,
  CHECKLIST,
  MEDIA,
  SOURCES,
  TRANSITIONS,
  buildCampaignUrl,
  campaignPhase,
  canTransition,
  checklistComplete,
  eligibilitySummary,
  errorCopy,
  isValidSlug,
  parseAttribution,
  readAttribution,
  rememberAttribution,
  utcToZoned,
  zonedToUtc,
} from "@molted/ui/giveaway-core.js";
import { renderCard, renderDetail, renderHidden, renderList, renderListError, renderLoadError, renderNotFound } from "../src/giveaway-view.js";
import { paragraphs, safeUrl } from "../src/html.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/0031_giveaways.sql", import.meta.url), "utf8");

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

const campaign = (over = {}) => ({
  found: true,
  slug: "molt-3d",
  title: "Molt 3D",
  description: "Câștigă un Molt imprimat 3D.\n\nSe poate câștiga o singură dată.",
  prize: { name: "Figurină Molt", description: "Imprimată 3D", image_url: "https://example.com/molt.jpg" },
  starts_at: "2026-11-01T08:00:00Z",
  ends_at: "2026-11-30T20:00:00Z",
  timezone: "Europe/Bucharest",
  phase: "active",
  entries_open: true,
  full: false,
  eligibility: { requireOnboarded: true, minCheckins: 2, requireAttestation: true },
  terms: "Regulament oficial.\n\nArt. 1.",
  landing: { how_to: ["Scanează codul", "Creează un cont"] },
  partners: [{ name: "Plato Print", description: "Print 3D", logo_url: "https://example.com/logo.png", website: "https://example.com" }],
  winners: [],
  me: null,
  ...over,
});

// ------------------------------------------------------------ attribution and QR destinations
test("attribution is read only from allowed utm values, ignoring anything else", () => {
  assert.deepEqual(parseAttribution("?utm_source=plao_streetball&utm_medium=qr&utm_campaign=molt-3d"), { source: "plao_streetball", medium: "qr" });
  assert.deepEqual(parseAttribution("utm_source=PLATO_PRINT&utm_medium=Print"), { source: "plato_print", medium: "print" });
  assert.equal(parseAttribution("?utm_source=made_up&utm_medium=qr"), null);
  assert.equal(parseAttribution("?utm_source=poster"), null);
  assert.equal(parseAttribution("?utm_source=poster&utm_medium=<script>"), null);
  assert.equal(parseAttribution(""), null);
  assert.equal(parseAttribution(undefined), null);
  // extra or personal parameters never survive: only {source, medium} comes out
  assert.deepEqual(parseAttribution("?utm_source=social&utm_medium=link&email=a@b.ro&uid=user_1"), { source: "social", medium: "link" });
});

test("a QR destination holds the campaign slug and a known source, nothing personal, and is stable", () => {
  const url = buildCampaignUrl("https://www.molted.eu/", "molt-3d", "plao_streetball", "qr");
  assert.equal(url, "https://www.molted.eu/ro/giveaways/molt-3d/?utm_source=plao_streetball&utm_medium=qr&utm_campaign=molt-3d");
  assert.equal(url, buildCampaignUrl("https://www.molted.eu", "molt-3d", "plao_streetball", "qr"));
  assert.ok(!/@|user_|email|name=/i.test(url));
  assert.deepEqual(parseAttribution(new URL(url).search), { source: "plao_streetball", medium: "qr" });
  for (const s of SOURCES) for (const m of MEDIA) assert.ok(buildCampaignUrl("https://www.molted.eu", "abc", s, m).includes("/ro/giveaways/abc/"));
  assert.throws(() => buildCampaignUrl("https://www.molted.eu", "Bad Slug", "poster", "qr"));
  assert.throws(() => buildCampaignUrl("https://www.molted.eu", "molt-3d", "tiktok", "qr"));
  assert.throws(() => buildCampaignUrl("https://www.molted.eu", "molt-3d", "poster", "email"));
  assert.ok(!buildCampaignUrl("https://www.molted.eu", "molt-3d", "poster", "qr").includes("/en/"));
});

test("attribution is first touch, kept for 7 days, and survives blocked storage", () => {
  const day = 86400000;
  const s = memory();
  const t0 = Date.UTC(2026, 10, 1);
  assert.deepEqual(rememberAttribution(s, "molt-3d", { source: "poster", medium: "qr" }, t0), { source: "poster", medium: "qr", at: t0 });
  // a later visit from another source does not replace the first one
  assert.equal(rememberAttribution(s, "molt-3d", { source: "social", medium: "link" }, t0 + day).source, "poster");
  assert.equal(readAttribution(s, "molt-3d", t0 + 6 * day).source, "poster");
  assert.equal(readAttribution(s, "molt-3d", t0 + ATTRIBUTION_WINDOW_DAYS * day), null, "expired at 7 days");
  assert.equal(readAttribution(s, "other-one", t0), null, "per campaign");
  // after it expires a new visit can start a new first touch
  assert.equal(rememberAttribution(s, "molt-3d", { source: "event", medium: "qr" }, t0 + 8 * day).source, "event");
  // junk in storage is ignored, a storage that throws does not break anything
  const junk = memory();
  junk.setItem("molted:giveaway:attr", "{not json");
  assert.equal(readAttribution(junk, "molt-3d"), null);
  junk.setItem("molted:giveaway:attr", JSON.stringify({ "molt-3d": { source: "evil", medium: "qr", at: Date.now() } }));
  assert.equal(readAttribution(junk, "molt-3d"), null);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.doesNotThrow(() => rememberAttribution(broken, "molt-3d", { source: "poster", medium: "qr" }));
  assert.equal(readAttribution(broken, "molt-3d"), null);
  assert.equal(rememberAttribution(s, "molt-3d", null, t0 + 8 * day).source, "event", "no attribution in the URL keeps what is stored");
});

// ------------------------------------------------------------ lifecycle (mirror of public.giveaway_phase)
test("campaign phase follows status and the clock, with exact boundaries", () => {
  const base = { starts_at: "2026-11-01T08:00:00Z", ends_at: "2026-11-30T20:00:00Z" };
  const at = (iso) => Date.parse(iso);
  assert.equal(campaignPhase({ ...base, status: "active" }, at("2026-11-01T07:59:59Z")), "scheduled");
  assert.equal(campaignPhase({ ...base, status: "active" }, at("2026-11-01T08:00:00Z")), "active", "open at the start instant");
  assert.equal(campaignPhase({ ...base, status: "active" }, at("2026-11-30T19:59:59Z")), "active");
  assert.equal(campaignPhase({ ...base, status: "active" }, at("2026-11-30T20:00:00Z")), "ended", "closed at the end instant");
  assert.equal(campaignPhase({ ...base, status: "scheduled" }, at("2026-11-10T00:00:00Z")), "active", "a scheduled campaign opens by itself");
  for (const st of ["draft", "paused", "completed", "cancelled"]) assert.equal(campaignPhase({ ...base, status: st }, at("2026-11-10T00:00:00Z")), st, st);
});

test("allowed status transitions match the database trigger", () => {
  assert.deepEqual(TRANSITIONS, {
    draft: ["scheduled", "active", "cancelled"],
    scheduled: ["active", "paused", "cancelled"],
    active: ["paused", "completed", "cancelled"],
    paused: ["active", "completed", "cancelled"],
    completed: [],
    cancelled: [],
  });
  assert.ok(canTransition("paused", "active"));
  assert.ok(!canTransition("completed", "active") && !canTransition("cancelled", "active") && !canTransition("active", "draft"));
  // the same table is in the migration
  for (const [from, list] of Object.entries(TRANSITIONS)) {
    if (!list.length) continue;
    const m = migration.match(new RegExp(`when '${from}' then new\\.status in \\(([^)]*)\\)`));
    assert.ok(m, `${from} is in the trigger`);
    assert.deepEqual(m[1].split(",").map((x) => x.trim().replace(/'/g, "")), list, from);
  }
});

test("publish checklist: the five items are required and the database enforces the same keys", () => {
  assert.equal(CHECKLIST.length, 5);
  assert.ok(!checklistComplete({}));
  assert.ok(!checklistComplete(Object.fromEntries(CHECKLIST.slice(1).map((c) => [c.key, true]))));
  assert.ok(checklistComplete(Object.fromEntries(CHECKLIST.map((c) => [c.key, true]))));
  for (const c of CHECKLIST) assert.ok(migration.includes(`'${c.key}'`), `${c.key} is enforced in the trigger`);
});

test("slugs: lowercase words joined by hyphens, 3-60 characters", () => {
  for (const ok of ["molt-3d", "abc", "plao-streetball-2026"]) assert.ok(isValidSlug(ok), ok);
  for (const bad of ["ab", "Molt", "molt_3d", "-molt", "molt-", "molt--3d", "a b c", "", null, "x".repeat(61), "_shell"]) assert.ok(!isValidSlug(bad), String(bad));
});

test("dates are interpreted in the campaign time zone, including the daylight-saving change", () => {
  assert.equal(zonedToUtc("2026-01-15T18:00", "Europe/Bucharest"), "2026-01-15T16:00:00.000Z"); // winter UTC+2
  assert.equal(zonedToUtc("2026-07-15T18:00", "Europe/Bucharest"), "2026-07-15T15:00:00.000Z"); // summer UTC+3
  assert.equal(zonedToUtc("2026-03-29T02:30", "Europe/Bucharest").slice(0, 10), "2026-03-29");
  assert.equal(utcToZoned("2026-07-15T15:00:00.000Z", "Europe/Bucharest"), "2026-07-15T18:00");
  for (const local of ["2026-11-01T08:00", "2026-03-28T23:59", "2026-10-25T04:30", "2026-12-31T23:59"]) {
    assert.equal(utcToZoned(zonedToUtc(local, "Europe/Bucharest"), "Europe/Bucharest"), local, local);
  }
  assert.throws(() => zonedToUtc("not a date", "Europe/Bucharest"));
});

// ------------------------------------------------------------ copy
test("every database error code has Romanian copy and raw database text never reaches the player", () => {
  const codes = [...migration.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]).filter((c) => !["forbidden", "id_locked", "new_campaign_must_be_draft", "slug_locked", "eligibility_locked", "incomplete_campaign", "ends_in_the_past", "cancel_reason_required", "reason_required", "winners_complete", "no_eligible_entries", "entry_not_eligible", "label_required", "invalid_status"].includes(c));
  for (const code of new Set(codes)) assert.notEqual(errorCopy(code), errorCopy("zzz_unknown"), `${code} has its own message`);
  assert.equal(errorCopy('duplicate key value violates unique constraint "giveaway_entries_pkey"'), errorCopy("zzz_unknown"));
  assert.ok(!/constraint|violates|postgres|supabase|jwt/i.test(errorCopy("zzz_unknown")));
  assert.match(errorCopy("not_enough_checkins", "1"), /1 obicei/);
  assert.match(errorCopy("not_enough_checkins", "3"), /3 obiceiuri/);
  assert.match(errorCopy("paused"), /pauză/);
});

test("eligibility summary lists only what the campaign really asks", () => {
  const plain = eligibilitySummary({ requireOnboarded: false, minCheckins: 0, requireAttestation: false });
  assert.deepEqual(plain, ["Cont Molted", "Acceptarea regulamentului oficial"]);
  const full = eligibilitySummary({ requireOnboarded: true, minCheckins: 3, requireAttestation: true });
  assert.equal(full.length, 5);
  assert.ok(full.some((x) => x.includes("3 bife")));
});

// ------------------------------------------------------------ the public pages for each visitor state
const has = (html, text) => html.includes(text);

test("signed out on an active campaign: a sign-in button, no entry form, no success claim", () => {
  const html = renderDetail(campaign(), { signedIn: false });
  assert.ok(has(html, 'data-action="signin"') && has(html, 'id="auth-mount"'));
  assert.ok(!has(html, "data-form=\"enter\"") && !has(html, "Ești înscris"));
});

test("signed in, not entered: the form asks for the rules and the attestation, and says nothing about success", () => {
  const html = renderDetail(campaign({ me: { entered: false } }), { signedIn: true });
  assert.ok(has(html, 'data-form="enter"') && has(html, 'name="rules"') && has(html, 'name="attest"'));
  assert.ok(!has(html, "Ești înscris"));
  const noAttest = renderDetail(campaign({ me: { entered: false }, eligibility: { requireOnboarded: false, minCheckins: 0, requireAttestation: false } }), { signedIn: true });
  assert.ok(!has(noAttest, 'name="attest"'), "no attestation box when the campaign does not ask for it");
  assert.ok(has(renderDetail(campaign({ me: { entered: false } }), { signedIn: true, busy: true }), "disabled"));
  assert.ok(has(renderDetail(campaign({ me: { entered: false } }), { signedIn: true, message: "Termină configurarea" }), "Termină configurarea"));
});

test("already entered: confirmed from the database state only, no form; disqualified is stated honestly", () => {
  const entered = renderDetail(campaign({ me: { entered: true, status: "valid" } }), { signedIn: true });
  assert.ok(has(entered, "Ești înscris") && !has(entered, "data-form"));
  const dq = renderDetail(campaign({ me: { entered: true, status: "disqualified" } }), { signedIn: true });
  assert.ok(has(dq, "nu a fost validată") && !has(dq, "Ești înscris"));
});

test("not started, paused, ended, completed, cancelled and full campaigns close the entry", () => {
  const sc = renderDetail(campaign({ phase: "scheduled", entries_open: false }), { signedIn: true });
  assert.ok(has(sc, "Înscrierile se deschid") && !has(sc, "data-form") && !has(sc, 'data-action="signin"'));
  assert.ok(has(renderDetail(campaign({ phase: "paused", entries_open: false }), {}), "în pauză"));
  for (const ph of ["ended", "completed"]) {
    const html = renderDetail(campaign({ phase: ph, entries_open: false }), { signedIn: true });
    assert.ok(has(html, "s-a încheiat") && !has(html, "data-form") && !has(html, "Înscrie-mă"), ph);
  }
  const cx = renderDetail(campaign({ phase: "cancelled", entries_open: false, cancelled_notice: "Anulată de organizator." }), {});
  assert.ok(has(cx, "Campania a fost anulată") && has(cx, "Anulată de organizator.") && !has(cx, "data-form"));
  const full = renderDetail(campaign({ entries_open: false, full: true }), { signedIn: true });
  assert.ok(has(full, "numărul maxim") && !has(full, "data-form"));
});

test("an API failure shows a retry, never a fake state; preview mode has no entry form", () => {
  const err = renderDetail(campaign(), { signedIn: true, error: "Nu am putut trimite." });
  assert.ok(has(err, 'data-action="retry"') && has(err, "Nu am putut trimite."));
  for (const html of [renderLoadError(), renderListError()]) assert.ok(has(html, 'role="alert"') && has(html, 'data-action="retry"'));
  const prev = renderDetail(campaign(), { preview: true });
  assert.ok(has(prev, "Previzualizare") && !has(prev, "data-form") && !has(prev, 'data-action="signin"'));
});

test("the detail page shows the prize, rules, partners and public winners, and nothing private", () => {
  const html = renderDetail(campaign({ winners: ["Andrei P."], phase: "ended", entries_open: false }), {});
  for (const t of ["Figurină Molt", "Regulament oficial", "Plato Print", "Andrei P.", "Scanează codul", "Cum participi"]) assert.ok(has(html, t), t);
  assert.ok(!/user_|internal|checklist|created_by/.test(html));
  assert.ok(has(html, 'alt="Figurină Molt"'), "the prize image has descriptive alt text");
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(!has(html, "/en/"));
});

test("everything from the database is escaped and only https links and images are used", () => {
  const evil = campaign({
    title: '<img src=x onerror="alert(1)">',
    description: "<script>alert(1)</script>",
    terms: "<b>x</b>",
    prize: { name: '"><svg onload=alert(1)>', description: "", image_url: "javascript:alert(1)" },
    partners: [{ name: "<i>p</i>", description: "", logo_url: "http://insecure.example/logo.png", website: "javascript:alert(2)" }],
    winners: ["<u>w</u>"],
    landing: { how_to: ["<s>step</s>"] },
  });
  const html = renderDetail(evil, {});
  assert.ok(!/<script|<svg|<img src=x|<b>x|<i>p|<u>w|<s>step|javascript:|http:\/\/insecure/i.test(html), html.slice(0, 400));
  assert.equal(safeUrl("https://a.example/x.png"), "https://a.example/x.png");
  assert.equal(safeUrl("http://a.example"), "");
  assert.equal(safeUrl("data:text/html,x"), "");
  assert.ok(!paragraphs("<b>").includes("<b>"));
  const card = renderCard(evil);
  assert.ok(!/<script|<svg|<img src=x/i.test(card));
});

test("the list: empty state, open campaigns first, links only to /ro/giveaways/<slug>/", () => {
  assert.ok(has(renderList([]), "Nu există giveaway-uri acum"));
  const html = renderList([campaign({ slug: "vechi", phase: "completed", entries_open: false }), campaign({ slug: "nou" }), campaign({ slug: "curand", phase: "scheduled", entries_open: false })]);
  assert.ok(html.indexOf("Campanii deschise") < html.indexOf("Campanii încheiate"));
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).sort(), ["/ro/giveaways/curand/", "/ro/giveaways/nou/", "/ro/giveaways/vechi/"]);
  assert.ok(!has(html, "/en/"));
  assert.ok(has(renderNotFound(), "Campania nu a fost găsită") && has(renderHidden({ title: "X" }), "în pauză"));
});

// ------------------------------------------------------------ security guards on the schema and the code
test("migration: every giveaway table has RLS and no table is writable by players or anon", () => {
  const tables = [...migration.matchAll(/create table public\.(giveaway_\w+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 9);
  for (const t of tables) assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security`), t);
  assert.ok(!/grant[^;]*\bto\b[^;]*\banon\b[^;]*;/i.test(migration.replace(/grant execute on function[^;]*;/gi, "")), "anon is granted nothing on tables");
  const tableGrants = [...migration.matchAll(/^grant ([^;]*?) on (public\.[^;]*?) to authenticated;/gim)].filter((m) => !/function/.test(m[0]));
  for (const [, privs, on] of tableGrants) {
    for (const t of ["giveaway_entries", "giveaway_events", "giveaway_attributions", "giveaway_winners", "giveaway_audit"]) {
      if (on.includes(t)) assert.equal(privs.trim().toLowerCase(), "select", `${t} is read-only for clients`);
    }
  }
  assert.ok(!/grant[^;]*giveaway_events[^;]*;/i.test(migration) && !/grant[^;]*giveaway_attributions[^;]*;/i.test(migration), "events and attributions have no client grants at all");
});

test("migration: security-definer functions pin the search path and the admin ones check the admin", () => {
  const fns = migration.split(/\bcreate (?:or replace )?function /).slice(1);
  assert.ok(fns.length >= 15);
  for (const f of fns) {
    const name = f.slice(0, f.indexOf("(")).trim();
    if (/security definer/.test(f.split("$$")[0])) assert.match(f.split("$$")[0], /set search_path = ''/, `${name} pins search_path`);
  }
  for (const name of ["draw_giveaway_winner", "select_giveaway_winner_manual", "void_giveaway_winner", "update_giveaway_winner", "announce_giveaway_winner", "disqualify_giveaway_entry", "giveaway_stats"]) {
    const f = fns.find((x) => x.startsWith(`public.${name}(`));
    assert.ok(f, name);
    assert.ok(f.includes("giveaway_require_admin()"), `${name} requires an admin`);
  }
  assert.ok(/draw_not_allowed/.test(migration) && /order by gen_random_uuid\(\)/.test(migration), "the draw happens on the server");
  assert.ok(!/random\(\)/.test(read("src/admin-giveaways.js")) && !/Math\.random/.test(read("src/admin-giveaways.js")), "no client-side randomness picks winners");
});

test("browser code carries no secrets and never writes entries, winners or status itself", () => {
  const sources = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) sources.push([p, readFileSync(p, "utf8")]);
    }
  };
  walk(fileURLToPath(new URL("../src", import.meta.url)));
  for (const [p, text] of sources) assert.ok(!/service_role|SERVICE_ROLE|sb_secret/i.test(text), `${p} has no secret key`);
  const pub = read("src/giveaway.js") + read("src/giveaways.js") + read("src/api.js");
  assert.ok(!/\.from\(["']giveaway_/.test(pub), "public pages use only the functions");
  assert.ok(pub.includes("enter_giveaway") && pub.includes("get_giveaway"));
  assert.ok(!/status\s*[:=]\s*["']entered/.test(read("src/giveaway.js")), "entry is confirmed by re-reading the database");
});

test("admin page is noindex, private, and listed in neither robots nor the sitemap", () => {
  const html = read("admin/giveaways/index.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(read("public/robots.txt"), /^Disallow: \/admin$/m);
  assert.ok(!read("scripts/generate.mjs").includes("admin"));
});
