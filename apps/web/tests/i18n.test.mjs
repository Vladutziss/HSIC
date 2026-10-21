import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DICTIONARIES, buildSite, buildSitemap } from "../scripts/generate.mjs";
import RO_ONLY from "../src/i18n/ro-only.js";
import {
  APP_URL,
  LEGACY_REDIRECTS,
  LOCALES,
  ROUTES,
  SITE_URL,
  absoluteUrl,
  alternates,
  availableLocales,
  isAvailable,
  liveRoutes,
  resolve,
  routeByKey,
  switchHref,
  urlPath,
} from "../src/i18n/routes.js";

const files = buildSite();
const pages = files.filter((f) => f.route); // { file, html, route, locale }
// the shared giveaway-detail shell has no URL of its own (one file serves every /ro/giveaways/<slug>/)
const indexable = pages.filter((p) => !p.route.dynamic);
const metaOf = (p) => DICTIONARIES[p.locale].meta[p.route.key] || RO_ONLY.meta[p.route.key];
const attr = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const canonical = (html) => attr(html, /<link rel="canonical" href="([^"]+)"/g);
const hreflangs = (html) => Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
const meta = (html, key) => attr(html, new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, "g"));
const pageAt = (url) => indexable.find((p) => absoluteUrl(p.route, p.locale) === url);
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");

// ------------------------------------------------------------ routing
test("route resolution: every live page exists in ro and en under its own slug", () => {
  for (const route of liveRoutes().filter((r) => !r.dynamic)) {
    for (const locale of LOCALES.filter((l) => isAvailable(route, l))) {
      const r = resolve(urlPath(route, locale));
      assert.equal(r.route?.key, route.key, `${locale}/${route.key}`);
      assert.equal(r.locale, locale);
    }
  }
  assert.equal(resolve("/ro/echipa/").route.key, "team");
  assert.equal(resolve("/en/team/").route.key, "team");
  assert.equal(resolve("/ro/confidentialitate/").route.key, "privacy");
  assert.equal(resolve("/en/terms/").route.key, "terms");
});

test("root redirects to /ro/ (temporary), a missing trailing slash redirects to the canonical form", () => {
  assert.deepEqual(resolve("/"), { redirect: "/ro/", status: 307 });
  assert.deepEqual(resolve("/en"), { redirect: "/en/", status: 308 });
  assert.deepEqual(resolve("/ro/echipa"), { redirect: "/ro/echipa/", status: 308 });
});

test("legacy URLs redirect permanently to the Romanian equivalents", () => {
  assert.deepEqual(resolve("/team.html"), { redirect: "/ro/echipa/", status: 301 });
  assert.deepEqual(resolve("/privacy.html"), { redirect: "/ro/confidentialitate/", status: 301 });
  assert.deepEqual(resolve("/terms.html"), { redirect: "/ro/termeni/", status: 301 });
  for (const l of LEGACY_REDIRECTS) assert.equal(resolve(l.to).route !== undefined || l.to === "/ro/", true, l.to);
});

test("unknown routes are 404, never the home page", () => {
  for (const p of ["/nope", "/ro/nope/", "/en/echipa/", "/ro/team/", "/fr/", "/ro/echipa/extra/", "/en/privacy/x/", "/admin-panel"]) {
    assert.equal(resolve(p).status, 404, p);
    assert.equal(resolve(p).route, undefined, p);
  }
});

test("vercel.json mirrors the routing rules: trailing slash, root + legacy redirects, admin noindex", () => {
  const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(v.trailingSlash, true);
  const redirect = (src) => v.redirects.find((r) => r.source === src);
  assert.deepEqual([redirect("/").destination, redirect("/").permanent], ["/ro/", false]);
  // cleanUrls would turn /team.html into /team (and trailingSlash into /team/), so every spelling must be covered
  for (const l of LEGACY_REDIRECTS) {
    const base = l.from.replace(/\.html$/, "");
    for (const form of [l.from, base, `${base}/`]) assert.deepEqual([redirect(form)?.destination, redirect(form)?.permanent], [l.to, true], form);
  }
  const adminHeader = v.headers.find((h) => h.source.startsWith("/admin"));
  assert.match(adminHeader.headers[0].value, /noindex/);
});

