// Which language molted.eu opens in for a visitor who has not picked one. Used only by the root middleware (/).
// Romanian for Romania and Moldova, English for every other country. Vercel puts the visitor's country (ISO 3166-1
// alpha-2, from the IP address) in `x-vercel-ip-country`; when it is missing or unusable (local dev, some proxies,
// Tor) the browser's Accept-Language decides, and the default is English.
// The same country list is in apps/app/src/lib/geo.js (a test keeps them equal).

export const ROMANIAN_COUNTRIES = ["RO", "MD"];

const UNKNOWN_COUNTRIES = ["XX", "T1"]; // "unknown" and "Tor" placeholders some networks use

export function normalizeCountry(value) {
  const c = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && !UNKNOWN_COUNTRIES.includes(c) ? c : null;
}

/** "ro" or "en" for a request's headers (a Headers object). */
export function localeForHeaders(headers) {
  const country = normalizeCountry(headers.get("x-vercel-ip-country"));
  if (country) return ROMANIAN_COUNTRIES.includes(country) ? "ro" : "en";
  const first = String(headers.get("accept-language") || "").split(",")[0].trim().toLowerCase();
  return first.startsWith("ro") ? "ro" : "en";
}
