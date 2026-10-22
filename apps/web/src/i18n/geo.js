// Which language molted.eu opens in for a visitor who has not picked one. Used only by the root middleware (/).
// Romanian when the visitor is in Romania or Moldova (Vercel puts the country, ISO 3166-1 alpha-2 from the IP address,
// in `x-vercel-ip-country`) OR when the browser's first language is Romanian (so Romanians abroad get Romanian).
// English in every other case, including when the country is missing or unusable (local dev, some proxies, Tor).
// The same country list is in apps/app/src/lib/geo.js (a test keeps them equal).

export const ROMANIAN_COUNTRIES = ["RO", "MD"];

const UNKNOWN_COUNTRIES = ["XX", "T1"]; // "unknown" and "Tor" placeholders some networks use

export function normalizeCountry(value) {
  const c = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && !UNKNOWN_COUNTRIES.includes(c) ? c : null;
}

/** True when the first language in an Accept-Language header is Romanian (ro, ro-RO, ro-MD). */
export const prefersRomanian = (acceptLanguage) => /^ro(?:-|;|$)/.test(String(acceptLanguage || "").split(",")[0].trim().toLowerCase());

/** "ro" or "en" for a request's headers (a Headers object). */
export function localeForHeaders(headers) {
  const country = normalizeCountry(headers.get("x-vercel-ip-country"));
  if (country && ROMANIAN_COUNTRIES.includes(country)) return "ro";
  return prefersRomanian(headers.get("accept-language")) ? "ro" : "en";
}
