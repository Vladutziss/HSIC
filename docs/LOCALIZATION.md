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

- `/` redirects (307, temporary) to `/ro/`. Romanian is the default; there is no `x-default` hreflang because `/` is only a redirect.
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

## Adding a page

Add a route to `ROUTES`, add its copy (`meta.<key>` in both dictionaries), a renderer in `pages.js` if it needs a new layout, and the legal/body text if any. `npm test -w @molted/web` fails if a locale is missing copy, a canonical or hreflang is wrong, or a page is missing from the sitemap.

## Romanian-only features (giveaways)

`giveaways` (the list, `/ro/giveaways/`) and `giveaway` (the campaign page, `/ro/giveaways/[slug]/`) are live in `ROUTES` with a `ro` path only; the system itself is described in `docs/GIVEAWAYS.md`. Because the routes have no `en` path, `/en/giveaways/...` is never generated (404), is absent from the English navigation, footer, sitemap and hreflang, and the language switch from a giveaway page falls back to `/en/`. Their copy lives in `src/i18n/ro-only.js`, outside the ro/en parity check. The campaign page is one static shell (`ro/giveaways/_shell/`) that `vercel.json` rewrites every `/ro/giveaways/<slug>/` to; `/ro/giveaways/_shell/` itself redirects to the list. Tests cover all of this.

## Deploy checklist

1. Merge to `main`; Vercel builds `apps/web` (`vite build`, output `dist`). `vercel.json` is picked up automatically.
2. After the deploy, check: `/` → `/ro/`; `/en/team/` 200; `/team.html` → `/ro/echipa/`; `/en/giveaways/` and `/nope` 404; `/sitemap.xml` and `/robots.txt` 200.
3. Submit `https://www.molted.eu/sitemap.xml` in Google Search Console (manual) and, for the old URLs, request reindexing of `/ro/`.
4. Not verifiable from the repo: how Vercel orders `cleanUrls` against redirects. The redirects cover `/x.html`, `/x` and `/x/` so the result is the same either way.

## Known limits

- The app at `app.molted.eu` is Romanian only. English pages link to it and the English FAQ says so.
- `og.png` has no text, so the same image is used for both languages (alt text is localized).
- No `lastmod` in the sitemap (no reliable per-page date).
