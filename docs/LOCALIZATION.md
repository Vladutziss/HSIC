# molted.eu: localization and SEO (`apps/web`)

Production host: `https://www.molted.eu` (the apex `molted.eu` redirects to it). Hosting: Vercel project `molted-web`, Root Directory `apps/web`, static output. There is no server-side rendering: the HTML for every page is generated at build time, so titles, descriptions, canonicals, hreflang, Open Graph and JSON-LD are all in the first response.

## URLs

| Page | Romanian | English |
|---|---|---|
| Home | `/ro/` | `/en/` |
| Team | `/ro/echipa/` | `/en/team/` |
| Privacy | `/ro/confidentialitate/` | `/en/privacy/` |
| Terms | `/ro/termeni/` | `/en/terms/` |
| Giveaways (Romania only) | `/ro/giveaways/`, `/ro/giveaways/<slug>/` | does not exist |

- `/` redirects (307, temporary, `no-store`) by the visitor's country: Romania and Moldova go to `/ro/`, and so does anyone whose browser is in Romanian; everyone else goes to `/en/` (see "Language by country"). There is no `x-default` hreflang because `/` is only a redirect. Only `/` is affected: a visitor who opens `/ro/…` or `/en/…` directly always gets that page.
- Canonical form has a trailing slash (`trailingSlash: true` in `apps/web/vercel.json`).
- Unknown URLs get the real 404 page (`404.html`, one file for both languages that shows the English text under `/en/`).
- Old URLs (`/team.html`, `/privacy.html`, `/terms.html`, `/index.html`, with or without `.html` and slash) redirect permanently (301/308) to the Romanian equivalents. The app (`app.molted.eu`) still links to `https://molted.eu/terms.html` and `/privacy.html`; they keep working through these redirects.
- `/admin.html` is private: `noindex` meta tag, `X-Robots-Tag` header and `Disallow: /admin` in `robots.txt`. It is not localized.

## How it works

- `apps/web/src/i18n/routes.js`: the single route table. A page exists in a locale when it has a path for it. Language switching, hreflang, the sitemap, internal links and the tests all read it. Nothing else lists URLs.
- `apps/web/src/i18n/ro.js`, `en.js`: all copy for the generated pages (same keys; a test enforces it). `client.js` has the few strings used by the browser scripts, chosen by `<html lang>`.
- `apps/web/content/*.html`: the legal texts per language. The English versions are translations; the Romanian text is the original and the English pages say so. Have a lawyer review the English legal text before relying on it.
- `apps/web/src/pages.js`, `seo.js`: layout and `<head>`. `apps/web/scripts/generate.mjs`: writes `apps/web/{ro,en}/**/index.html`, `404.html` and `public/sitemap.xml` (all git-ignored). `vite.config.js` runs it on every `dev` and `build`.
- Language switch: links to the equivalent page, or to the other language's home when there is none.

## Language by country

- `apps/web/middleware.js` (Vercel Routing Middleware, matcher `/`) reads `x-vercel-ip-country` (ISO country from the IP, set by Vercel) and redirects to `/ro/` when the country is `RO` or `MD` **or** the first language of `Accept-Language` is Romanian (`ro`, `ro-RO`, `ro-MD`), and to `/en/` in every other case. The decision is in `src/i18n/geo.js`. A missing or unusable country (`XX`, `T1`, not two letters) simply does not count as Romanian.
- `vercel.json` must not redirect `/` itself: redirects run before middleware and would hide it. The `/` → `/ro/` rewrite in `vercel.json` is only the fallback if the middleware is not deployed (then `/` answers 200 with the Romanian home instead of a redirect).
- `apps/app/middleware.js` (matcher `/`): a visitor whose IP is in `RO` or `MD` who opens `/` is redirected once (307, `no-store`) to `/?hl=ro`; nobody else is redirected, and neither is a request that already has `hl` or `lang` (no loops). `detectLocale()` in `apps/app/src/lib/i18n.js` reads `hl=ro` after `?lang=` and the saved choice (then a Romanian browser, `ro-*`, also gives Romanian; anything else English) and removes `hl` from the address. **Nothing is stored on the device**: a geo cookie was rejected because one the visitor did not ask for is not "strictly necessary" (Law 506/2004 art. 4(6)(b)) and would need consent. Do not add one without changing the cookie policy and the consent flow.
- The two country lists (`apps/web/src/i18n/geo.js`, `apps/app/src/lib/geo.js`) are kept equal by a test. To add a country, change both.
- Romanians abroad (Romanian browser, foreign IP) get Romanian; an English-language browser in Romania also gets Romanian (the country is enough), and can switch. Explicit choice: app saves it on the device and in the account; the site's switch does not remember it for `/`.
- Crawlers: Googlebot normally crawls from the US and so sees `/` redirect to `/en/`; `/ro/…` and `/en/…` stay directly crawlable with reciprocal hreflang.