// ------------------------------------------------------------ navigation and language switching
test("internal links keep the locale of the page", () => {
  for (const p of pages) {
    const hrefs = attr(p.html, /<a [^>]*href="([^"]+)"/g);
    assert.ok(hrefs.length > 0);
    for (const h of hrefs) {
      if (h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("https://")) continue;
      // the language switch is the only link that may leave the page's locale
      const isSwitch = new RegExp(`<a [^>]*href="${h}"[^>]*hreflang="`).test(p.html);
      if (isSwitch) continue;
      assert.ok(h.startsWith(`/${p.locale}/`), `${p.file}: ${h}`);
      assert.ok(resolve(h).route, `${p.file}: ${h} must resolve`);
    }
    assert.ok(p.html.includes(`href="${APP_URL}"`) || p.route.page === "legal", `${p.file} links to the app`);
  }
});

test("language switch goes to the equivalent page in the other language", () => {
  for (const p of pages) {
    const other = LOCALES.find((l) => l !== p.locale);
    const m = p.html.match(new RegExp(`<a [^>]*href="([^"]+)"[^>]*hreflang="${other}"`));
    assert.ok(m, `${p.file} has a switch to ${other}`);
    const target = resolve(m[1]);
    assert.equal(target.locale, other);
    // the equivalent page when it exists in the other language, otherwise that language's home (never a 404)
    assert.equal(target.route.key, isAvailable(p.route, other) ? p.route.key : "home", `${p.file} -> ${m[1]}`);
  }
});

test("a page without an equivalent falls back to the localized home, and never advertises the missing one", () => {
  const giveaways = routeByKey("giveaways");
  const was = giveaways.status;
  try {
    giveaways.status = "live";
    assert.deepEqual(availableLocales(giveaways), ["ro"]);
    assert.equal(switchHref(giveaways, "en"), "/en/");
    assert.deepEqual(alternates(giveaways), []);
    assert.equal(resolve("/en/giveaways/").status, 404);
    assert.equal(resolve("/ro/giveaways/").route.key, "giveaways");
  } finally {
    giveaways.status = was;
  }
});

// ------------------------------------------------------------ metadata
test("every page has exactly one h1, the right lang, its own canonical and og:url", () => {
  for (const p of indexable) {
    assert.equal((p.html.match(/<h1[\s>]/g) || []).length, 1, `${p.file} h1`);
    assert.match(p.html, new RegExp(`<html lang="${p.locale}">`));
    const url = absoluteUrl(p.route, p.locale);
    assert.deepEqual(canonical(p.html), [url], p.file);
    assert.deepEqual(meta(p.html, "og:url"), [url], p.file);
    assert.ok(url.startsWith(SITE_URL), "absolute production URL");
    assert.ok(!url.includes("?") && !url.includes("#"), "no query or tracking parameters in canonicals");
  }
});

test("og:locale and robots are right; social image has alt text; public pages are indexable", () => {
  for (const p of indexable) {
    assert.deepEqual(meta(p.html, "og:locale"), [p.locale === "ro" ? "ro_RO" : "en_US"], p.file);
    assert.deepEqual(meta(p.html, "og:locale:alternate"), isAvailable(p.route, p.locale === "ro" ? "en" : "ro") ? [p.locale === "ro" ? "en_US" : "ro_RO"] : [], p.file);
    const robots = meta(p.html, "robots")[0];
    assert.match(robots, /^index, follow/);
    assert.ok(!/noindex/.test(robots));
    assert.equal(meta(p.html, "og:image")[0], `${SITE_URL}/og.png`);
    assert.ok(meta(p.html, "og:image:alt")[0].length > 10);
    assert.equal(meta(p.html, "twitter:card")[0], "summary_large_image");
  }
});

test("titles, descriptions and Open Graph copy are localized and unique per page", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const p of pages) {
    const title = unescape(attr(p.html, /<title>([^<]*)<\/title>/g)[0]);
    const description = unescape(meta(p.html, "description")[0]);
    assert.equal(title, metaOf(p).title);
    assert.equal(unescape(meta(p.html, "og:title")[0]), metaOf(p).ogTitle);
    assert.equal(unescape(meta(p.html, "og:description")[0]), metaOf(p).ogDescription);
    assert.ok(description.length >= 40 && description.length <= 200, `${p.file} description length ${description.length}`);
    assert.ok(!titles.has(title), `duplicate title: ${title}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${description}`);
    titles.add(title);
    descriptions.add(description);
  }
  assert.equal(titles.size, pages.length);
});

