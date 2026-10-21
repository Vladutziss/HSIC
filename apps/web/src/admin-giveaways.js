// Admin dashboard for giveaway campaigns (admin/giveaways/). Sign-in is Clerk (the app's accounts); everything is
// written to Supabase, where RLS and the lifecycle trigger let it through only for site admins (0031_giveaways.sql).
// The page never decides anything about a player: it calls the admin functions and shows what they answer.
import { createClient } from "@supabase/supabase-js";
import {
  CHECKLIST,
  MEDIA,
  MEDIA_LABELS,
  PHASE_LABELS,
  SLUG_RE,
  SOURCES,
  SOURCE_LABELS,
  TRANSITIONS,
  buildCampaignUrl,
  campaignPhase,
  formatDateRo,
  isValidSlug,
  utcToZoned,
  zonedToUtc,
} from "@molted/ui/giveaway-core.js";
import { CLERK_KEY, loadClerk } from "./clerk.js";
import { renderDetail } from "./giveaway-view.js";
import { esc } from "./html.js";
import { SITE_URL } from "./i18n/routes.js";
import { SUPABASE_KEY, SUPABASE_URL, configured } from "./team-data.js";

const $ = (id) => document.getElementById(id);
const show = (id) => ["login", "refuzat", "admin"].forEach((k) => ($(k).hidden = k !== id));
const say = (t) => ($("stare").textContent = t);
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

let db = null;
const S = { campaigns: [], partners: [], links: [], sources: [], entryCounts: {}, stats: [], openId: null, draft: null, panel: {} };

// ------------------------------------------------------------ messages
const ERRORS = {
  forbidden: "Nu ai dreptul să faci asta.",
  slug_locked: "Adresa (slug) nu mai poate fi schimbată după publicare: e în codurile QR.",
  eligibility_locked: "Condițiile de eligibilitate nu se mai pot schimba după ce există înscrieri.",
  incomplete_campaign: "Completează titlul, descrierea, premiul și regulamentul înainte să publici.",
  ends_in_the_past: "Data de sfârșit e în trecut.",
  cancel_reason_required: "Scrie motivul anulării (apare public).",
  reason_required: "Scrie un motiv (cel puțin 10 caractere pentru câștigători, 5 pentru descalificări).",
  winners_complete: "Toți câștigătorii prevăzuți au fost deja aleși.",
  no_eligible_entries: "Nu există înscrieri valide din care să extragi.",
  entry_not_eligible: "Înscrierea aleasă nu e validă pentru această campanie.",
  label_required: "Scrie eticheta publică (1–40 caractere), de exemplu „Andrei P.”.",
  not_found: "Nu am găsit înregistrarea.",
};
function adminError(err) {
  const m = String(err?.message || err || "");
  if (m.startsWith("checklist_incomplete:")) {
    const item = CHECKLIST.find((c) => c.key === m.split(":")[1]);
    return `Bifează în lista de verificare: ${item ? item.label : m}`;
  }
  if (m.startsWith("invalid_transition:")) return `Trecerea de la o stare la alta nu e permisă (${m.split(":")[1]}).`;
  if (m.startsWith("draw_not_allowed:")) return `Extragerea e permisă doar după încheierea înscrierilor (stare acum: ${m.split(":")[1]}).`;
  if (/duplicate key|already exists/i.test(m)) return "Există deja o înregistrare cu aceleași date (de exemplu aceeași adresă).";
  return ERRORS[m] || `Ceva n-a mers: ${m}`;
}
function flash(text, ok = false) {
  const el = $("flash");
  el.textContent = text;
  el.className = `mt-3 rounded-xl px-4 py-3 text-sm font-bold ${ok ? "bg-mint/20 text-mint" : "bg-rose/15 text-rose"}`;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}
const guard = async (fn) => {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    flash(adminError(err));
  }
};
const check = ({ error, data }) => {
  if (error) throw error;
  return data;
};

// ------------------------------------------------------------ boot (Clerk, like admin.js)
async function boot() {
  if (!configured || !CLERK_KEY) {
    say("Lipsesc cheile Supabase sau Clerk (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_CLERK_PUBLISHABLE_KEY).");
    return;
  }
  const clerk = await loadClerk();
  $("iesire").addEventListener("click", () => clerk.signOut({ redirectUrl: location.pathname }));
  let started = false;
  const onUser = () => {
    if (clerk.user && !started) {
      started = true;
      $("iesire").hidden = false;
      start(clerk).catch((e) => say(`Ceva n-a mers: ${e.message || e}`));
    }
  };
  if (!clerk.user) {
    say("Intră în cont cu contul tău de Molted.");
    show("login");
    clerk.mountSignIn($("login"), { routing: "hash", fallbackRedirectUrl: location.pathname, appearance: { elements: { footerAction: { display: "none" } } } });
    clerk.addListener(onUser);
  } else onUser();
}

async function start(clerk) {
  db = createClient(SUPABASE_URL, SUPABASE_KEY, { accessToken: async () => (await clerk.session?.getToken()) ?? null });
  const { data: isAdmin, error } = await db.rpc("is_site_admin");
  if (error) throw error;
  if (!isAdmin) {
    $("refuzat-email").textContent = clerk.user.primaryEmailAddress?.emailAddress || "";
    say("");
    show("refuzat");
    return;
  }
  await reload();
  say("Ce salvezi aici ajunge în Supabase. Nimic nu se publică până nu apeși „Publică” sau „Programează”.");
  show("admin");
}

