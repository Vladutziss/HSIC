// Admin for plans, schools and codes (admin/plans/). Sign-in is Clerk (the app's accounts); every write goes through the
// admin_* functions of 0041/0042, which refuse anyone who is not a site admin. The page decides nothing: it sends
// what you type and shows what the database answers.
import { createClient } from "@supabase/supabase-js";
import { CLERK_KEY, loadClerk } from "./clerk.js";
import { esc } from "./html.js";
import { SUPABASE_KEY, SUPABASE_URL, configured } from "./team-data.js";

const $ = (id) => document.getElementById(id);
const show = (id) => ["login", "refuzat", "admin"].forEach((k) => ($(k).hidden = k !== id));
const say = (t) => ($("stare").textContent = t);
let db = null;

const ERRORS = {
  forbidden: "Nu ai dreptul să faci asta.",
  "unknown account": "Nu găsesc contul. Contul trebuie să se fi autentificat cel puțin o dată; încearcă și cu id-ul Clerk.",
  "unknown school": "Nu găsesc școala cu acest id.",
};
function flash(text, ok = false) {
  const el = $("flash");
  el.textContent = text;
  el.className = `mt-3 rounded-xl px-4 py-3 text-sm font-bold ${ok ? "bg-mint/20 text-mint" : "bg-rose/15 text-rose"}`;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}
const guard = (fn) => async (e) => {
  e?.preventDefault?.();
  try {
    await fn(e);
  } catch (err) {
    console.error(err);
    flash(ERRORS[err?.message] || `Ceva n-a mers: ${err?.message || err}`);
  }
};
const check = ({ error, data }) => {
  if (error) throw error;
  return data;
};
const form = (id) => Object.fromEntries(new FormData($(id)).entries());
const int = (v) => Number.parseInt(v, 10);
const date = (v) => `${v}T23:59:59+02:00`;

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
  const isAdmin = check(await db.rpc("is_site_admin"));
  if (!isAdmin) {
    $("refuzat-email").textContent = clerk.user.primaryEmailAddress?.emailAddress || "";
    say("");
    show("refuzat");
    return;
  }
  await reload();
  say("Ce faci aici se aplică imediat în baza de date de producție.");
  show("admin");
  bind();
}

async function reload() {
  const o = check(await db.rpc("admin_overview"));
  const plans = Object.entries(o.plans || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "niciun plan activ";
  $("sumar").textContent = `Planuri active: ${plans}. Școli: ${o.schools.length}. Coduri: ${o.codes.length}.`;
  $("scoli").innerHTML = o.schools
    .map((s) => `<li class="panel"><b class="text-ink">${esc(s.name)}</b> · ${s.students}/${s.seats} elevi · ${s.staff} din staff · până pe ${esc(String(s.until).slice(0, 10))}<br /><code class="text-xs text-dim select-all">${esc(s.id)}</code></li>`)
    .join("");
  $("coduri").innerHTML = o.codes
    .map((c) => `<li><code class="text-ink">${esc(c.code)}</code> · ${esc(c.plan)}${c.school_id ? ` (${esc(c.role)})` : ""} · ${c.uses}/${c.max_uses} · ${c.days} zile${c.label ? ` · ${esc(c.label)}` : ""}</li>`)
    .join("");
}

function bind() {
  $("f-scoala").addEventListener("submit", guard(async () => {
    const f = form("f-scoala");
    check(await db.rpc("admin_create_school", { p_name: f.name, p_seats: int(f.seats), p_until: date(f.until) }));
    $("f-scoala").reset();
    await reload();
    flash("Școala a fost creată. Copiază id-ul din listă ca să pui primul admin.", true);
  }));
  $("f-membru").addEventListener("submit", guard(async () => {
    const f = form("f-membru");
    check(await db.rpc("admin_set_member", { p_school: f.school.trim(), p_user: f.user, p_role: f.role }));
    await reload();
    flash("Contul e în școală, cu planul Școală.", true);
  }));
  $("f-cod").addEventListener("submit", guard(async () => {
    const f = form("f-cod");
    const code = check(await db.rpc("admin_create_code", {
      p_code: f.code, p_plan: f.plan, p_days: int(f.days), p_max_uses: int(f.max), p_label: f.label || "", p_school: f.school?.trim() || null, p_role: f.role,
    }));
    await reload();
    flash(`Codul ${code} a fost creat.`, true);
  }));
  $("f-acorda").addEventListener("submit", guard(async () => {
    const f = form("f-acorda");
    check(await db.rpc("admin_grant_plan", { p_user: f.user, p_plan: f.plan, p_days: int(f.days) }));
    await reload();
    flash("Planul a fost acordat.", true);
  }));
  $("retrage").addEventListener("click", guard(async () => {
    const user = $("f-acorda").elements.user.value.trim();
    if (!user) throw new Error("Scrie emailul sau id-ul contului.");
    check(await db.rpc("admin_revoke_plan", { p_user: user }));
    await reload();
    flash("Planul a fost retras.", true);
  }));
}

boot().catch((e) => say(`Ceva n-a mers: ${e.message || e}`));