test("hreflang is reciprocal, self-referencing, complete and never invented", () => {
  for (const p of indexable) {
    const links = hreflangs(p.html);
    if (availableLocales(p.route).length < 2) {
      assert.deepEqual(links, {}, `${p.file}: a single-language page must not invent an alternate`);
      continue;
    }
    assert.deepEqual(Object.keys(links).sort(), [...LOCALES].sort(), p.file);
    assert.ok(!("x-default" in links), "no x-default: / only redirects");
    assert.equal(links[p.locale], absoluteUrl(p.route, p.locale), "self reference");
    for (const [loc, url] of Object.entries(links)) {
      const target = pageAt(url);
      assert.ok(target, `${p.file} points at a real page: ${url}`);
      assert.equal(target.locale, loc);
      assert.deepEqual(hreflangs(target.html), links, `${url} points back with the same set`);
      assert.notEqual(canonical(target.html)[0], canonical(p.html)[0] === url ? "" : canonical(p.html)[0], "languages never share a canonical");
    }
  }
});

test("structured data on the home page: valid JSON, FAQ equals the visible FAQ, correct language", () => {
  for (const locale of LOCALES) {
    const p = pages.find((x) => x.route.key === "home" && x.locale === locale);
    const raw = attr(p.html, /<script type="application\/ld\+json">([^<]*)<\/script>/g)[0];
    const data = JSON.parse(raw);
    const faq = data["@graph"].find((n) => n["@type"] === "FAQPage");
    assert.equal(faq.inLanguage, locale);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), DICTIONARIES[locale].home.faq.map((f) => f.q));
    for (const q of faq.mainEntity) assert.ok(unescape(p.html).includes(q.name), `${q.name} is visible on the page`);
  }
});

// ------------------------------------------------------------ copy completeness
const shape = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o);

test("both dictionaries have exactly the same keys, with no empty or placeholder copy", () => {
  assert.deepEqual(shape(DICTIONARIES.en), shape(DICTIONARIES.ro));
  const walk = (o, path, out) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") out.push([`${path}.${k}`, v]);
      else if (v && typeof v === "object") walk(v, `${path}.${k}`, out);
    }
    return out;
  };
  for (const l of LOCALES) {
    for (const [key, v] of walk(DICTIONARIES[l], l, [])) {
      assert.ok(v.trim().length > 0, `${key} is empty`);
      assert.ok(!/translation missing|todo|lorem|placeholder/i.test(v), `${key} looks like placeholder copy`);
    }
  }
});

test("English pages contain no Romanian chrome and Romanian pages no English chrome", () => {
  const roWords = ["Deschide aplicația", "Sari la conținut", "Întrebări frecvente", "Confidențialitate", "Se încarcă"];
  const enWords = ["Open the app", "Skip to content", "Frequently asked questions"];
  for (const p of pages.filter((x) => x.route.page !== "legal")) {
    const text = unescape(p.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""));
    for (const w of p.locale === "en" ? roWords : enWords) assert.ok(!text.includes(w), `${p.file} contains "${w}"`);
  }
  for (const p of pages.filter((x) => x.route.page === "legal" && x.locale === "en")) {
    assert.ok(!/Ultima actualizare|Termeni și condiții|Politica de confidențialitate/.test(unescape(p.html.replace(/<title>.*<\/title>/, ""))), `${p.file} is fully English`);
  }
});

// ------------------------------------------------------------ giveaways (Romania only) and private routes
test("Romanian-only giveaways: exist only under /ro, never built, linked, listed or resolved for /en", () => {
  for (const key of ["giveaways", "giveaway"]) assert.deepEqual(Object.keys(routeByKey(key).paths), ["ro"], key);
  assert.deepEqual(
    pages.filter((p) => p.route.key.startsWith("giveaway")).map((p) => [p.route.key, p.locale]).sort(),
    [["giveaway", "ro"], ["giveaways", "ro"]],
  );
  assert.ok(!files.some((f) => /^en\/giveaway/.test(f.file)), "no English giveaway file is generated");
  for (const p of pages.filter((x) => x.locale === "en")) assert.ok(!/giveaway/i.test(p.html), `${p.file} advertises giveaways`);
  assert.ok(!pageAt(`${SITE_URL}/en/giveaways/`));
  assert.equal(resolve("/en/giveaways/").status, 404);
  assert.equal(resolve("/en/giveaways/some-slug/").status, 404);
  assert.equal(resolve("/ro/giveaways/").route.key, "giveaways");
  const d = resolve("/ro/giveaways/molt-3d/");
  assert.deepEqual([d.route.key, d.locale, d.params.slug], ["giveaway", "ro", "molt-3d"]);
  for (const bad of ["/ro/giveaways/a/", "/ro/giveaways/Bad_Slug/", "/ro/giveaways/a/b/", "/ro/giveaways/_shell/", "/ro/giveaways/-x-/"]) assert.equal(resolve(bad).status, 404, bad);
  assert.equal(resolve("/ro/giveaways/molt-3d").redirect, "/ro/giveaways/molt-3d/");
  // the language switch from a giveaway page falls back to /en/ and the Romanian page offers no hreflang
  assert.equal(switchHref(routeByKey("giveaways"), "en"), "/en/");
  const list = pages.find((p) => p.route.key === "giveaways");
  assert.deepEqual(hreflangs(list.html), {});
  assert.match(list.html, /<link rel="canonical" href="https:\/\/www\.molted\.eu\/ro\/giveaways\/"/);
  const home = pages.find((p) => p.route.key === "home" && p.locale === "ro");
  assert.ok(home.html.includes('href="/ro/giveaways/"'), "the Romanian navigation offers the giveaways");
});