// ------------------------------------------------------------ data
async function reload() {
  const [c, p, l, s, e, st] = await Promise.all([
    db.from("giveaway_campaigns").select("*").order("created_at", { ascending: false }),
    db.from("giveaway_partners").select("*").order("name"),
    db.from("giveaway_campaign_partners").select("*"),
    db.from("giveaway_sources").select("*").order("created_at"),
    db.from("giveaway_entries").select("campaign_id,status"),
    db.rpc("giveaway_stats", { p_campaign: null }),
  ]);
  S.campaigns = check(c);
  S.partners = check(p);
  S.links = check(l);
  S.sources = check(s);
  S.entryCounts = {};
  for (const r of check(e)) {
    S.entryCounts[r.campaign_id] ||= { valid: 0, disqualified: 0 };
    S.entryCounts[r.campaign_id][r.status] += 1;
  }
  S.stats = check(st) || [];
  renderOverview();
  renderCampaigns();
  renderPartners();
  if (S.openId) await openCampaign(S.openId, true);
}

// ------------------------------------------------------------ overview
function renderOverview() {
  const now = Date.now();
  const phases = S.campaigns.map((c) => campaignPhase(c, now));
  const count = (...p) => phases.filter((x) => p.includes(x)).length;
  const entries = Object.values(S.entryCounts).reduce((a, x) => a + x.valid, 0);
  const tile = (label, n) => `<div class="mock"><p class="text-xs font-bold uppercase tracking-wider text-dim">${esc(label)}</p><p class="font-pixel text-3xl text-ink">${n}</p></div>`;
  const rows = S.stats
    .map(
      (r) => `<tr class="border-t border-edge"><td class="py-2 pr-3 font-bold text-ink">${esc(r.campaign_name)}</td><td class="pr-3">${esc(SOURCE_LABELS[r.source] || r.source)}</td>
      <td class="pr-3 text-right">${r.visits}</td><td class="pr-3 text-right">${r.claimed}</td><td class="pr-3 text-right">${r.registered}</td><td class="pr-3 text-right">${r.activated}</td><td class="pr-3 text-right">${r.returning_users}</td><td class="text-right">${r.entries}</td></tr>`,
    )
    .join("");
  $("sumar").innerHTML = `<div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
      ${tile("Campanii", S.campaigns.length)}${tile("Ciorne", count("draft"))}${tile("Programate", count("scheduled"))}${tile("Active", count("active"))}${tile("Pauză", count("paused"))}${tile("Încheiate", count("ended", "completed"))}${tile("Înscrieri valide", entries)}
    </div>
    <h3 class="font-pixel mt-8 text-xl font-bold text-ink">Pâlnia pe surse</h3>
    ${
      rows
        ? `<div class="mt-3 overflow-x-auto"><table class="w-full min-w-[40rem] text-left text-sm"><thead class="text-xs uppercase tracking-wider text-dim"><tr><th class="pb-2">Campanie</th><th>Sursă</th><th class="text-right">Vizite</th><th class="text-right">Conturi atribuite</th><th class="text-right">Înregistrări noi</th><th class="text-right">Activate</th><th class="text-right">Revenite</th><th class="text-right">Înscrieri</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="mt-3 text-sm text-dim">Nu există încă date măsurate. Apar după primele vizite prin linkurile de campanie.</p>`
    }
    <details class="faq mt-4"><summary>Cum se numără</summary><div class="text-sm">
      <p><b>Vizite:</b> vizualizări ale paginii cu sursa respectivă, câte una pe sesiune de browser. Nu sunt vizitatori unici (nu stocăm niciun identificator).</p>
      <p class="mt-2"><b>Conturi atribuite:</b> conturi care s-au autentificat după o vizită cu sursa respectivă, în cel mult 7 zile (prima sursă contează).</p>
      <p class="mt-2"><b>Înregistrări noi:</b> dintre acestea, cele al căror profil a fost creat după vizită. <b>Activate:</b> au bifat cel puțin un obicei de la vizită încoace. <b>Revenite:</b> au bifat în cel puțin două zile diferite.</p>
      <p class="mt-2">Aceste cifre arată un parcurs, nu o cauză: nu dovedesc că giveaway-ul a schimbat retenția.</p></div></details>`;
}

// ------------------------------------------------------------ campaign list
function renderCampaigns() {
  const now = Date.now();
  $("campanii").innerHTML = S.campaigns.length
    ? S.campaigns
        .map((c) => {
          const ph = campaignPhase(c, now);
          const n = S.entryCounts[c.id]?.valid || 0;
          return `<li class="panel flex flex-wrap items-center justify-between gap-3"><div><p class="font-bold text-ink">${esc(c.internal_name)} <span class="text-xs font-bold text-dim">/ro/giveaways/${esc(c.slug)}/</span></p>
            <p class="text-sm">${esc(PHASE_LABELS[ph] || ph)} · ${n} înscrieri valide · ${esc(formatDateRo(c.starts_at, c.timezone))} → ${esc(formatDateRo(c.ends_at, c.timezone))}</p></div>
            <button type="button" class="btn btn-sm btn-ghost" data-action="open" data-id="${c.id}">Deschide</button></li>`;
        })
        .join("")
    : `<li class="text-sm text-dim">Nu există campanii. Creează prima cu „Campanie nouă”.</li>`;
}

// ------------------------------------------------------------ campaign editor
const blank = () => {
  const start = new Date(Date.now() + 86400000);
  const end = new Date(Date.now() + 8 * 86400000);
  return {
    id: null, slug: "", internal_name: "", title: "", description: "", prize_name: "", prize_description: "", prize_image_url: "",
    timezone: "Europe/Bucharest", starts_at: start.toISOString(), ends_at: end.toISOString(), status: "draft", paused_visibility: "visible",
    eligibility: { requireOnboarded: true, minCheckins: 0, requireAttestation: true }, terms: "", landing: {}, max_entries: null, winner_count: 1,
    checklist: {}, internal_notes: "", published_at: null, cancelled_reason: null,
  };
};

