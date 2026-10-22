// <head> for every generated page: title, description, canonical, hreflang, Open Graph, Twitter, robots, JSON-LD.
// Pure functions: the output is plain HTML strings so the metadata is in the initial response, not added by scripts.
import { SITE_URL, absoluteUrl, alternates, availableLocales, isAvailable } from "./i18n/routes.js";

export const OG_IMAGE = `${SITE_URL}/og.png`;
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const FONTS = `    <link rel="preload" href="/fonts/nunito-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/fonts/nunito.css" />`;

const ICONS = `    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;

/** Links to every available language of the page (self included), plus nothing invented for missing ones. */
export function hreflangLinks(route) {
  return alternates(route)
    .map((a) => `    <link rel="alternate" hreflang="${a.locale}" href="${a.url}" />`)
    .join("\n");
}

/**
 * @param {{route:object, locale:string, t:object, styles?:"tailwind"|string, script?:string, jsonLd?:object, robots?:string}} p
 * `styles`: "tailwind" links the shared stylesheet; any other string is inlined as CSS.
 */
export function renderHead({ route, locale, t, styles = "tailwind", script, jsonLd, robots = "index, follow, max-image-preview:large", url: urlOverride }) {
  const m = t.meta[route.key];
  const url = urlOverride || absoluteUrl(route, locale);
  const otherLocales = availableLocales(route).filter((l) => l !== locale);
  const lines = [
    `    <meta charset="UTF-8" />`,
    `    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`,
    `    <title>${esc(m.title)}</title>`,
    `    <meta name="description" content="${esc(m.description)}" />`,
    `    <meta name="robots" content="${esc(robots)}" />`,
    `    <link rel="canonical" href="${url}" />`,
    hreflangLinks(route),
    `    <meta name="theme-color" content="#0c0a1d" />`,
    ICONS,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="Molted" />`,
    `    <meta property="og:locale" content="${t.ogLocale}" />`,
    ...otherLocales.map((l) => `    <meta property="og:locale:alternate" content="${l === "ro" ? "ro_RO" : "en_US"}" />`),
    `    <meta property="og:title" content="${esc(m.ogTitle)}" />`,
    `    <meta property="og:description" content="${esc(m.ogDescription)}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:image" content="${OG_IMAGE}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:image:alt" content="${esc(m.ogImageAlt)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${esc(m.ogTitle)}" />`,
    `    <meta name="twitter:description" content="${esc(m.ogDescription)}" />`,
    `    <meta name="twitter:image" content="${OG_IMAGE}" />`,
    `    <meta name="twitter:image:alt" content="${esc(m.ogImageAlt)}" />`,
  ];
  if (jsonLd) lines.push(`    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`);
  lines.push(FONTS);
  if (styles === "tailwind") lines.push(`    <link rel="stylesheet" href="/src/styles.css" />`);
  else lines.push(`    <style>\n${styles}</style>`);
  if (script) lines.push(`    <script type="module" src="${script}"></script>`);
  return lines.filter((l) => l !== "").join("\n");
}

/** Structured data for the home page, built from the same visible FAQ so the two can never disagree. */
export function homeJsonLd(t, locale, route) {
  const url = absoluteUrl(route, locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Molted",
        url: "https://app.molted.eu",
        description: t.home.appDescription,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        inLanguage: "ro",
      },
      {
        "@type": "FAQPage",
        url,
        inLanguage: locale,
        mainEntity: t.home.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

export { isAvailable };
