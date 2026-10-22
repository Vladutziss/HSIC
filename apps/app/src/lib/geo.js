// First-visit language by country. app.molted.eu is a static site, so the country (which only Vercel knows, from the IP
// address) reaches the page as a cookie set by middleware.js on "/": `molted_lang_hint=ro|en`. The page reads it
// synchronously in detectLocale() (lib/i18n.js). It is only a hint for people who never picked a language: ?lang= and the
// saved choice come first. "ro" (Romania, Moldova) opens the app in Romanian; "en" (any other country) leaves the
// decision to the browser language, so Romanians abroad with a Romanian browser still get Romanian. The same list is in
// apps/web/src/i18n/geo.js (a test keeps them equal).

export const GEO_COOKIE = "molted_lang_hint";
export const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const ROMANIAN_COUNTRIES = ["RO", "MD"];

const UNKNOWN_COUNTRIES = ["XX", "T1"]; // "unknown" and "Tor" placeholders some networks use

/** "ro" / "en" for a country code, or null when the country is not known (then no hint is set). */
export function localeForCountry(value) {
  const c = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || UNKNOWN_COUNTRIES.includes(c)) return null;
  return ROMANIAN_COUNTRIES.includes(c) ? "ro" : "en";
}

/** The hint from a `document.cookie` string, or null. */
export function hintFromCookie(cookie) {
  const m = new RegExp(`(?:^|;\\s*)${GEO_COOKIE}=(ro|en)(?:;|$)`).exec(String(cookie || ""));
  return m ? m[1] : null;
}

export const hintCookie = (locale) => `${GEO_COOKIE}=${locale}; Path=/; Max-Age=${GEO_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
