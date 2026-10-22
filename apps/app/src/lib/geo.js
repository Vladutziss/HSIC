// First-visit language by country, without storing anything on the visitor's device. app.molted.eu is a static site, so
// only Vercel knows the country (from the IP address, in the `x-vercel-ip-country` header). middleware.js turns it into a
// URL parameter: a visitor from Romania or Moldova who opens "/" is redirected once to "/?hl=ro". detectLocale() (lib/i18n.js)
// reads it and removes it from the address. A cookie was rejected on purpose: one the visitor did not ask for is not
// "strictly necessary" (Law 506/2004 art. 4(6)(b)) and would need consent. Visitors from anywhere else get no parameter
// and the browser language decides, so Romanians abroad with a Romanian browser still get Romanian.
// ?lang= (explicit) and the saved choice come before this hint. The same country list is in apps/web/src/i18n/geo.js
// (a test keeps them equal).

export const HINT_PARAM = "hl";
export const ROMANIAN_COUNTRIES = ["RO", "MD"];

/** True for a Romanian-speaking country code (case and spaces ignored). */
export const isRomanianCountry = (value) => ROMANIAN_COUNTRIES.includes(String(value || "").trim().toUpperCase());

/** "ro" when the address carries the hint (a `location.search` string), else null. */
export function hintFromSearch(search) {
  try {
    return new URLSearchParams(search || "").get(HINT_PARAM) === "ro" ? "ro" : null;
  } catch {
    return null;
  }
}
