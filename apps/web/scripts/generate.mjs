// Generates the localized static pages and the sitemap from the route table and the dictionaries.
//   node apps/web/scripts/generate.mjs          (also runs automatically from vite.config.js)
// Output (all git-ignored): ro/**/index.html, en/**/index.html, 404.html (apps/web) and public/sitemap.xml.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import en from "../src/i18n/en.js";
import ro from "../src/i18n/ro.js";
import { LOCALES, SITE_URL, absoluteUrl, alternates, availableLocales, isAvailable, liveRoutes, urlPath } from "../src/i18n/routes.js";
import { renderNotFound, renderPage } from "../src/pages.js";

export const DICTIONARIES = { ro, en };
const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** sitemap.xml: only canonical, indexable, existing pages; both languages of a page reference each other. */
export function buildSitemap() {
  const urls = [];
  for (const route of liveRoutes()) {
    const alts = alternates(route);
    for (const locale of availableLocales(route)) {
      const links = alts.map((a) => `<xhtml:link rel="alternate" hreflang="${a.locale}" href="${a.url}"/>`).join("");
      urls.push(`<url><loc>${absoluteUrl(route, locale)}</loc>${links}</url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>\n`;
}

/** Every generated file as { file (relative to apps/web), html }. Pure: nothing is written. */
export function buildSite() {
  const files = [];
  for (const route of liveRoutes()) {
    for (const locale of LOCALES) {
      if (!isAvailable(route, locale)) continue; // e.g. /en/giveaways is never built
      files.push({ file: `${urlPath(route, locale).slice(1)}index.html`, html: renderPage(route, locale, DICTIONARIES[locale]), route, locale });
    }
  }
  files.push({ file: "404.html", html: renderNotFound(ro, en) });
  files.push({ file: "public/sitemap.xml", html: buildSitemap() });
  return files;
}

export function writeSite(root = WEB_ROOT) {
  for (const l of LOCALES) rmSync(join(root, l), { recursive: true, force: true });
  const files = buildSite();
  for (const f of files) {
    const out = join(root, f.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, f.html);
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = writeSite();
  console.log(`generated ${files.length} files (${SITE_URL})`);
}
