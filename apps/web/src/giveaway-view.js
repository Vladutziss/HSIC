// HTML for the public giveaway pages, built from the public JSON of get_giveaway()/get_giveaways().
// Pure string functions: used by the browser scripts, by the admin preview and by the tests.
import { eligibilitySummary, errorCopy, formatDateRo } from "@molted/ui/giveaway-core.js";
import { esc, paragraphs, safeUrl } from "./html.js";

const BASE = "/ro/giveaways/";

const PHASE_BADGE = {
  active: ["Activă", "bg-mint/20 text-mint"],
  scheduled: ["În curând", "bg-violet/20 text-violet-hi"],
  paused: ["În pauză", "bg-gold/15 text-gold"],
  ended: ["Încheiată", "bg-edge/60 text-dim"],
  completed: ["Încheiată", "bg-edge/60 text-dim"],
  cancelled: ["Anulată", "bg-rose/15 text-rose"],
};
const badge = (phase) => {
  const [label, cls] = PHASE_BADGE[phase] || PHASE_BADGE.ended;
  return `<span class="inline-block rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${cls}">${esc(label)}</span>`;
};

const dateLine = (c) => {
  if (c.phase === "scheduled") return `Începe pe ${esc(formatDateRo(c.starts_at, c.timezone))}`;
  if (c.phase === "active" || c.phase === "paused") return `Înscrieri până pe ${esc(formatDateRo(c.ends_at, c.timezone))}`;
  return `S-a încheiat pe ${esc(formatDateRo(c.ends_at, c.timezone))}`;
};

const image = (c) => {
  const src = safeUrl(c.prize?.image_url);
  return src
    ? `<img src="${esc(src)}" alt="${esc(c.prize?.name || c.title)}" class="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />`
    : `<div class="grid aspect-[4/3] w-full place-items-center rounded-xl bg-well text-4xl" role="img" aria-label="${esc(c.prize?.name || c.title)}">🎁</div>`;
};

// ------------------------------------------------------------ list
export function renderCard(c) {
  return `<li class="mock flex flex-col gap-4">
    ${image(c)}
    <div class="flex flex-wrap items-center gap-3">${badge(c.phase)}<span class="text-xs font-bold text-dim">${dateLine(c)}</span></div>
    <h2 class="font-pixel text-xl font-bold text-ink">${esc(c.title)}</h2>
    <p class="text-sm">${esc((c.description || "").slice(0, 160))}${(c.description || "").length > 160 ? "…" : ""}</p>
    <p class="text-xs text-dim">${esc(eligibilitySummary(c.eligibility).slice(0, 3).join(" · "))}</p>
    <a href="${BASE}${esc(c.slug)}/" class="btn btn-sm mt-auto self-start">${c.phase === "active" ? "Vezi și participă" : "Vezi detaliile"}</a>
  </li>`;
}

export function renderList(items) {
  if (!items.length) {
    return `<div class="panel text-center" role="status"><p class="font-bold text-ink">Nu există giveaway-uri acum.</p><p class="mt-2 text-sm text-dim">Revino curând: anunțăm aici fiecare campanie nouă.</p></div>`;
  }
  const open = items.filter((c) => ["active", "scheduled", "paused"].includes(c.phase));
  const done = items.filter((c) => !["active", "scheduled", "paused"].includes(c.phase));
  const group = (title, list) =>
    list.length ? `<section class="mt-10" aria-label="${esc(title)}"><h2 class="font-pixel text-2xl font-bold text-ink">${esc(title)}</h2><ul class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${list.map(renderCard).join("")}</ul></section>` : "";
  return group("Campanii deschise", open) + group("Campanii încheiate", done);
}

export const renderListError = () =>
  `<div class="panel" role="alert"><p class="font-bold text-ink">Nu am putut încărca giveaway-urile.</p><p class="mt-2 text-sm text-dim">Verifică conexiunea și încearcă din nou.</p><button type="button" class="btn btn-sm mt-4" data-action="retry">Încearcă din nou</button></div>`;

