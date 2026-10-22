// Vercel Routing Middleware for app.molted.eu. On "/" a visitor whose IP is in Romania or Moldova is redirected once to
// "/?hl=ro", which the page reads to open in Romanian (src/lib/geo.js, detectLocale in lib/i18n.js). Nothing is stored:
// no cookie, no localStorage. Everyone else, and anyone who already has `hl` or an explicit `lang`, goes straight on.
// "x-middleware-next: 1" tells Vercel to continue to the page (what `next()` from @vercel/functions returns); it is
// written out here to avoid a dependency for one header.

import { HINT_PARAM, isRomanianCountry } from "./src/lib/geo.js";

export const config = { matcher: "/" };

export default function middleware(request) {
  const url = new URL(request.url);
  const asked = url.searchParams.has(HINT_PARAM) || url.searchParams.has("lang");
  if (asked || !isRomanianCountry(request.headers.get("x-vercel-ip-country"))) return new Response(null, { headers: { "x-middleware-next": "1" } });
  url.searchParams.set(HINT_PARAM, "ro");
  return new Response(null, {
    status: 307,
    headers: { location: url.toString(), "cache-control": "private, no-store", vary: "x-vercel-ip-country" },
  });
}
