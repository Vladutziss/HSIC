// Page bodies. Shared layout (header, footer, language switcher) plus one renderer per `route.page`.
// Build-time only: nothing here ships to the browser.
import { readFileSync } from "node:fs";
import { APP_URL, LOCALES, absoluteUrl, availableLocales, isAvailable, routeByKey, switchHref, urlPath } from "./i18n/routes.js";
import RO_ONLY from "./i18n/ro-only.js";
import { esc, homeJsonLd, renderHead } from "./seo.js";

const read = (f) => readFileSync(new URL(`../content/${f}`, import.meta.url), "utf8");
const LEGAL_CSS = read("legal.css");

const home = () => routeByKey("home");
const link = (key, locale) => urlPath(routeByKey(key), locale);

/** The "RO | EN" link to the other language: the equivalent page when it exists, otherwise that language's home. */
function languageSwitch(route, locale, t) {
  return LOCALES.filter((l) => l !== locale)
    .map(
      (l) =>
        `<a href="${switchHref(route, l)}" hreflang="${l}" lang="${l}" class="rounded-lg px-2 py-1 text-dim hover:text-ink" aria-label="${esc(t.common.languageAria[l])}">${esc(t.common.language[l])}</a>`,
    )
    .join("");
}

function header(route, locale, t, extraNav = "") {
  return `    <header class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
      <a href="${urlPath(home(), locale)}" class="font-pixel text-xl font-bold tracking-wide text-gold" aria-label="${esc(t.common.brandAria)}">MOLTED</a>
      <nav aria-label="${esc(t.common.navAria)}" class="flex items-center gap-5 text-sm font-bold">
${extraNav}        ${languageSwitch(route, locale, t)}
        <a href="${APP_URL}" class="btn btn-sm">${esc(t.common.openApp)}</a>
      </nav>
    </header>`;
}

function footer(locale, t) {
  const items = ["team", "giveaways", "privacy", "terms"].filter((k) => isAvailable(routeByKey(k), locale));
  const label = (k) => (k === "giveaways" ? RO_ONLY.common.giveaways : t.common[k]); // Romania-only: only offered when the route exists in this locale
  return `    <footer class="border-t border-edge">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-dim">
        <p><span class="font-pixel font-bold text-gold">MOLTED</span> · ${esc(t.common.footerTag)}</p>
        <nav aria-label="${esc(t.common.legalAria)}" class="flex gap-5">
${items.map((k) => `          <a href="${link(k, locale)}" class="hover:text-ink">${esc(t.common[k])}</a>`).join("\n")}
        </nav>
      </div>
    </footer>`;
}

const doc = (locale, headHtml, body) => `<!doctype html>
<html lang="${locale}">
  <head>
${headHtml}
  </head>
${body}
</html>
`;

