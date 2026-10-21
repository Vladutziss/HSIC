// /ro/giveaways/<slug>/: one campaign. The page is a shared static shell; this script loads the campaign from the
// database, remembers the QR attribution (first touch, 7 days), counts the visit, signs the player in with Clerk when
// they ask to, and enters them through enter_giveaway. Nothing is shown as done until the database confirms it.
import { SITE_URL } from "./i18n/routes.js";
import { errorCopy, parseAttribution, readAttribution, rememberAttribution } from "@molted/ui/giveaway-core.js";
import { rpc } from "./api.js";
import { CLERK_KEY, loadClerk } from "./clerk.js";
import { renderDetail, renderHidden, renderLoadError, renderNotFound } from "./giveaway-view.js";

const root = document.getElementById("campanie");
const slug = location.pathname.match(/^\/ro\/giveaways\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)?.[1] || "";

const safeStorage = (kind) => {
  try {
    const s = window[kind];
    s.getItem("x");
    return s;
  } catch {
    return { getItem: () => null, setItem: () => {} }; // private mode / blocked storage: everything still works, just without memory
  }
};
const local = safeStorage("localStorage");
const session = safeStorage("sessionStorage");

const state = { campaign: null, signedIn: false, token: null, busy: false, message: "", error: "", clerk: null };

// ------------------------------------------------------------ head: the campaign's own title and description
function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}
function applyHead(c) {
  const url = `${SITE_URL}/ro/giveaways/${slug}/`;
  const found = Boolean(c && c.title);
  const title = found ? `${c.title} · Molted` : "Campania nu a fost găsită · Molted";
  const desc = found ? String(c.description || "").replace(/\s+/g, " ").trim().slice(0, 155) || "Giveaway Molted din România." : "Campania nu există sau nu mai este disponibilă.";
  document.title = title;
  setMeta('meta[name="description"]', "content", desc);
  setMeta('link[rel="canonical"]', "href", found ? url : `${SITE_URL}/ro/giveaways/`);
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", found ? url : `${SITE_URL}/ro/giveaways/`);
  setMeta('meta[name="twitter:title"]', "content", title);
  setMeta('meta[name="twitter:description"]', "content", desc);
  setMeta('meta[name="robots"]', "content", found ? "index, follow, max-image-preview:large" : "noindex, follow");
}

// ------------------------------------------------------------ render
function draw() {
  const c = state.campaign;
  if (!c) return;
  if (c.found === false) {
    applyHead(null);
    root.innerHTML = renderNotFound();
  } else if (c.hidden) {
    applyHead(c);
    root.innerHTML = renderHidden(c);
  } else {
    applyHead(c);
    root.innerHTML = renderDetail(c, { signedIn: state.signedIn, busy: state.busy, message: state.message, error: state.error });
  }
}

async function fetchCampaign() {
  state.campaign = await rpc("get_giveaway", { p_slug: slug }, state.token);
}

async function init() {
  state.error = "";
  root.innerHTML = `<p class="text-dim" role="status">Se încarcă campania…</p>`;
  try {
    await fetchCampaign();
    draw();
  } catch {
    document.title = "Giveaway · Molted";
    root.innerHTML = renderLoadError();
    return;
  }
  startAuth();
}

// ------------------------------------------------------------ QR attribution and the visit counter
const fromUrl = parseAttribution(location.search);
rememberAttribution(local, slug, fromUrl); // first touch: keeps the first source seen for this campaign
function countVisit() {
  const key = `molted:giveaway:visit:${slug}`;
  if (session.getItem(key)) return; // one counted visit per browser session
  session.setItem(key, "1");
  rpc("track_giveaway_visit", { p_slug: slug, p_source: fromUrl?.source ?? null, p_medium: fromUrl?.medium ?? null }).catch(() => {});
}

async function claimAttribution() {
  const stored = readAttribution(local, slug);
  const key = `molted:giveaway:claimed:${slug}`;
  if (!stored || session.getItem(key)) return;
  try {
    await rpc("claim_giveaway_attribution", { p_slug: slug, p_source: stored.source, p_medium: stored.medium, p_visited_at: new Date(stored.at).toISOString() }, state.token);
    session.setItem(key, "1");
  } catch {
    // attribution is best effort: it must never get in the player's way
  }
}

// ------------------------------------------------------------ sign-in (Clerk, loaded in the background)
async function onSession(clerk) {
  if (!clerk.user) {
    state.signedIn = false;
    state.token = null;
    return;
  }
  state.token = (await clerk.session?.getToken()) ?? null;
  state.signedIn = Boolean(state.token);
  if (state.signedIn) {
    await claimAttribution();
    try {
      await fetchCampaign(); // now it includes what is about this player (already entered?)
    } catch {}
  }
  draw();
}

async function startAuth() {
  if (!CLERK_KEY || state.clerk) return;
  try {
    state.clerk = await loadClerk();
    await onSession(state.clerk);
    state.clerk.addListener(() => onSession(state.clerk).catch(() => {}));
  } catch {
    // no sign-in available right now: the page still shows everything, and the button explains below
  }
}

async function showSignIn() {
  const mount = document.getElementById("auth-mount");
  if (!mount) return;
  if (!CLERK_KEY) {
    mount.hidden = false;
    mount.innerHTML = `<p class="text-sm text-rose" role="alert">Autentificarea nu este disponibilă acum. Încearcă mai târziu.</p>`;
    return;
  }
  try {
    const clerk = state.clerk || (await loadClerk());
    state.clerk = clerk;
    mount.hidden = false;
    // back to this same campaign after sign-in or sign-up
    clerk.mountSignIn(mount, { routing: "hash", fallbackRedirectUrl: location.href, signUpFallbackRedirectUrl: location.href });
  } catch {
    mount.hidden = false;
    mount.innerHTML = `<p class="text-sm text-rose" role="alert">Nu am putut încărca autentificarea. Încearcă din nou.</p>`;
  }
}

// ------------------------------------------------------------ entering
async function enter(form) {
  const rules = form.elements.rules?.checked === true;
  const attest = form.elements.attest ? form.elements.attest.checked === true : true;
  if (!rules) return say("Bifează acceptarea regulamentului ca să continui.");
  if (!attest) return say("Bifează confirmarea condițiilor de participare ca să continui.");
  state.busy = true;
  state.message = "";
  draw();
  try {
    const stored = readAttribution(local, slug);
    const r = await rpc(
      "enter_giveaway",
      { p_slug: slug, p_accept_rules: rules, p_attest: attest, p_source: stored?.source ?? null, p_medium: stored?.medium ?? null },
      state.token,
    );
    if (r?.status !== "entered" && r?.status !== "already_entered") throw new Error("unexpected");
    await fetchCampaign(); // the confirmation on screen comes from the database, not from this click
    state.busy = false;
    state.message = "";
    draw();
  } catch (err) {
    state.busy = false;
    state.message = err.network ? "Nu am putut trimite înscrierea: verifică conexiunea și încearcă din nou." : errorCopy(err.message, err.detail);
    draw();
  }
}

function say(text) {
  // validation hints update the line in place so the ticks the player already made are not wiped by a redraw
  const line = root.querySelector("[data-form=enter] [role=status]");
  if (line) line.textContent = text;
}

root.addEventListener("click", (e) => {
  if (e.target.closest("[data-action=retry]")) init();
  else if (e.target.closest("[data-action=signin]")) showSignIn();
});
root.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form=enter]");
  if (!form) return;
  e.preventDefault();
  if (!state.busy) enter(form);
});

if (!slug) {
  state.campaign = { found: false };
  draw();
} else {
  countVisit();
  init();
}
