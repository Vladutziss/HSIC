// Vercel Routing Middleware for app.molted.eu: on "/" it sets the language hint cookie from the visitor's country, so
// the first page load can already be in the right language (src/lib/geo.js, read by detectLocale in lib/i18n.js).
// It never redirects and never changes the page; with an unknown country it sets nothing.
// "x-middleware-next: 1" is how Vercel is told to continue to the page (what `next()` from @vercel/functions returns);
// it is written out here to avoid a dependency for one header.

import { hintCookie, localeForCountry } from "./src/lib/geo.js";

export const config = { matcher: "/" };

export default function middleware(request) {
  const locale = localeForCountry(request.headers.get("x-vercel-ip-country"));
  const headers = { "x-middleware-next": "1" };
  if (locale) headers["set-cookie"] = hintCookie(locale);
  return new Response(null, { headers });
}