async function openCampaign(id, keep = false) {
  S.openId = id;
  const c = id === "new" ? blank() : S.campaigns.find((x) => x.id === id);
  if (!c) return;
  S.draft = c;
  if (!keep) S.panel = {};
  if (id !== "new") {
    const [entries, winners, audit] = await Promise.all([
      db.from("giveaway_entries").select("*").eq("campaign_id", id).order("created_at"),
      db.from("giveaway_winners").select("*, giveaway_entries(user_id)").eq("campaign_id", id).order("selected_at"),
      db.from("giveaway_audit").select("*").eq("campaign_id", id).order("at", { ascending: false }).limit(50),
    ]);
    S.panel = { entries: check(entries), winners: check(winners), audit: check(audit) };
  }
  renderEditor();
  $("campanie").scrollIntoView({ behavior: "smooth", block: "start" });
}

const field = (label, input, hint = "") => `<label class="block"><span class="text-sm font-bold text-ink">${esc(label)}</span>${input}${hint ? `<span class="mt-1 block text-xs text-dim">${esc(hint)}</span>` : ""}</label>`;
const inputCls = "mt-1 w-full rounded-xl bg-well px-3 py-2 text-ink ring-1 ring-edge";
const text = (name, v, extra = "") => `<input name="${name}" value="${esc(v ?? "")}" class="${inputCls}" ${extra} />`;
const area = (name, v, rows = 4) => `<textarea name="${name}" rows="${rows}" class="${inputCls}">${esc(v ?? "")}</textarea>`;