// ------------------------------------------------------------------ home
function homeBody(route, locale, t) {
  const h = t.home;
  const faq = h.faq
    .map((f) => {
      const answer = f.link ? esc(f.a).replace("app.molted.eu", `<a href="${APP_URL}" class="underline hover:text-ink">app.molted.eu</a>`) : esc(f.a);
      return `          <details class="faq">
            <summary>${esc(f.q)}</summary>
            <p>${answer}</p>
          </details>`;
    })
    .join("\n");
  const sprites = ["egg", "apprentice", "master"];
  return `  <body class="app-bg min-h-screen font-sans text-body">
    <a href="#continut" class="skip">${esc(t.common.skip)}</a>

${header(
    route,
    locale,
    t,
    `        <a href="#${h.ids.agent}" class="hidden text-dim hover:text-ink sm:inline">${esc(h.nav.agent)}</a>
        <a href="#${h.ids.features}" class="hidden text-dim hover:text-ink md:inline">${esc(h.nav.features)}</a>
        <a href="#${h.ids.faq}" class="hidden text-dim hover:text-ink sm:inline">${esc(h.nav.faq)}</a>
        <a href="${link("team", locale)}" class="hidden text-dim hover:text-ink sm:inline">${esc(t.common.team)}</a>
${isAvailable(routeByKey("giveaways"), locale) ? `        <a href="${link("giveaways", locale)}" class="hidden text-dim hover:text-ink sm:inline">${esc(RO_ONLY.common.giveaways)}</a>
` : ""}`,
  )}

    <main id="continut">
      <section class="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-10 md:grid-cols-2 md:pt-16" aria-labelledby="titlu">
        <div>
          <p class="font-pixel text-sm uppercase tracking-widest text-violet-hi">${esc(h.kicker)}</p>
          <h1 id="titlu" class="font-pixel mt-4 text-4xl font-bold leading-tight text-ink sm:text-5xl">${esc(h.h1)}</h1>
          <p class="mt-5 max-w-xl text-lg">${esc(h.lead)}</p>
          <div class="mt-8 flex flex-wrap items-center gap-4">
            <a href="${APP_URL}" class="btn">${esc(t.common.openApp)}</a>
            <a href="#${h.ids.agent}" class="btn btn-ghost">${esc(h.ctaAgent)}</a>
          </div>
        </div>
        <figure class="mock" aria-label="${esc(h.mockAria)}">
          <figcaption class="mock-tag">${esc(h.mockTag)}</figcaption>
          <p class="text-xs font-bold uppercase tracking-wider text-dim">${esc(h.mockStatus)}</p>
          <p class="mt-2 font-bold text-ink">${esc(h.mockTitle)}</p>
          <p class="mt-1 text-sm">${esc(h.mockText)}</p>
          <p class="mt-3 text-xs text-dim">${esc(h.mockMeta)}</p>
          <div class="mt-4 flex gap-2"><span class="btn btn-sm">${esc(h.mockConfirm)}</span><span class="btn btn-sm btn-ghost">${esc(h.mockNo)}</span></div>
        </figure>
      </section>

      <section id="${h.ids.agent}" class="mx-auto max-w-6xl scroll-mt-6 px-5 py-16" aria-labelledby="t-agent">
        <h2 id="t-agent" class="font-pixel text-3xl font-bold text-ink">${esc(h.agentH2)}</h2>
        <p class="mt-3 max-w-2xl">${esc(h.agentIntro)}</p>
        <ol class="mt-10 grid gap-5 md:grid-cols-4">
${h.steps.map((s, i) => `          <li class="mock"><p class="step">${i + 1}</p><h3 class="font-pixel text-xl font-bold text-ink">${esc(s.title)}</h3><p class="mt-2 text-sm">${esc(s.text)}</p></li>`).join("\n")}
        </ol>
      </section>

      <section class="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2" aria-labelledby="t-control">
        <div>
          <h2 id="t-control" class="font-pixel text-3xl font-bold text-ink">${esc(h.controlH2)}</h2>
          <ul class="mt-5 space-y-2 text-sm">
${h.control.map((c) => `            <li class="tick">${esc(c)}</li>`).join("\n")}
          </ul>
        </div>
        <figure class="mock" aria-label="${esc(h.weeklyAria)}">
          <figcaption class="mock-tag">${esc(h.mockTag)}</figcaption>
          <p class="text-xs font-bold uppercase tracking-wider text-dim">${esc(h.weeklyTitle)}</p>
          <p class="mt-2 text-sm">${esc(h.weeklyText)}</p>
        </figure>
      </section>

      <section id="${h.ids.features}" class="mx-auto max-w-6xl scroll-mt-6 px-5 py-16" aria-labelledby="t-functii">
        <h2 id="t-functii" class="font-pixel text-3xl font-bold text-ink">${esc(h.featuresH2)}</h2>
        <ul class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
${h.features.map((f) => `          <li class="mock"><h3 class="font-pixel text-xl font-bold text-ink">${esc(f.title)}</h3><p class="mt-2 text-sm">${esc(f.text)}</p></li>`).join("\n")}
        </ul>
      </section>

      <!-- numbers: shown only when the server answers (see src/main.js) -->
      <section id="cifre" hidden class="mx-auto max-w-6xl px-5 py-16" aria-labelledby="t-cifre">
        <h2 id="t-cifre" class="font-pixel text-3xl font-bold text-ink">${esc(h.numbersH2)}</h2>
        <p class="mt-3 max-w-2xl">${esc(h.numbersIntro)}</p>
        <dl class="mt-8 grid grid-cols-2 gap-5 md:grid-cols-5">
${[["users", "c-users"], ["active7", "c-active7"], ["checkins", "c-checkins"], ["objectives", "c-objectives"], ["todos", "c-todos"]]
    .map(([k, id]) => `          <div class="mock"><dt class="text-xs font-bold uppercase tracking-wider text-dim">${esc(h.numbers[k])}</dt><dd class="font-pixel text-3xl text-ink" id="${id}">·</dd></div>`)
    .join("\n")}
        </dl>
        <div id="c-agent" hidden class="mt-10">
          <h3 class="font-pixel text-xl font-bold text-ink">${esc(h.coachH3)}</h3>
          <dl class="mt-4 grid gap-5 sm:grid-cols-3">
${[["decided", "c-decided"], ["applied", "c-applied"], ["improved", "c-improved"]]
    .map(([k, id]) => `            <div class="mock"><dt class="text-xs font-bold uppercase tracking-wider text-dim">${esc(h.coach[k])}</dt><dd class="font-pixel text-3xl text-ink" id="${id}">·</dd></div>`)
    .join("\n")}
          </dl>
          <p class="mt-4 text-sm text-dim">${esc(h.coachNote)}</p>
        </div>
      </section>

      <section id="cum-functioneaza" class="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2" aria-labelledby="t-joc">
        <div>
          <h2 id="t-joc" class="font-pixel text-3xl font-bold text-ink">${esc(h.gameH2)}</h2>
          <p class="mt-3">${esc(h.gameText)}</p>
        </div>
        <ol class="grid grid-cols-3 gap-3" aria-label="${esc(h.stagesAria)}">
${h.stages.map((s, i) => `          <li class="stage"><span class="spr" data-sprite="sport,${sprites[i]},idle" role="img" aria-label="${esc(s.alt)}"></span><b>${esc(s.label)}</b></li>`).join("\n")}
        </ol>
      </section>

      <section id="${h.ids.faq}" class="mx-auto max-w-3xl scroll-mt-6 px-5 py-16" aria-labelledby="t-faq">
        <h2 id="t-faq" class="font-pixel text-3xl font-bold text-ink">${esc(h.faqH2)}</h2>
        <div class="mt-8 space-y-3">
${faq}
        </div>
      </section>

      <section class="mx-auto max-w-3xl px-5 pb-24 pt-8 text-center" aria-labelledby="t-cta">
        <div class="pedestal mx-auto w-28 rounded-2xl p-3"><span class="spr block" data-sprite="sport,egg,idle" role="img" aria-label="${esc(h.eggAlt)}"></span></div>
        <h2 id="t-cta" class="font-pixel mt-6 text-3xl font-bold text-ink">${esc(h.ctaH2)}</h2>
        <p class="mx-auto mt-3 max-w-lg">${esc(h.ctaText)}</p>
        <a href="${APP_URL}" class="btn mt-8">${esc(t.common.openApp)}</a>
      </section>
    </main>

${footer(locale, t)}
  </body>`;
}

