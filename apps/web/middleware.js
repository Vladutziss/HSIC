// Vercel Routing Middleware for molted.eu: "/" goes to the Romanian or the English home by the visitor's country
// (see src/i18n/geo.js). Every other URL is a static file and never reaches this code.
// The answer depends on who asks, so it is temporary (307) and must not be cached by the CDN or the browser.
// vercel.json must NOT redirect "/" itself: redirects run before middleware and would hide it.

import { localeForHeaders } from "./src/i18n/geo.js";

export const config = { matcher: "/" };

export default function middleware(request) {
  const locale = localeForHeaders(request.headers);
  return new Response(null, {
    status: 307,
    headers: {
      location: new URL(`/${locale}/`, request.url).toString(),
      "cache-control": "private, no-store",
      vary: "x-vercel-ip-country, accept-language",
    },
  });
}