// ------------------------------------------------------------ detail
function entryPanel(c, ctx) {
  const box = (inner) => `<section class="panel mt-8" aria-labelledby="t-participa"><h2 id="t-participa" class="font-pixel text-2xl font-bold text-ink">Participă</h2>${inner}</section>`;
  const note = (text) => `<p class="mt-3">${esc(text)}</p>`;
  if (ctx.preview) return box(note("Previzualizare: așa vor vedea vizitatorii pagina. Butonul de înscriere apare doar pe pagina publică, după publicare."));
  if (c.phase === "cancelled") return box(`<p class="mt-3 font-bold text-rose">Campania a fost anulată.</p>${c.cancelled_notice ? note(c.cancelled_notice) : ""}`);
  if (c.phase === "scheduled") return box(note(`Înscrierile se deschid pe ${formatDateRo(c.starts_at, c.timezone)}.`));
  if (c.phase === "paused") return box(note("Campania este în pauză. Înscrierile sunt oprite temporar. Revino mai târziu."));
  if (c.phase === "ended" || c.phase === "completed") return box(note("Campania s-a încheiat. Nu se mai pot face înscrieri."));
  if (c.me?.entered) {
    return box(
      c.me.status === "disqualified"
        ? `<p class="mt-3 font-bold text-rose">Înscrierea ta nu a fost validată.</p>${note("Dacă crezi că e o greșeală, scrie-ne la molted.app@gmail.com.")}`
        : `<p class="mt-3 font-bold text-mint" role="status">Ești înscris. Mult succes!</p>${note("Îți confirmăm aici dacă ești înscris. Nu e nevoie să faci nimic altceva.")}`,
    );
  }
  if (!c.entries_open) return box(note(errorCopy("full")));
  if (ctx.error) {
    return box(`<p class="mt-3 font-bold text-rose" role="alert">${esc(ctx.error)}</p><button type="button" class="btn btn-sm mt-4" data-action="retry">Încearcă din nou</button>`);
  }
  if (!ctx.signedIn) {
    return box(`${note("Ca să participi ai nevoie de un cont Molted gratuit.")}
      <div id="auth-mount" class="mt-4" hidden></div>
      <button type="button" class="btn mt-4" data-action="signin">Intră în cont ca să participi</button>`);
  }
  return box(`<form class="mt-4 space-y-3" data-form="enter" novalidate>
      <label class="flex items-start gap-3 text-sm"><input type="checkbox" name="rules" class="mt-1 h-5 w-5 shrink-0" /><span>Am citit și accept <a href="#regulament" class="underline">regulamentul oficial</a> al campaniei.</span></label>
      ${c.eligibility?.requireAttestation === false ? "" : `<label class="flex items-start gap-3 text-sm"><input type="checkbox" name="attest" class="mt-1 h-5 w-5 shrink-0" /><span>Confirm că îndeplinesc condițiile de participare din regulament (de exemplu vârsta și rezidența).</span></label>`}
      <button type="submit" class="btn" ${ctx.busy ? "disabled" : ""}>${ctx.busy ? "Se trimite…" : "Înscrie-mă"}</button>
      <p class="text-sm" role="status" aria-live="polite">${ctx.message ? esc(ctx.message) : ""}</p>
    </form>`);
}