test("the shared campaign shell: generic metadata, canonical to the list, wired to its script", () => {
  const shell = pages.find((p) => p.route.key === "giveaway");
  assert.equal(shell.file, "ro/giveaways/_shell/index.html");
  assert.match(shell.html, /<link rel="canonical" href="https:\/\/www\.molted\.eu\/ro\/giveaways\/" \/>/);
  assert.ok(shell.html.includes('id="campanie"'));
  assert.ok(shell.html.includes("/src/giveaway.js"));
  assert.deepEqual(hreflangs(shell.html), {});
});

test("vercel.json serves every /ro/giveaways/<slug>/ from the shell and hides the shell itself", () => {
  const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  // both spellings, so the rewrite matches whichever way the host normalizes the trailing slash
  assert.deepEqual(v.rewrites, [
    { source: "/ro/giveaways/:slug([a-z0-9-]{3,60})/", destination: "/ro/giveaways/_shell/" },
    { source: "/ro/giveaways/:slug([a-z0-9-]{3,60})", destination: "/ro/giveaways/_shell/" },
  ]);
  assert.ok(v.redirects.some((r) => r.source === "/ro/giveaways/_shell/" && r.destination === "/ro/giveaways/"));
  assert.ok(!JSON.stringify(v).includes("/en/giveaways"));
});

test("sitemap lists exactly the canonical public pages, each with reciprocal alternates", () => {
  const xml = buildSitemap();
  const locs = attr(xml, /<loc>([^<]+)<\/loc>/g);
  assert.deepEqual([...locs].sort(), indexable.map((p) => absoluteUrl(p.route, p.locale)).sort());
  assert.ok(locs.includes(`${SITE_URL}/ro/giveaways/`), "the giveaway list is listed");
  assert.ok(!locs.some((l) => /_shell|\[slug\]|\/en\/giveaway/.test(l)), "no shell, placeholder or English giveaway URL");
  assert.equal(new Set(locs).size, locs.length, "no duplicates");
  for (const loc of locs) {
    assert.ok(pageAt(loc), `${loc} is a generated page (no redirects or 404s)`);
    assert.ok(loc.endsWith("/"), "canonical trailing slash");
    assert.ok(!/admin|\/api\/|\?|#|localhost|vercel\.app/.test(loc), loc);
  }
  for (const block of xml.split("<url>").slice(1)) {
    const own = block.match(/<loc>([^<]+)</)[1];
    const alts = [...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[2]);
    const page = pageAt(own);
    assert.deepEqual(alts.length, availableLocales(page.route).length > 1 ? LOCALES.length : 0, own);
    if (alts.length) assert.ok(alts.includes(own), `${own} references itself`);
  }
  assert.ok(!xml.includes("404"));
});

test("robots.txt allows crawling, blocks only the admin page, and points at the sitemap", () => {
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Allow: \//m);
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE_URL}/sitemap.xml$`, "m"));
  assert.ok(!/Disallow: \/(assets|src|ro|en)?\s*$/m.test(robots.replace("Disallow: /admin", "")), "no blocked CSS/JS or pages");
  const admin = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(admin, /<meta name="robots" content="noindex, nofollow"/);
});

test("the shared 404 page is noindex and links to both home pages", () => {
  const nf = files.find((f) => f.file === "404.html").html;
  assert.match(nf, /<meta name="robots" content="noindex, follow"/);
  assert.ok(nf.includes('href="/ro/"') && nf.includes('href="/en/"'));
});
