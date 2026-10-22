import assert from "node:assert/strict";
import test from "node:test";
import middleware, { config } from "../middleware.js";
import { ROMANIAN_COUNTRIES, localeForHeaders, normalizeCountry, prefersRomanian } from "../src/i18n/geo.js";

const headers = (h) => new Headers(h);
const visit = (h) => middleware(new Request("https://www.molted.eu/", { headers: h }));

test("Romania and Moldova get Romanian, every other country English", () => {
  assert.deepEqual(ROMANIAN_COUNTRIES, ["RO", "MD"]);
  for (const c of ["RO", "MD", "ro", " md "]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c })), "ro", c);
  for (const c of ["US", "GB", "DE", "FR", "IT", "ES", "UA", "HU", "BG", "RU", "JP"]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c })), "en", c);
});

test("Romania and Moldova stay Romanian whatever the browser language", () => {
  assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": "RO", "accept-language": "en-US" })), "ro");
  assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": "MD", "accept-language": "ru-RU,ru;q=0.9" })), "ro");
});

test("a Romanian browser abroad gets Romanian, any other browser abroad gets English", () => {
  for (const al of ["ro", "ro-RO,ro;q=0.9,en;q=0.8", "ro-MD", "RO-ro", "ro;q=0.9"])
    for (const c of ["DE", "IT", "ES", "GB", "US"]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c, "accept-language": al })), "ro", `${c} ${al}`);
  for (const al of ["en-US,en;q=0.9", "de-DE,de;q=0.9,ro;q=0.3", "ru-RU", "rom", "", "*"])
    for (const c of ["DE", "IT", "US"]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c, "accept-language": al })), "en", `${c} ${al}`);
  assert.equal(prefersRomanian(undefined), false);
});

test("without a usable country the browser language decides, and the default is English", () => {
  for (const c of [undefined, "", "XX", "T1", "ROU", "1"]) {
    const h = c === undefined ? {} : { "x-vercel-ip-country": c };
    assert.equal(localeForHeaders(headers({ ...h, "accept-language": "ro-RO,ro;q=0.9,en;q=0.8" })), "ro", `ro browser, country ${c}`);
    assert.equal(localeForHeaders(headers({ ...h, "accept-language": "en-GB,en;q=0.9,ro;q=0.5" })), "en", `en browser, country ${c}`);
    assert.equal(localeForHeaders(headers(h)), "en", `nothing, country ${c}`);
  }
  assert.equal(normalizeCountry("xx"), null);
});

test("the middleware answers only for / and redirects temporarily, per visitor, never cached", () => {
  assert.equal(config.matcher, "/");
  const ro = visit({ "x-vercel-ip-country": "MD" });
  assert.equal(ro.status, 307);
  assert.equal(ro.headers.get("location"), "https://www.molted.eu/ro/");
  const en = visit({ "x-vercel-ip-country": "US", "accept-language": "en-US" });
  assert.equal(en.status, 307);
  assert.equal(en.headers.get("location"), "https://www.molted.eu/en/");
  const diaspora = visit({ "x-vercel-ip-country": "IT", "accept-language": "ro-RO,ro;q=0.9" });
  assert.equal(diaspora.headers.get("location"), "https://www.molted.eu/ro/");
  for (const r of [ro, en, diaspora]) {
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.match(r.headers.get("vary"), /x-vercel-ip-country/);
  }
});