// ------------------------------------------------------------------ team (rows are filled in by src/team.js)
function teamBody(route, locale, t) {
  return `  <body class="app-bg min-h-screen font-sans text-body">
    <a href="#continut" class="skip">${esc(t.common.skip)}</a>

${header(route, locale, t)}

    <main id="continut" class="mx-auto max-w-6xl px-5 pb-24">
      <h1 class="font-pixel mt-4 text-4xl font-bold text-ink">${esc(t.team.h1)}</h1>
      <p class="mt-2 max-w-xl text-dim">${esc(t.team.lead)}</p>
      <p id="stare" class="mt-6 text-dim" role="status" aria-live="polite">${esc(t.team.loading)}</p>

      <ul id="membri" class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"></ul>

      <section id="galerie-sectiune" class="mt-16" aria-labelledby="t-galerie" hidden>
        <h2 id="t-galerie" class="font-pixel text-2xl font-bold text-ink">${esc(t.team.gallery)}</h2>
        <ul id="galerie" class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"></ul>
      </section>
    </main>

${footer(locale, t)}
  </body>`;
}

// ------------------------------------------------------------------ legal (standalone style, text in content/)
const LEGAL_EXTRA_CSS = `.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lang{font-weight:800;font-size:14px;color:#9a91c9;text-decoration:none;padding:4px 8px;border-radius:8px}
`;

function legalBody(route, locale, t) {
  const text = read(`${route.key}.${locale}.html`).replace(/\{\{href:(\w+)\}\}/g, (_, k) => link(k, locale));
  const switches = LOCALES.filter((l) => l !== locale)
    .map((l) => `<a class="lang" href="${switchHref(route, l)}" hreflang="${l}" lang="${l}" aria-label="${esc(t.common.languageAria[l])}">${esc(t.common.language[l])}</a>`)
    .join("");
  return `<body><main>
<div class="top"><a class="brand" href="${urlPath(home(), locale)}">Molted</a>${switches}</div>
<section class="panel">
${text}</section>
<a class="back" href="${urlPath(home(), locale)}">${esc(t.common.back)}</a>
</main></body>`;
}

