import assert from "node:assert/strict";
import test from "node:test";
import middleware, { config } from "../middleware.js";
import { ROMANIAN_COUNTRIES, localeForHeaders, normalizeCountry } from "../src/i18n/geo.js";

const headers = (h) => new Headers(h);
const visit = (h) => middleware(new Request("https://www.molted.eu/", { headers: h }));

test("Romania and Moldova get Romanian, every other country English", () => {
  assert.deepEqual(ROMANIAN_COUNTRIES, ["RO", "MD"]);
  for (const c of ["RO", "MD", "ro", " md "]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c })), "ro", c);
  for (const c of ["US", "GB", "DE", "FR", "IT", "ES", "UA", "HU", "BG", "RU", "JP"]) assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": c })), "en", c);
});

test("the country wins over the browser language", () => {
  assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": "DE", "accept-language": "ro-RO,ro;q=0.9" })), "en");
  assert.equal(localeForHeaders(headers({ "x-vercel-ip-country": "RO", "accept-language": "en-US" })), "ro");
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
  const en = visit({ "x-vercel-ip-country": "US" });
  assert.equal(en.status, 307);
  assert.equal(en.headers.get("location"), "https://www.molted.eu/en/");
  for (const r of [ro, en]) {
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.match(r.headers.get("vary"), /x-vercel-ip-country/);
  }
});
