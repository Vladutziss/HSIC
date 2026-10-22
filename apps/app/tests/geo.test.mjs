import { test } from "node:test";
import assert from "node:assert/strict";
import middleware, { config } from "../middleware.js";
import { ROMANIAN_COUNTRIES as WEB_COUNTRIES } from "../../web/src/i18n/geo.js";
import { GEO_COOKIE, ROMANIAN_COUNTRIES, hintCookie, hintFromCookie, localeForCountry } from "../src/lib/geo.js";
import { detectLocale } from "../src/lib/i18n.js";

test("Romania and Moldova get Romanian, every other country English, unknown gets no hint", () => {
  for (const c of ["RO", "MD", "ro", " md "]) assert.equal(localeForCountry(c), "ro", c);
  for (const c of ["US", "GB", "DE", "FR", "IT", "ES", "UA", "HU", "BG", "RU"]) assert.equal(localeForCountry(c), "en", c);
  for (const c of [undefined, null, "", "XX", "T1", "ROU", "1"]) assert.equal(localeForCountry(c), null, String(c));
});

test("the app and the site use the same list of Romanian-speaking countries", () => {
  assert.deepEqual(ROMANIAN_COUNTRIES, WEB_COUNTRIES);
});

test("the hint cookie is written and read back, and nothing else is mistaken for it", () => {
  assert.equal(hintFromCookie(hintCookie("ro").split(";")[0]), "ro");
  assert.equal(hintFromCookie(`a=1; ${GEO_COOKIE}=en; b=2`), "en");
  assert.equal(hintFromCookie(`x${GEO_COOKIE}=ro`), null);
  assert.equal(hintFromCookie(`${GEO_COOKIE}=fr`), null);
  assert.equal(hintFromCookie(""), null);
  assert.match(hintCookie("en"), /; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/);
});

test("the middleware only adds the cookie on /, continues to the page and sets nothing for an unknown country", async () => {
  assert.equal(config.matcher, "/");
  const run = (country) => middleware(new Request("https://app.molted.eu/", { headers: country ? { "x-vercel-ip-country": country } : {} }));
  const ro = run("RO");
  assert.equal(ro.headers.get("x-middleware-next"), "1");
  assert.equal(hintFromCookie(ro.headers.get("set-cookie")), "ro");
  assert.equal(hintFromCookie(run("US").headers.get("set-cookie")), "en");
  const unknown = run(undefined);
  assert.equal(unknown.headers.get("x-middleware-next"), "1");
  assert.equal(unknown.headers.get("set-cookie"), null);
});

test("detectLocale: ?lang= beats the saved choice, which beats country and browser", () => {
  const set = (o) => {
    const store = { "molted.prefs": o.saved ? JSON.stringify({ lang: o.saved }) : null };
    globalThis.window = { location: { search: o.query || "" } };
    globalThis.localStorage = { getItem: (k) => store[k] ?? null };
    globalThis.document = { cookie: o.cookie || "" };
    Object.defineProperty(globalThis, "navigator", { value: { languages: o.browser ? [o.browser] : [] }, configurable: true });
    return detectLocale();
  };
  try {
    assert.equal(set({ query: "?lang=en", saved: "ro", cookie: `${GEO_COOKIE}=ro`, browser: "ro-RO" }), "en");
    assert.equal(set({ query: "?lang=ro", saved: "en", cookie: `${GEO_COOKIE}=en`, browser: "en-US" }), "ro");
    assert.equal(set({ saved: "en", cookie: `${GEO_COOKIE}=ro`, browser: "ro-RO" }), "en");
    assert.equal(set({ saved: "ro", cookie: `${GEO_COOKIE}=en`, browser: "en-US" }), "ro");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.navigator;
  }
});

test("detectLocale without a choice: Romania/Moldova or a Romanian browser give Romanian, everything else English", () => {
  const set = (o) => {
    globalThis.window = { location: { search: "" } };
    globalThis.localStorage = { getItem: () => null };
    globalThis.document = { cookie: o.cookie || "" };
    Object.defineProperty(globalThis, "navigator", { value: { languages: o.browser ? [o.browser] : [] }, configurable: true });
    return detectLocale();
  };
  try {
    assert.equal(set({ cookie: `${GEO_COOKIE}=ro`, browser: "en-US" }), "ro", "in Romania with an English browser");
    assert.equal(set({ cookie: `${GEO_COOKIE}=ro` }), "ro", "in Romania, no browser language");
    assert.equal(set({ cookie: `${GEO_COOKIE}=en`, browser: "ro-RO" }), "ro", "Romanian browser abroad");
    assert.equal(set({ cookie: `${GEO_COOKIE}=en`, browser: "ro" }), "ro", "Romanian browser abroad, bare tag");
    assert.equal(set({ cookie: `${GEO_COOKIE}=en`, browser: "en-GB" }), "en", "English browser abroad");
    assert.equal(set({ cookie: `${GEO_COOKIE}=en`, browser: "de-DE" }), "en", "German browser abroad");
    assert.equal(set({ browser: "ro-RO" }), "ro", "no cookie, Romanian browser");
    assert.equal(set({ browser: "en-US" }), "en", "no cookie, English browser");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.navigator;
  }
});