// ------------------------------------------------------------------ giveaways (Romania only; filled in by src/giveaways.js and src/giveaway.js)
function giveawaysBody(route, locale, t) {
  const g = RO_ONLY.giveaways;
  return `  <body class="app-bg min-h-screen font-sans text-body">
    <a href="#continut" class="skip">${esc(t.common.skip)}</a>

${header(route, locale, t)}

    <main id="continut" class="mx-auto max-w-6xl px-5 pb-24">
      <h1 class="font-pixel mt-4 text-4xl font-bold text-ink">${esc(g.h1)}</h1>
      <p class="mt-2 max-w-2xl text-dim">${esc(g.lead)}</p>
      <div id="lista" class="mt-8" aria-live="polite"><p class="text-dim" role="status">${esc(g.loading)}</p></div>
    </main>

${footer(locale, t)}
  </body>`;
}

function giveawayBody(route, locale, t) {
  return `  <body class="app-bg min-h-screen font-sans text-body">
    <a href="#continut" class="skip">${esc(t.common.skip)}</a>

${header(route, locale, t)}

    <main id="continut" class="mx-auto max-w-4xl px-5 pb-24">
      <p class="mt-2"><a href="${link("giveaways", locale)}" class="text-sm font-bold text-dim hover:text-ink">← ${esc(RO_ONLY.common.giveaways)}</a></p>
      <div id="campanie" class="mt-4" aria-live="polite"><p class="text-dim" role="status">${esc(RO_ONLY.giveaway.loading)}</p></div>
    </main>

${footer(locale, t)}
  </body>`;
}

// ------------------------------------------------------------------ public API
export const PAGE_RENDERERS = {
  home: { body: homeBody, script: "/src/main.js", jsonLd: (t, l, r) => homeJsonLd(t, l, r) },
  team: { body: teamBody, script: "/src/team.js" },
  legal: { body: legalBody, styles: LEGAL_CSS + LEGAL_EXTRA_CSS },
  giveaways: { body: giveawaysBody, script: "/src/giveaways.js", roOnly: true },
  // one shell for every campaign: generic metadata here, the campaign's own is set in the browser (docs/GIVEAWAYS.md)
  giveaway: { body: giveawayBody, script: "/src/giveaway.js", roOnly: true, shell: true },
};

export function renderPage(route, locale, t) {
  const r = PAGE_RENDERERS[route.page];
  if (!r) throw new Error(`No renderer for page "${route.page}" (route ${route.key})`);
  // Romania-only pages carry their own copy; the shared shell canonicalizes to the list until the browser knows the campaign
  const tt = r.roOnly ? { ...t, meta: { ...t.meta, [route.key]: RO_ONLY.meta[route.key] } } : t;
  const url = r.shell ? absoluteUrl(routeByKey("giveaways"), locale) : undefined;
  const headHtml = renderHead({ route, locale, t: tt, styles: r.styles, script: r.script, jsonLd: r.jsonLd?.(t, locale, route), url });
  return doc(locale, headHtml, r.body(route, locale, tt));
}

/** 404.html: one file for the whole site (the host serves it for every unknown URL), so it speaks both languages. */
export function renderNotFound(ro, en) {
  const block = (t, lang, hidden) => `      <div lang="${lang}" data-lang="${lang}"${hidden ? " hidden" : ""}>
        <h1 class="font-pixel mt-4 text-4xl font-bold text-ink">${esc(t.notFound.h1)}</h1>
        <p class="mt-3 text-dim">${esc(t.notFound.text)}</p>
        <a href="${urlPath(home(), lang)}" class="btn mt-8">${esc(t.notFound.home)}</a>
      </div>`;
  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(ro.notFound.title)}</title>
    <meta name="robots" content="noindex, follow" />
    <meta name="theme-color" content="#0c0a1d" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/src/styles.css" />
    <script type="module" src="/src/notfound.js"></script>
  </head>
  <body class="app-bg min-h-screen font-sans text-body">
    <header class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
      <a href="/ro/" class="font-pixel text-xl font-bold tracking-wide text-gold" aria-label="Molted">MOLTED</a>
    </header>
    <main class="mx-auto max-w-3xl px-5 pb-24 text-center">
${block(ro, "ro", false)}
${block(en, "en", true)}
    </main>
  </body>
</html>
`;
}

export { availableLocales };
