// Giveaway rules that run in the browser (public pages and the admin dashboard). Pure functions, no DOM.
// The database is the authority (supabase/migrations/0031_giveaways.sql): everything here either mirrors a rule to
// give early feedback or builds/validates URLs. A client check never authorizes anything.

export const SOURCES = ["plato_print", "plao_streetball", "poster", "event", "social", "referral"];
export const MEDIA = ["qr", "link", "print", "social"];
export const SOURCE_LABELS = {
  plato_print: "Plato Print",
  plao_streetball: "Plao Streetball",
  poster: "Poster",
  event: "Eveniment",
  social: "Social media",
  referral: "Recomandare",
  direct: "Direct (fără sursă)",
};
export const MEDIA_LABELS = { qr: "Cod QR", link: "Link", print: "Tipărit", social: "Social" };

export const ATTRIBUTION_WINDOW_DAYS = 7;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isValidSlug = (s) => typeof s === "string" && s.length >= 3 && s.length <= 60 && SLUG_RE.test(s);

/** The organizer's review before a campaign can leave draft (all must be ticked; also enforced in the database). */
export const CHECKLIST = [
  { key: "terms_reviewed", label: "Am verificat regulamentul oficial (înscriere, desemnare, premiu, durată, contact)." },
  { key: "eligibility_reviewed", label: "Am verificat condițiile de eligibilitate (vârstă, rezidență, excluderi) față de legea română și cea europeană." },
  { key: "prize_conditions_reviewed", label: "Am verificat condițiile premiului (valoare, livrare, impozitare, ce se întâmplă dacă nu e revendicat)." },
  { key: "data_processing_reviewed", label: "Am verificat prelucrarea datelor (temei, informare, durată de păstrare, parteneri)." },
  { key: "minors_reviewed", label: "Am verificat situația minorilor (vârsta minimă, acordul părinților sau al tutorilor) înainte de lansare." },
];
export const checklistComplete = (checklist) => CHECKLIST.every((c) => checklist?.[c.key] === true);

// ------------------------------------------------------------ attribution
/** Reads utm_source / utm_medium from a query string. Returns {source, medium} only for known, allowed values. */
export function parseAttribution(search) {
  const p = new URLSearchParams(typeof search === "string" ? search : "");
  const source = (p.get("utm_source") || "").toLowerCase();
  const medium = (p.get("utm_medium") || "").toLowerCase();
  if (!SOURCES.includes(source) || !MEDIA.includes(medium)) return null;
  return { source, medium };
}

/** The destination printed in a QR code. Only the campaign slug and an allowed source/medium: nothing personal. */
export function buildCampaignUrl(siteUrl, slug, source, medium) {
  if (!isValidSlug(slug)) throw new Error("invalid slug");
  if (!SOURCES.includes(source)) throw new Error("invalid source");
  if (!MEDIA.includes(medium)) throw new Error("invalid medium");
  const q = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: slug });
  return `${siteUrl.replace(/\/$/, "")}/ro/giveaways/${slug}/?${q.toString()}`;
}

const KEY = "molted:giveaway:attr";
const DAY = 86400000;

/** First touch per campaign, kept on the device for 7 days. `storage` is localStorage (or a stub in tests). */
export function rememberAttribution(storage, slug, attribution, now = Date.now()) {
  if (!attribution) return readAttribution(storage, slug, now);
  const all = readAll(storage, now);
  if (!all[slug]) all[slug] = { ...attribution, at: now };
  try {
    storage.setItem(KEY, JSON.stringify(all));
  } catch {}
  return all[slug];
}

export function readAttribution(storage, slug, now = Date.now()) {
  return readAll(storage, now)[slug] || null;
}

function readAll(storage, now) {
  let all = {};
  try {
    all = JSON.parse(storage.getItem(KEY) || "{}") || {};
  } catch {}
  const out = {};
  for (const [slug, a] of Object.entries(all)) {
    if (a && SOURCES.includes(a.source) && MEDIA.includes(a.medium) && Number.isFinite(a.at) && now - a.at < ATTRIBUTION_WINDOW_DAYS * DAY) out[slug] = a;
  }
  return out;
}