## Adding a page

Add a route to `ROUTES`, add its copy (`meta.<key>` in both dictionaries), a renderer in `pages.js` if it needs a new layout, and the legal/body text if any. `npm test -w @molted/web` fails if a locale is missing copy, a canonical or hreflang is wrong, or a page is missing from the sitemap.

## Romanian-only features (giveaways)

`giveaways` (the list, `/ro/giveaways/`) and `giveaway` (the campaign page, `/ro/giveaways/[slug]/`) are live in `ROUTES` with a `ro` path only; the system itself is described in `docs/GIVEAWAYS.md`. Because the routes have no `en` path, `/en/giveaways/...` is never generated (404), is absent from the English navigation, footer, sitemap and hreflang, and the language switch from a giveaway page falls back to `/en/`. Their copy lives in `src/i18n/ro-only.js`, outside the ro/en parity check. The campaign page is one static shell (`ro/giveaways/_shell/`) that `vercel.json` rewrites every `/ro/giveaways/<slug>/` to; `/ro/giveaways/_shell/` itself redirects to the list. Tests cover all of this.

## Deploy checklist

1. Merge to `main`; Vercel builds `apps/web` (`vite build`, output `dist`). `vercel.json` is picked up automatically.
2. After the deploy, check: `/` answers 307 (not 200: 200 means the middleware is not running and the fallback rewrite is serving) to `/ro/` or `/en/` by country (the edge sets that header itself, so test from a real connection or a VPN in each country, not with a spoofed header); on `app.molted.eu` a request from Romania or Moldova to `/` answers 307 to `/?hl=ro`, any other country answers 200, and no response sets a cookie; `/en/team/` 200; `/team.html` → `/ro/echipa/`; `/en/giveaways/` and `/nope` 404; `/sitemap.xml` and `/robots.txt` 200.
3. Submit `https://www.molted.eu/sitemap.xml` in Google Search Console (manual) and, for the old URLs, request reindexing of `/ro/`.
4. Not verifiable from the repo: how Vercel orders `cleanUrls` against redirects. The redirects cover `/x.html`, `/x` and `/x/` so the result is the same either way.

## Known limits

- The language switch on the site does not remember the choice for `/` (no cookie), so a visitor in Romania who chose English gets Romanian again when they open `molted.eu`.
- Old URLs (`/team`, `/privacy`, …) still redirect permanently to the Romanian pages whatever the country.
- `og.png` has no text, so the same image is used for both languages (alt text is localized).
- No `lastmod` in the sitemap (no reliable per-page date).

## Legal pages: what must stay true

The texts are `apps/web/content/{terms,privacy,cookies}.{ro,en}.html` (Romanian is the original, English a translation; change both together and keep the "Last updated" dates equal). `apps/web/tests/legal.test.mjs` fails on the points that were wrong before:

- Consent rule and exception are cited correctly: **Law 506/2004 art. 4(5)** = prior consent for any storage or access on the device; **art. 4(6)(b)** = the exception for what is strictly necessary for a service the user expressly asked for (with Directive 2002/58/EC art. 5(3)). The policies once cited art. 4(5) for the exception.
- No third-party font or script is loaded before consent: the Nunito font is self-hosted (`public/fonts/` in both apps). Loading it from Google Fonts sends the visitor's IP to Google; German courts disagreed on whether that is actionable (LG München I, 3 O 17493/20 awarded damages in 2022, 4 O 13063/22 in 2023 found none in another case), and self-hosting avoids the question. The `artifact/momentum.html` demo still uses Google Fonts; it is not part of molted.eu or app.molted.eu.
- Anything new stored on the device (cookie, localStorage, sessionStorage) is listed in the cookie policy, and if it is not strictly necessary and chosen by the user it needs consent before it is stored.
- New processors or new uses of personal data (IP address included) are listed in the privacy policy with a legal basis.

Not a substitute for a lawyer: the operator is a group of natural persons without legal personality, the English legal text is a translation, and nobody has reviewed the Romanian text for compliance. Ask a Romanian lawyer to review all three documents before launch.