export function renderDetail(c, ctx = {}) {
  const partners = (c.partners || [])
    .map((p) => {
      const logo = safeUrl(p.logo_url);
      const site = safeUrl(p.website);
      return `<li class="flex items-start gap-3">${logo ? `<img src="${esc(logo)}" alt="Logo ${esc(p.name)}" class="h-12 w-12 rounded-lg object-contain" loading="lazy" />` : ""}<div><p class="font-bold text-ink">${site ? `<a href="${esc(site)}" rel="noopener" target="_blank" class="underline">${esc(p.name)}</a>` : esc(p.name)}</p>${p.description ? `<p class="text-sm">${esc(p.description)}</p>` : ""}</div></li>`;
    })
    .join("");
  const howTo = (Array.isArray(c.landing?.how_to) ? c.landing.how_to : []).filter((x) => typeof x === "string" && x.trim());
  const winners = (c.winners || []).filter((w) => typeof w === "string");
  return `<article>
    <header>
      <div class="flex flex-wrap items-center gap-3">${badge(c.phase)}<span class="text-sm font-bold text-dim">${dateLine(c)}</span></div>
      <h1 class="font-pixel mt-4 text-4xl font-bold leading-tight text-ink">${esc(c.title)}</h1>
    </header>
    <div class="mt-8 grid items-start gap-8 md:grid-cols-2">
      <div>${image(c)}</div>
      <div>
        <h2 class="font-pixel text-2xl font-bold text-ink">${esc(c.prize?.name || "Premiul")}</h2>
        ${c.prize?.description ? `<p class="mt-2">${esc(c.prize.description)}</p>` : ""}
        <div class="mt-4 text-sm">${paragraphs(c.description)}</div>
      </div>
    </div>
    <section class="mt-10" aria-labelledby="t-cum"><h2 id="t-cum" class="font-pixel text-2xl font-bold text-ink">Cum participi</h2>
      ${howTo.length ? `<ol class="mt-4 list-decimal space-y-2 pl-6 text-sm">${howTo.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      <p class="mt-4 text-sm font-bold text-ink">Condiții de participare</p>
      <ul class="mt-2 space-y-2 text-sm">${eligibilitySummary(c.eligibility).map((x) => `<li class="tick">${esc(x)}</li>`).join("")}</ul>
    </section>
    ${winners.length ? `<section class="mt-10" aria-labelledby="t-castigatori"><h2 id="t-castigatori" class="font-pixel text-2xl font-bold text-ink">Câștigători</h2><ul class="mt-4 space-y-1">${winners.map((w) => `<li class="font-bold text-ink">${esc(w)}</li>`).join("")}</ul></section>` : ""}
    ${entryPanel(c, ctx)}
    ${partners ? `<section class="mt-10" aria-labelledby="t-parteneri"><h2 id="t-parteneri" class="font-pixel text-2xl font-bold text-ink">Parteneri</h2><ul class="mt-4 space-y-4">${partners}</ul></section>` : ""}
    <section id="regulament" class="mt-10 scroll-mt-6" aria-labelledby="t-regulament">
      <details class="faq" open><summary id="t-regulament">Regulament oficial</summary><div class="text-sm">${paragraphs(c.terms)}</div></details>
    </section>
  </article>`;
}

export const renderNotFound = () =>
  `<div class="panel text-center" role="status"><h1 class="font-pixel text-3xl font-bold text-ink">Campania nu a fost găsită</h1><p class="mt-3 text-dim">Adresa nu există sau campania nu mai este disponibilă.</p><a href="${BASE}" class="btn mt-6">Vezi toate giveaway-urile</a></div>`;

export const renderHidden = (c) =>
  `<div class="panel text-center" role="status"><h1 class="font-pixel text-3xl font-bold text-ink">${esc(c.title || "Giveaway")}</h1><p class="mt-3">Campania este în pauză acum. Revino mai târziu.</p><a href="${BASE}" class="btn mt-6">Vezi toate giveaway-urile</a></div>`;

export const renderLoadError = () =>
  `<div class="panel" role="alert"><p class="font-bold text-ink">Nu am putut încărca campania.</p><p class="mt-2 text-sm text-dim">Verifică conexiunea și încearcă din nou. Dacă ai scanat un cod QR, linkul rămâne valabil.</p><button type="button" class="btn btn-sm mt-4" data-action="retry">Încearcă din nou</button></div>`;