// ------------------------------------------------------------ lifecycle (mirror of public.giveaway_phase)
export function campaignPhase(c, now = Date.now()) {
  if (["draft", "paused", "completed", "cancelled"].includes(c.status)) return c.status;
  if (now < Date.parse(c.starts_at)) return "scheduled";
  if (now >= Date.parse(c.ends_at)) return "ended";
  return "active";
}

export const PHASE_LABELS = {
  draft: "Ciornă",
  scheduled: "Programată",
  active: "Activă",
  paused: "În pauză",
  ended: "Încheiată (în așteptarea închiderii)",
  completed: "Finalizată",
  cancelled: "Anulată",
};

/** Transitions the database allows (mirror of the trigger), for enabling buttons. */
export const TRANSITIONS = {
  draft: ["scheduled", "active", "cancelled"],
  scheduled: ["active", "paused", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// ------------------------------------------------------------ copy
const ERRORS = {
  not_authenticated: "Intră în cont ca să participi.",
  not_found: "Campania nu a fost găsită.",
  not_started: "Campania nu a început încă.",
  paused: "Campania este în pauză. Înscrierile sunt oprite temporar.",
  ended: "Campania s-a încheiat. Nu se mai pot face înscrieri.",
  cancelled: "Campania a fost anulată.",
  full: "S-a atins numărul maxim de înscrieri pentru această campanie.",
  no_profile: "Termină mai întâi configurarea contului în aplicație, apoi revino aici.",
  rules_not_accepted: "Trebuie să accepți regulamentul oficial.",
  attestation_required: "Trebuie să confirmi că îndeplinești condițiile de participare.",
  not_onboarded: "Termină mai întâi configurarea contului în aplicație (alegerea drumului și primul obicei), apoi revino aici.",
  not_enough_checkins: "Mai ai de bifat obiceiuri în aplicație înainte să poți participa.",
  forbidden: "Nu ai dreptul să faci această acțiune.",
};

/** Romanian text for a stable error code from the database (the PostgREST message), or a generic one. */
export function errorCopy(code, detail) {
  const key = String(code || "").split(":")[0].trim();
  if (key === "not_enough_checkins" && detail && /^\d+$/.test(String(detail))) {
    return `Mai ai de bifat ${detail} ${Number(detail) === 1 ? "obicei" : "obiceiuri"} în aplicație înainte să poți participa.`;
  }
  return ERRORS[key] || "Nu am putut face asta acum. Încearcă din nou.";
}

/** Plain-language list of what a campaign asks of a player (from the public eligibility json). */
export function eligibilitySummary(e) {
  const out = ["Cont Molted"];
  if (e?.requireOnboarded) out.push("Configurarea contului terminată (drum ales și primul obicei)");
  if (e?.minCheckins > 0) out.push(`Cel puțin ${e.minCheckins} ${e.minCheckins === 1 ? "bifă" : "bife"} de obiceiuri în aplicație`);
  if (e?.requireAttestation !== false) out.push("Confirmarea că îndeplinești condițiile din regulament (de exemplu vârsta și rezidența)");
  out.push("Acceptarea regulamentului oficial");
  return out;
}

// ------------------------------------------------------------ dates in the campaign time zone
/** The UTC instant for a wall-clock time ("2026-11-05T18:30") in an IANA time zone. */
export function zonedToUtc(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || "");
  if (!m) throw new Error("invalid date");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = zoneOffsetMs(guess, timeZone);
  let t = guess - offset;
  const offset2 = zoneOffsetMs(t, timeZone); // around a DST change the first guess can be an hour off
  if (offset2 !== offset) t = guess - offset2;
  return new Date(t).toISOString();
}

/** "2026-11-05T18:30" for a UTC instant, as seen in the time zone (for datetime-local inputs). */
export function utcToZoned(iso, timeZone) {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zoneOffsetMs(utcMs, timeZone) {
  const local = utcToZoned(new Date(utcMs).toISOString(), timeZone);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - Math.floor(utcMs / 60000) * 60000;
}

export function formatDateRo(iso, timeZone = "Europe/Bucharest") {
  return new Intl.DateTimeFormat("ro-RO", { timeZone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