function renderEditor() {
  const c = S.draft;
  const isNew = !c.id;
  const phase = campaignPhase(c);
  const locked = Boolean(c.published_at);
  const hasEntries = (S.entryCounts[c.id]?.valid || 0) + (S.entryCounts[c.id]?.disqualified || 0) > 0;
  const tz = c.timezone;
  const linked = new Set(S.links.filter((l) => l.campaign_id === c.id).map((l) => l.partner_id));
  const e = c.eligibility || {};
  $("campanie").hidden = false;
  $("campanie").innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 id="t-campanie" class="font-pixel text-2xl font-bold text-ink">${isNew ? "Campanie nouă" : esc(c.internal_name)}</h2>
      <button type="button" class="btn btn-sm btn-ghost" data-action="close">Închide</button></div>
    <p class="mt-1 text-sm">Stare: <b class="text-ink">${esc(PHASE_LABELS[phase] || phase)}</b>${c.published_at ? ` · publicată ${esc(formatDateRo(c.published_at, tz))}` : ""}</p>
    <form id="form-campanie" class="mt-6 grid gap-5 md:grid-cols-2" novalidate>
      ${field("Adresă (slug)", text("slug", c.slug, `${locked ? "disabled" : ""} maxlength="60" placeholder="molt-3d"`), locked ? "Blocată după publicare (e în codurile QR)." : "Litere mici, cifre și cratime. Apare în URL: /ro/giveaways/<slug>/")}
      ${field("Nume intern", text("internal_name", c.internal_name, 'maxlength="120"'), "Doar pentru voi, nu e public.")}
      ${field("Titlu public (română)", text("title", c.title, 'maxlength="120"'))}
      ${field("Premiu: nume", text("prize_name", c.prize_name, 'maxlength="120"'))}
      <div class="md:col-span-2">${field("Descriere publică", area("description", c.description, 4))}</div>
      <div class="md:col-span-2">${field("Premiu: descriere", area("prize_description", c.prize_description, 2))}</div>
      ${field("Premiu: imagine (URL https)", text("prize_image_url", c.prize_image_url, 'placeholder="https://…"'), "Folosește doar o fotografie reală a premiului. Poți încărca una mai jos.")}
      <div class="flex items-end"><label class="btn btn-sm btn-ghost file-btn cursor-pointer">Încarcă imagine<input id="upload-premiu" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" /></label></div>
      ${field("Fus orar al campaniei", text("timezone", tz, 'maxlength="60"'), "Datele de mai jos sunt interpretate în acest fus orar (IANA).")}
      <div></div>
      ${field("Începe", `<input type="datetime-local" name="starts_at" value="${esc(utcToZoned(c.starts_at, tz))}" class="${inputCls}" />`)}
      ${field("Se încheie", `<input type="datetime-local" name="ends_at" value="${esc(utcToZoned(c.ends_at, tz))}" class="${inputCls}" />`)}
      ${field("Număr maxim de înscrieri", `<input type="number" min="1" name="max_entries" value="${c.max_entries ?? ""}" class="${inputCls}" />`, "Gol = fără limită.")}
      ${field("Număr de câștigători", `<input type="number" min="1" max="50" name="winner_count" value="${c.winner_count}" class="${inputCls}" />`)}
      ${field("Când e în pauză", `<select name="paused_visibility" class="${inputCls}"><option value="visible" ${c.paused_visibility === "visible" ? "selected" : ""}>Vizibilă, cu înscrierile oprite</option><option value="hidden" ${c.paused_visibility === "hidden" ? "selected" : ""}>Ascunsă din listă (linkul arată doar „în pauză”)</option></select>`)}
      <div></div>
      <fieldset class="md:col-span-2 rounded-xl p-4 ring-1 ring-edge"><legend class="px-2 text-sm font-bold text-ink">Eligibilitate (doar condiții acceptate de sistem)</legend>
        ${hasEntries ? `<p class="mb-2 text-xs text-gold">Există înscrieri: condițiile nu se mai pot schimba.</p>` : ""}
        <label class="flex items-center gap-3 text-sm"><input type="checkbox" name="requireOnboarded" ${e.requireOnboarded ? "checked" : ""} class="h-5 w-5" /> Configurarea contului terminată (drum ales și primul obicei)</label>
        <label class="mt-2 flex items-center gap-3 text-sm"><input type="number" min="0" max="100" name="minCheckins" value="${e.minCheckins ?? 0}" class="w-20 rounded-xl bg-well px-3 py-1 text-ink ring-1 ring-edge" /> bife minime de obiceiuri în aplicație (0 = fără cerință)</label>
        <label class="mt-2 flex items-center gap-3 text-sm"><input type="checkbox" name="requireAttestation" ${e.requireAttestation !== false ? "checked" : ""} class="h-5 w-5" /> Jucătorul confirmă că îndeplinește condițiile din regulament (vârstă, rezidență)</label>
        <p class="mt-3 text-xs text-dim">Vârsta și zona geografică se stabilesc în regulamentul oficial; sistemul nu le verifică, doar înregistrează confirmarea jucătorului. Nu cere date personale în plus.</p>
      </fieldset>
      <div class="md:col-span-2">${field("Regulament oficial", area("terms", c.terms, 10), "Scris și verificat de organizator. Nu e un text juridic generat de sistem.")}</div>
      <div class="md:col-span-2">${field("Pași „Cum participi” (unul pe linie, opțional)", area("how_to", (c.landing?.how_to || []).join("\n"), 3))}</div>
      <div class="md:col-span-2">${field("Note interne", area("internal_notes", c.internal_notes, 2), "Nu apar public.")}</div>
      <fieldset class="md:col-span-2 rounded-xl p-4 ring-1 ring-edge"><legend class="px-2 text-sm font-bold text-ink">Parteneri (doar parteneri activi)</legend>
        ${S.partners.filter((p) => p.active || linked.has(p.id)).map((p) => `<label class="flex items-center gap-3 text-sm"><input type="checkbox" name="partner" value="${p.id}" ${linked.has(p.id) ? "checked" : ""} class="h-5 w-5" /> ${esc(p.name)}${p.active ? "" : " (inactiv)"}</label>`).join("") || `<p class="text-sm text-dim">Nu există parteneri. Adaugă-i în secțiunea de mai jos.</p>`}
      </fieldset>
      <fieldset class="md:col-span-2 rounded-xl p-4 ring-1 ring-gold/50"><legend class="px-2 text-sm font-bold text-gold">Verificare înainte de publicare</legend>
        <p class="text-sm">Molted nu garantează conformitatea legală a unei campanii. Organizatorul răspunde să verifice regulamentul, eligibilitatea, condițiile premiului, prelucrarea datelor și cerințele legii române și europene înainte să publice. Pentru minori, nu colecta date suplimentare și verifică acordul părinților sau al tutorilor.</p>
        ${CHECKLIST.map((k) => `<label class="mt-2 flex items-start gap-3 text-sm"><input type="checkbox" name="chk_${k.key}" ${c.checklist?.[k.key] ? "checked" : ""} class="mt-1 h-5 w-5 shrink-0" /> <span>${esc(k.label)}</span></label>`).join("")}
      </fieldset>
      <div class="md:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-sm">${isNew ? "Creează ciorna" : "Salvează modificările"}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="preview">Previzualizează pagina publică</button>
        ${isNew ? "" : lifecycleButtons(c, phase)}
      </div>
    </form>
    <div id="previzualizare" class="mt-8" hidden></div>
    ${isNew ? "" : sourcesPanel(c) + entriesPanel(c) + winnersPanel(c, phase) + auditPanel()}`;
}

function lifecycleButtons(c, phase) {
  const next = TRANSITIONS[c.status] || [];
  const btn = (to, label, cls = "btn-ghost") => (next.includes(to) ? `<button type="button" class="btn btn-sm ${cls}" data-action="status" data-to="${to}">${label}</button>` : "");
  const future = Date.parse(c.starts_at) > Date.now();
  return [
    c.status === "draft" ? (future ? btn("scheduled", "Programează", "") : btn("active", "Publică acum", "")) : "",
    c.status === "draft" ? btn("active", future ? "Publică acum (înainte de dată)" : "") : "",
    c.status === "paused" ? btn("active", "Reia") : btn("paused", "Pune pe pauză"),
    btn("completed", "Încheie campania"),
    btn("cancelled", "Anulează"),
    // only a draft can be removed (RLS: delete allowed while status is draft); a published campaign is cancelled instead
    c.status === "draft" && !c.published_at ? `<button type="button" class="btn btn-sm btn-ghost" data-action="delete-draft">Șterge ciorna</button>` : "",
  ].join("");
}

// ------------------------------------------------------------ form -> row
function readForm() {
  const f = $("form-campanie");
  const v = (n) => f.elements[n]?.value ?? "";
  const c = S.draft;
  const tz = v("timezone").trim() || "Europe/Bucharest";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw new Error("Fusul orar nu e valid (exemplu: Europe/Bucharest).");
  }
  if (!v("starts_at") || !v("ends_at")) throw new Error("Completează data de început și de sfârșit.");
  const slug = c.published_at ? c.slug : v("slug").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new Error("Adresa (slug) trebuie să aibă 3–60 de caractere: litere mici, cifre și cratime.");
  const image = v("prize_image_url").trim();
  if (image && !/^https:\/\//.test(image)) throw new Error("Imaginea trebuie să fie un URL https.");
  const checklist = {};
  for (const k of CHECKLIST) checklist[k.key] = f.elements[`chk_${k.key}`].checked;
  const max = v("max_entries").trim();
  const row = {
    slug,
    internal_name: v("internal_name").trim(),
    title: v("title").trim(),
    description: v("description").trim(),
    prize_name: v("prize_name").trim(),
    prize_description: v("prize_description").trim(),
    prize_image_url: image || null,
    timezone: tz,
    starts_at: zonedToUtc(v("starts_at"), tz),
    ends_at: zonedToUtc(v("ends_at"), tz),
    paused_visibility: v("paused_visibility"),
    max_entries: max ? Number(max) : null,
    winner_count: Number(v("winner_count")) || 1,
    eligibility: { requireOnboarded: f.elements.requireOnboarded.checked, minCheckins: Math.max(0, Math.min(100, Number(v("minCheckins")) || 0)), requireAttestation: f.elements.requireAttestation.checked },
    terms: v("terms").trim(),
    landing: { ...(c.landing || {}), how_to: v("how_to").split("\n").map((x) => x.trim()).filter(Boolean) },
    checklist,
    internal_notes: v("internal_notes").trim(),
  };
  if (!row.internal_name) throw new Error("Completează numele intern.");
  if (Date.parse(row.ends_at) <= Date.parse(row.starts_at)) throw new Error("Data de sfârșit trebuie să fie după cea de început.");
  const partners = [...f.querySelectorAll("input[name=partner]:checked")].map((x) => x.value);
  return { row, partners };
}

async function saveCampaign() {
  const { row, partners } = readForm();
  let id = S.draft.id;
  if (!id) {
    id = check(await db.from("giveaway_campaigns").insert(row).select("id").single()).id;
  } else {
    check(await db.from("giveaway_campaigns").update(row).eq("id", id));
  }
  const now = new Set(S.links.filter((l) => l.campaign_id === id).map((l) => l.partner_id));
  for (const p of partners) if (!now.has(p)) check(await db.from("giveaway_campaign_partners").insert({ campaign_id: id, partner_id: p }));
  for (const p of now) if (!partners.includes(p)) check(await db.from("giveaway_campaign_partners").delete().eq("campaign_id", id).eq("partner_id", p));
  S.openId = id;
  await reload();
  flash("Salvat.", true);
}

async function changeStatus(to) {
  const c = S.draft;
  const label = { scheduled: "Programezi campania? Devine publică (cu înscrierile oprite până la dată).", active: "Publici campania acum? Devine vizibilă public și se pot face înscrieri.", paused: "Pui campania pe pauză? Înscrierile se opresc imediat.", completed: "Închei campania? Înscrierile se opresc definitiv și poți extrage câștigătorul.", cancelled: "Anulezi campania? E ireversibil și se afișează public motivul." }[to];
  if (!confirm(label)) return;
  const patch = { status: to };
  if (to === "cancelled") {
    const reason = prompt("Motivul anulării (se afișează public, maxim 500 de caractere):", "");
    if (reason === null) return;
    patch.cancelled_reason = reason.trim();
  }
  if (to === "scheduled" || to === "active") {
    // a publish also saves the form first so what is reviewed is what goes live
    const { row } = readForm();
    check(await db.from("giveaway_campaigns").update(row).eq("id", c.id));
  }
  check(await db.from("giveaway_campaigns").update(patch).eq("id", c.id));
  await reload();
  flash("Starea a fost schimbată.", true);
}

// ------------------------------------------------------------ preview of the public page
function preview() {
  const { row } = readForm();
  const partners = [...$("form-campanie").querySelectorAll("input[name=partner]:checked")]
    .map((x) => S.partners.find((p) => p.id === x.value))
    .filter(Boolean)
    .map((p) => ({ name: p.name, description: p.description, logo_url: p.logo_url, website: p.website }));
  const asPublic = {
    found: true, slug: row.slug, title: row.title, description: row.description,
    prize: { name: row.prize_name, description: row.prize_description, image_url: row.prize_image_url },
    starts_at: row.starts_at, ends_at: row.ends_at, timezone: row.timezone,
    phase: campaignPhase({ ...row, status: S.draft.status === "draft" ? "active" : S.draft.status }),
    entries_open: true, eligibility: row.eligibility, terms: row.terms, landing: row.landing, partners, winners: [], me: null,
  };
  const box = $("previzualizare");
  box.hidden = false;
  box.innerHTML = `<p class="mb-3 text-xs font-bold uppercase tracking-wider text-dim">Previzualizare (nesalvată)</p><div class="rounded-2xl p-5 ring-1 ring-edge">${renderDetail(asPublic, { preview: true })}</div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------------------------------------------------------------ sources and QR destinations
function sourcesPanel(c) {
  const rows = S.sources.filter((s) => s.campaign_id === c.id);
  const list = rows
    .map((s) => {
      const url = buildCampaignUrl(SITE_URL, c.slug, s.source, s.medium);
      const partner = S.partners.find((p) => p.id === s.partner_id);
      return `<li class="panel"><p class="font-bold text-ink">${esc(SOURCE_LABELS[s.source])} · ${esc(MEDIA_LABELS[s.medium])}${s.label ? ` · ${esc(s.label)}` : ""}${partner ? ` · ${esc(partner.name)}` : ""}</p>
        <p class="mt-1 break-all text-xs text-dim">${esc(url)}</p>
        <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-ghost" data-action="copy" data-url="${esc(url)}">Copiază linkul</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="verify" data-url="${esc(url)}">Verifică destinația</button>
        <a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Deschide</a>
        <button type="button" class="btn btn-sm btn-ghost" data-action="del-source" data-id="${s.id}">Șterge</button></div>
        <p class="mt-2 text-xs text-dim" data-verify="${esc(url)}"></p></li>`;
    })
    .join("");
  return `<section class="mt-12" aria-labelledby="t-surse"><h3 id="t-surse" class="font-pixel text-xl font-bold text-ink">Surse și destinații QR</h3>
    <p class="mt-2 text-sm">Fiecare sursă are un link stabil: doar adresa campaniei și sursa, fără date personale. Imaginea codului QR nu se generează aici (nu există o bibliotecă QR în proiect): creează codul dintr-un generator de încredere din link, apoi <b>scanează codul tipărit de probă</b> înainte de tipar și apasă „Verifică destinația”. Linkul rămâne valabil și după pauză sau încheiere: pagina arată starea campaniei.</p>
    <ul class="mt-4 grid gap-3">${list || `<li class="text-sm text-dim">Nu există surse. Adaugă una mai jos.</li>`}</ul>
    <form id="form-sursa" class="mt-4 grid gap-3 sm:grid-cols-5" novalidate>
      <select name="source" class="${inputCls}">${SOURCES.map((s) => `<option value="${s}">${esc(SOURCE_LABELS[s])}</option>`).join("")}</select>
      <select name="medium" class="${inputCls}">${MEDIA.map((m) => `<option value="${m}">${esc(MEDIA_LABELS[m])}</option>`).join("")}</select>
      <input name="label" maxlength="80" placeholder="Etichetă (ex. poster teren)" class="${inputCls}" />
      <select name="partner" class="${inputCls}"><option value="">Fără partener</option>${S.partners.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
      <button type="submit" class="btn btn-sm">Adaugă sursa</button>
    </form></section>`;
}

async function verifyDestination(url, line) {
  line.textContent = "Se verifică…";
  try {
    const u = new URL(url);
    await fetch(url, { mode: "no-cors", cache: "no-store" }); // reachable (the response itself is opaque across origins)
    const slug = u.pathname.match(/\/ro\/giveaways\/([^/]+)\//)?.[1];
    const { data, error } = await createClient(SUPABASE_URL, SUPABASE_KEY).rpc("get_giveaway", { p_slug: slug });
    if (error) throw error;
    if (!data?.found) line.textContent = "Pagina răspunde, dar campania NU e publică încă (ciornă sau inexistentă): un cod tipărit acum ar duce la „campanie negăsită”. Nu tipări încă.";
    else line.textContent = `Pagina răspunde și campania e publică (stare acum: ${PHASE_LABELS[data.phase] || data.phase}). Scanează totuși un cod tipărit de probă înainte de tipar.`;
  } catch {
    line.textContent = "Nu am putut verifica acum (rețea sau configurare). Încearcă din nou și deschide linkul manual.";
  }
}

// ------------------------------------------------------------ entries
function entriesPanel(c) {
  const rows = S.panel.entries || [];
  const body = rows
    .map(
      (e) => `<tr class="border-t border-edge"><td class="py-2 pr-3 font-mono text-xs">${esc(e.user_id)}</td><td class="pr-3">${esc(formatDateRo(e.created_at, c.timezone))}</td><td class="pr-3">${esc(e.source ? `${SOURCE_LABELS[e.source]} / ${MEDIA_LABELS[e.medium] || e.medium}` : "—")}</td>
      <td class="pr-3">${e.status === "valid" ? "Validă" : `Descalificată${e.disqualified_reason ? ` (${esc(e.disqualified_reason)})` : ""}`}</td>
      <td class="text-right">${e.status === "valid" ? `<button type="button" class="btn btn-xs btn-ghost" data-action="disqualify" data-id="${e.id}">Descalifică</button>` : ""}</td></tr>`,
    )
    .join("");
  return `<section class="mt-12" aria-labelledby="t-inscrieri"><div class="flex flex-wrap items-center justify-between gap-3"><h3 id="t-inscrieri" class="font-pixel text-xl font-bold text-ink">Înscrieri (${rows.filter((e) => e.status === "valid").length} valide)</h3>
    ${rows.length ? `<button type="button" class="btn btn-sm btn-ghost" data-action="export">Exportă CSV</button>` : ""}</div>
    <p class="mt-2 text-sm text-dim">Datele sunt minime: identificatorul contului, data, sursa și starea. Pentru a contacta un câștigător, caută identificatorul în Clerk. Nu partaja această listă cu partenerii.</p>
    ${rows.length ? `<div class="mt-3 overflow-x-auto"><table class="w-full min-w-[36rem] text-left text-sm"><thead class="text-xs uppercase tracking-wider text-dim"><tr><th class="pb-2">Cont</th><th>Data</th><th>Sursă</th><th>Stare</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="mt-3 text-sm text-dim">Nu există înscrieri.</p>`}</section>`;
}

function exportCsv() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["user_id", "created_at", "status", "source", "medium"].join(",")].concat(
    (S.panel.entries || []).map((e) => [e.user_id, e.created_at, e.status, e.source, e.medium].map(q).join(",")),
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = `${S.draft.slug}-inscrieri.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------ winners
function winnersPanel(c, phase) {
  const closed = phase === "ended" || phase === "completed";
  const winners = S.panel.winners || [];
  const valid = (S.panel.entries || []).filter((e) => e.status === "valid" && !winners.some((w) => w.entry_id === e.id));
  const sel = (name, value, opts) => `<select name="${name}" class="mt-1 rounded-xl bg-well px-3 py-1 text-ink ring-1 ring-edge">${opts.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const cards = winners
    .map((w) => {
      const voided = w.status === "voided";
      return `<li class="panel" data-winner="${w.id}"><p class="font-bold text-ink">${esc(w.giveaway_entries?.user_id || "(cont șters)")} <span class="text-xs font-bold text-dim">${w.selection_method === "random_draw" ? "extragere aleatorie pe server" : "alegere manuală"} · ${esc(formatDateRo(w.selected_at, c.timezone))}</span></p>
        <p class="mt-1 text-xs text-dim">Audit: ${esc(JSON.stringify(w.audit))}</p>
        ${voided ? `<p class="mt-2 text-sm text-rose">Anulat: ${esc(w.void_reason || "")}</p>` : `
        <div class="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label>Notificare ${sel("wstatus", w.status, [["selected", "Aleasă"], ["notified", "Notificată"], ["confirmed", "Confirmată"], ["declined", "A refuzat"]])}</label>
          <label>Premiu ${sel("wfulfill", w.fulfillment_status, [["pending", "De predat"], ["arranged", "Organizat"], ["delivered", "Predat"], ["failed", "Eșuat"]])}</label>
          <label class="min-w-[12rem] flex-1">Note interne (nu sunt publice)<input name="wnotes" value="${esc(w.admin_notes)}" maxlength="1000" class="${inputCls}" /></label>
        </div>
        <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn btn-sm" data-action="save-winner" data-id="${w.id}">Salvează</button>
          <button type="button" class="btn btn-sm btn-ghost" data-action="announce" data-id="${w.id}">${w.announced_at ? `Anunțat: ${esc(w.public_label)} (schimbă)` : "Anunță public"}</button>
          <button type="button" class="btn btn-sm btn-ghost" data-action="void-winner" data-id="${w.id}">Anulează câștigătorul</button></div>`}</li>`;
    })
    .join("");
  return `<section class="mt-12" aria-labelledby="t-castigatori"><h3 id="t-castigatori" class="font-pixel text-xl font-bold text-ink">Câștigători</h3>
    <p class="mt-2 text-sm">Extragerea se face pe server, doar după încheierea înscrierilor, cu un generator aleatoriu: nimic din browser nu o influențează. Fiecare pas intră în jurnalul de audit. Un câștigător devine public doar când apeși „Anunță public” și scrii eticheta afișată.</p>
    ${closed ? `<div class="mt-4 flex flex-wrap items-end gap-3"><button type="button" class="btn btn-sm" data-action="draw">Extrage un câștigător</button>
      <form id="form-manual" class="flex flex-wrap items-end gap-2"><select name="entry" class="${inputCls} w-auto">${valid.map((e) => `<option value="${e.id}">${esc(e.user_id)}</option>`).join("")}</select><input name="reason" placeholder="Motiv (min. 10 caractere)" class="${inputCls} w-auto" /><button type="submit" class="btn btn-sm btn-ghost" ${valid.length ? "" : "disabled"}>Alege manual</button></form></div>`
      : `<p class="mt-3 text-sm text-gold">Extragerea e posibilă după ce campania s-a încheiat (data de sfârșit trecută sau stare „Finalizată”).</p>`}
    <ul class="mt-4 grid gap-3">${cards || `<li class="text-sm text-dim">Nu există câștigători aleși.</li>`}</ul></section>`;
}

function auditPanel() {
  const rows = S.panel.audit || [];
  return `<section class="mt-12" aria-labelledby="t-audit"><h3 id="t-audit" class="font-pixel text-xl font-bold text-ink">Jurnal de audit</h3>
    <ul class="mt-3 space-y-1 text-xs">${rows.map((a) => `<li><span class="text-dim">${esc(formatDateRo(a.at))}</span> · <b class="text-ink">${esc(a.action)}</b> · ${esc(a.actor || "sistem")} · ${esc(JSON.stringify(a.details))}</li>`).join("") || `<li class="text-dim">Gol.</li>`}</ul></section>`;
}

// ------------------------------------------------------------ partners
function renderPartners() {
  const rows = S.newPartner ? [{ id: "new", name: "", slug: "", description: "", logo_url: "", website: "", active: true }, ...S.partners] : S.partners;
  $("parteneri").innerHTML = rows.length
    ? rows
        .map(
          (p) => `<li class="panel"><form data-partner="${p.id}" class="grid gap-3 sm:grid-cols-2" novalidate>
            ${field("Nume", text("name", p.name, 'maxlength="80"'))}${field("Adresă scurtă (slug)", text("slug", p.slug, 'maxlength="40"'))}
            <div class="sm:col-span-2">${field("Descriere aprobată", area("description", p.description, 2))}</div>
            ${field("Logo (URL https)", text("logo_url", p.logo_url))}${field("Site (URL https)", text("website", p.website))}
            <label class="flex items-center gap-3 text-sm"><input type="checkbox" name="active" ${p.active ? "checked" : ""} class="h-5 w-5" /> Activ</label>
            <div class="flex gap-2 sm:justify-end"><button type="submit" class="btn btn-sm">Salvează</button></div></form></li>`,
        )
        .join("")
    : `<li class="text-sm text-dim">Nu există parteneri.</li>`;
}

async function savePartner(form) {
  const v = (n) => form.elements[n].value.trim();
  const row = { name: v("name"), slug: v("slug").toLowerCase(), description: v("description"), logo_url: v("logo_url") || null, website: v("website") || null, active: form.elements.active.checked };
  if (!row.name || !SLUG_RE.test(row.slug) || row.slug.length > 40) throw new Error("Completează numele și o adresă scurtă (litere mici, cifre, cratime, maxim 40).");
  for (const u of [row.logo_url, row.website]) if (u && !/^https:\/\//.test(u)) throw new Error("Logo-ul și site-ul trebuie să fie URL-uri https.");
  const id = form.dataset.partner;
  if (id === "new") check(await db.from("giveaway_partners").insert(row));
  else check(await db.from("giveaway_partners").update(row).eq("id", id));
  S.newPartner = false;
  await reload();
  flash("Partener salvat.", true);
}

// ------------------------------------------------------------ uploads
async function uploadPrize(file) {
  if (!TYPES[file.type]) throw new Error("Doar JPG, PNG sau WebP.");
  if (file.size > MAX_BYTES) throw new Error("Imaginea are peste 5 MB.");
  const path = `prizes/${crypto.randomUUID()}.${TYPES[file.type]}`;
  check(await db.storage.from("giveaways").upload(path, file, { contentType: file.type, cacheControl: "31536000" }));
  $("form-campanie").elements.prize_image_url.value = `${SUPABASE_URL}/storage/v1/object/public/giveaways/${path}`;
  flash("Imaginea a fost încărcată. Salvează campania ca să o păstrezi.", true);
}

// ------------------------------------------------------------ events
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el || !db) return;
  const id = el.dataset.id;
  const act = el.dataset.action;
  guard(async () => {
    if (act === "new-campaign") return openCampaign("new");
    if (act === "open") return openCampaign(id);
    if (act === "close") {
      S.openId = null;
      $("campanie").hidden = true;
      return;
    }
    if (act === "new-partner") {
      S.newPartner = true;
      return renderPartners();
    }
    if (act === "preview") return preview();
    if (act === "delete-draft") {
      if (!confirm("Ștergi definitiv această ciornă (cu sursele ei)? Nu se poate anula.")) return;
      check(await db.from("giveaway_campaigns").delete().eq("id", S.draft.id).eq("status", "draft"));
      S.openId = null;
      $("campanie").hidden = true;
      await reload();
      return flash("Ciorna a fost ștearsă.", true);
    }
    if (act === "status") return changeStatus(el.dataset.to);
    if (act === "copy") {
      await navigator.clipboard.writeText(el.dataset.url);
      return flash("Linkul a fost copiat.", true);
    }
    if (act === "verify") return verifyDestination(el.dataset.url, document.querySelector(`[data-verify="${CSS.escape(el.dataset.url)}"]`));
    if (act === "del-source") {
      if (!confirm("Ștergi sursa? Linkul ei continuă să funcționeze, dar nu mai e urmărit separat aici.")) return;
      check(await db.from("giveaway_sources").delete().eq("id", id));
      return reload();
    }
    if (act === "disqualify") {
      const reason = prompt("Motivul descalificării (min. 5 caractere):", "");
      if (reason === null) return;
      check(await db.rpc("disqualify_giveaway_entry", { p_entry: id, p_reason: reason }));
      await reload();
      return flash("Înscrierea a fost descalificată.", true);
    }
    if (act === "export") return exportCsv();
    if (act === "draw") {
      if (!confirm("Extragi acum un câștigător? Alegerea se face pe server și intră în jurnalul de audit.")) return;
      const r = check(await db.rpc("draw_giveaway_winner", { p_campaign: S.draft.id }));
      await reload();
      return flash(`Câștigător extras dintr-un grup de ${r.pool_size} înscrieri valide.`, true);
    }
    if (act === "save-winner") {
      const li = el.closest("[data-winner]");
      check(await db.rpc("update_giveaway_winner", { p_winner: id, p_status: li.querySelector("[name=wstatus]").value, p_fulfillment: li.querySelector("[name=wfulfill]").value, p_notes: li.querySelector("[name=wnotes]").value }));
      await reload();
      return flash("Salvat.", true);
    }
    if (act === "announce") {
      const label = prompt("Eticheta publică a câștigătorului (de exemplu „Andrei P.”). Apare pe pagina campaniei:", "");
      if (label === null) return;
      if (!confirm(`Anunți public „${label.trim()}” ca winner? Pagina campaniei îl va afișa imediat.`)) return;
      check(await db.rpc("announce_giveaway_winner", { p_winner: id, p_label: label }));
      await reload();
      return flash("Câștigătorul a fost anunțat.", true);
    }
    if (act === "void-winner") {
      const reason = prompt("Motivul anulării câștigătorului (min. 10 caractere, intră în audit):", "");
      if (reason === null) return;
      check(await db.rpc("void_giveaway_winner", { p_winner: id, p_reason: reason }));
      await reload();
      return flash("Câștigătorul a fost anulat. Poți extrage altul.", true);
    }
  });
});

document.addEventListener("submit", (ev) => {
  const form = ev.target;
  if (!db) return;
  if (form.id === "form-campanie") {
    ev.preventDefault();
    guard(saveCampaign);
  } else if (form.id === "form-sursa") {
    ev.preventDefault();
    guard(async () => {
      check(await db.from("giveaway_sources").insert({ campaign_id: S.draft.id, source: form.elements.source.value, medium: form.elements.medium.value, label: form.elements.label.value.trim(), partner_id: form.elements.partner.value || null }));
      await reload();
    });
  } else if (form.id === "form-manual") {
    ev.preventDefault();
    guard(async () => {
      check(await db.rpc("select_giveaway_winner_manual", { p_campaign: S.draft.id, p_entry: form.elements.entry.value, p_reason: form.elements.reason.value }));
      await reload();
      flash("Câștigător ales manual (motivul e în audit).", true);
    });
  } else if (form.dataset.partner) {
    ev.preventDefault();
    guard(() => savePartner(form));
  }
});

document.addEventListener("change", (ev) => {
  if (ev.target.id === "upload-premiu" && ev.target.files[0]) guard(() => uploadPrize(ev.target.files[0]));
});

boot().catch((e) => say(`Ceva n-a mers: ${e.message || e}`));
