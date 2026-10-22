import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import middleware, { config } from "../middleware.js";
import { ROMANIAN_COUNTRIES as WEB_COUNTRIES } from "../../web/src/i18n/geo.js";
import { HINT_PARAM, ROMANIAN_COUNTRIES, hintFromSearch, isRomanianCountry } from "../src/lib/geo.js";
import { detectLocale } from "../src/lib/i18n.js";

const visit = (country, path = "/") => middleware(new Request(`https://app.molted.eu${path}`, { headers: country ? { "x-vercel-ip-country": country } : {} }));

test("only Romania and Moldova count as Romanian-speaking, and the site uses the same list", () => {
  assert.deepEqual(ROMANIAN_COUNTRIES, WEB_COUNTRIES);
  for (const c of ["RO", "MD", "ro", " md "]) assert.equal(isRomanianCountry(c), true, c);
  for (const c of ["US", "GB", "DE", "IT", "ES", "UA", "HU", "BG", "RU", "", "XX", "T1", undefined, null]) assert.equal(isRomanianCountry(c), false, String(c));
});

test("the hint is read from the address, and only the value ro is accepted", () => {
  assert.equal(hintFromSearch(`?${HINT_PARAM}=ro`), "ro");
  assert.equal(hintFromSearch(`?a=1&${HINT_PARAM}=ro`), "ro");
  for (const s of [`?${HINT_PARAM}=en`, `?${HINT_PARAM}=`, `?x${HINT_PARAM}=ro`, "", "?", undefined, null]) assert.equal(hintFromSearch(s), null, String(s));
});

test("a visitor from Romania or Moldova is redirected once to /?hl=ro, privately and temporarily", () => {
  assert.equal(config.matcher, "/");
  for (const c of ["RO", "MD"]) {
    const r = visit(c);
    assert.equal(r.status, 307, c);
    assert.equal(r.headers.get("location"), "https://app.molted.eu/?hl=ro", c);
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.match(r.headers.get("vary"), /x-vercel-ip-country/);
  }
});

test("other query parameters survive the redirect and nothing is ever stored", () => {
  const r = visit("RO", "/?ref=poster&x=1");
  assert.equal(r.headers.get("location"), "https://app.molted.eu/?ref=poster&x=1&hl=ro");
  for (const response of [r, visit("US"), visit(undefined), visit("RO", "/?hl=ro")]) assert.equal(response.headers.get("set-cookie"), null);
});

test("no redirect for other countries, an unknown country, or when hl or lang is already there (no loops)", () => {
  for (const response of [visit("US"), visit("DE"), visit(undefined), visit("XX"), visit("RO", "/?hl=ro"), visit("RO", "/?lang=en"), visit("RO", "/?lang=ro")]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  }
});

test("the app no longer asks Google for fonts and sets no cookie of its own", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(index, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(index, /\/fonts\/nunito\.css/);
  assert.doesNotMatch(readFileSync(new URL("../middleware.js", import.meta.url), "utf8"), /set-cookie/i);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/geo.js", import.meta.url), "utf8"), /document\.cookie/);
});

function setup({ query = "", saved, browser }) {
  const store = { "molted.prefs": saved ? JSON.stringify({ lang: saved }) : null };
  globalThis.window = { location: { search: query } };
  globalThis.localStorage = { getItem: (k) => store[k] ?? null };
  Object.defineProperty(globalThis, "navigator", { value: { languages: browser ? [browser] : [] }, configurable: true });
}
const teardown = () => {
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.navigator;
};
const locale = (o) => {
  setup(o);
  try {
    return detectLocale();
  } finally {
    teardown();
  }
};

test("detectLocale: ?lang= beats the saved choice, which beats the country hint and the browser", () => {
  assert.equal(locale({ query: "?lang=en&hl=ro", saved: "ro", browser: "ro-RO" }), "en");
  assert.equal(locale({ query: "?lang=ro", saved: "en", browser: "en-US" }), "ro");
  assert.equal(locale({ query: "?hl=ro", saved: "en", browser: "ro-RO" }), "en");
  assert.equal(locale({ query: "?hl=ro", saved: "ro", browser: "en-US" }), "ro");
});

test("detectLocale without a choice: Romania/Moldova (hint) or a Romanian browser give Romanian, everything else English", () => {
  assert.equal(locale({ query: "?hl=ro", browser: "en-US" }), "ro", "in Romania with an English browser");
  assert.equal(locale({ query: "?hl=ro" }), "ro", "in Romania, no browser language");
  assert.equal(locale({ browser: "ro-RO" }), "ro", "Romanian browser abroad");
  assert.equal(locale({ browser: "ro" }), "ro", "Romanian browser abroad, bare tag");
  assert.equal(locale({ browser: "en-GB" }), "en", "English browser abroad");
  assert.equal(locale({ browser: "de-DE" }), "en", "German browser abroad");
  assert.equal(locale({ query: "?hl=en", browser: "en-US" }), "en", "only hl=ro is a hint");
});
