// Single source of truth for the public pages of molted.eu and their localized URLs.
// Everything that needs a URL (generated pages, language switcher, hreflang, sitemap, redirects, tests) reads this file.
//
// A route is available in a locale when it has a path for that locale. A route with no path for a locale simply does
// not exist there: no page is generated, nothing links to it, it is left out of the sitemap and of hreflang, and the
// URL answers 404. A route marked `status: "planned"` is reserved but not published yet.

export const SITE_URL = "https://www.molted.eu"; // production host (the apex molted.eu redirects here)
export const APP_URL = "https://app.molted.eu";
export const LOCALES = ["ro", "en"];
export const DEFAULT_LOCALE = "ro"; // "/" redirects here

export const ROUTES = [
  { key: "home", paths: { ro: "", en: "" }, page: "home", priority: "1.0" },
  { key: "team", paths: { ro: "echipa", en: "team" }, page: "team", priority: "0.6" },
  { key: "privacy", paths: { ro: "confidentialitate", en: "privacy" }, page: "legal", priority: "0.3" },
  { key: "terms", paths: { ro: "termeni", en: "terms" }, page: "legal", priority: "0.3" },
  // Romania-only giveaways (not built yet). Only `ro` has a path, so /en/giveaways can never exist or be advertised.
  // When the feature ships: set status to "live", add a page renderer, and add dynamic pages (giveaways/[slug]) to
  // `extraEntries` of the generator for the `ro` locale only.
  { key: "giveaways", paths: { ro: "giveaways" }, page: "giveaways", status: "planned" },
];

const live = (r) => r.status !== "planned";

export const liveRoutes = () => ROUTES.filter(live);
export const routeByKey = (key) => ROUTES.find((r) => r.key === key);
export const isAvailable = (route, locale) => live(route) && typeof route.paths[locale] === "string";
export const availableLocales = (route) => LOCALES.filter((l) => isAvailable(route, l));

/** "/ro/", "/ro/echipa/": always with a trailing slash (the canonical form; Vercel is set to trailingSlash). */
export const urlPath = (route, locale) => `/${locale}/${route.paths[locale] ? `${route.paths[locale]}/` : ""}`;
export const absoluteUrl = (route, locale) => `${SITE_URL}${urlPath(route, locale)}`;

/** Every available language of a page, for hreflang and the sitemap. Empty unless there is more than one. */
export function alternates(route) {
  const ls = availableLocales(route);
  return ls.length > 1 ? ls.map((locale) => ({ locale, url: absoluteUrl(route, locale) })) : [];
}

/** Where the language switcher goes from `route` in `from` to `to`: the equivalent page, or else the localized home. */
export function switchHref(route, to) {
  return isAvailable(route, to) ? urlPath(route, to) : urlPath(routeByKey("home"), to);
}

/** The languages the switcher offers on this page (other than the current one). */
export const switchTargets = (locale) => LOCALES.filter((l) => l !== locale);

/**
 * Maps a request path to what the site serves, the same way the generated static files do.
 * Returns { redirect } for known legacy/redirecting paths, { route, locale } for a page, or { status: 404 }.
 */
export function resolve(pathname) {
  const clean = pathname.split(/[?#]/)[0];
  if (clean === "/" || clean === "") return { redirect: urlPath(routeByKey("home"), DEFAULT_LOCALE), status: 307 };
  const legacy = LEGACY_REDIRECTS.find((r) => r.from === clean);
  if (legacy) return { redirect: legacy.to, status: 301 };
  const m = clean.match(/^\/([a-z]{2})(?:\/(.*?))?\/?$/);
  if (!m || !LOCALES.includes(m[1])) return { status: 404 };
  const locale = m[1];
  const slug = m[2] || "";
  const route = liveRoutes().find((r) => isAvailable(r, locale) && r.paths[locale] === slug);
  if (!route) return { status: 404 };
  if (!clean.endsWith("/")) return { redirect: urlPath(route, locale), status: 308 };
  return { route, locale };
}

// The pre-localization URLs. They were Romanian, so they move permanently to the Romanian equivalents.
export const LEGACY_REDIRECTS = [
  { from: "/index.html", to: "/ro/" },
  { from: "/team.html", to: "/ro/echipa/" },
  { from: "/privacy.html", to: "/ro/confidentialitate/" },
  { from: "/terms.html", to: "/ro/termeni/" },
];
