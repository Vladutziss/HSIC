// Admin dashboard on molted.eu (admin.html): the team's members and photos. Sign-in is Clerk (the same accounts as the app); writes go to Supabase,
// where RLS lets them through only for emails in public.site_admins (supabase/migrations/0012_team.sql).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, configured, photoUrl, PATHS, esc } from "./team-data.js";
import { spriteSvg } from "./sprite.js";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// the app's Clerk look (apps/app/src/screens/ClerkGate.jsx)
const appearance = {
  variables: {
    colorPrimary: "#ffc542",
    colorTextOnPrimaryBackground: "#2a1b00",
    colorBackground: "#1a1636",
    colorInputBackground: "#120f29",
    colorInputText: "#f3efff",
    colorText: "#f3efff",
    colorTextSecondary: "#9a91c9",
    colorNeutral: "#cfc8f0",
    colorDanger: "#ff5f87",
    colorSuccess: "#3fe0a5",
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid #2e2860" },
    footerAction: { display: "none" }, // admins already have accounts: no sign-up link
    socialButtonsBlockButton: { backgroundColor: "#221d45", border: "1px solid #2e2860" },
    dividerLine: { backgroundColor: "#2e2860" },
    headerTitle: { fontFamily: '"Pixelify Sans", Nunito, monospace' },
    formButtonPrimary: { fontWeight: 800 },
  },
};

const $ = (id) => document.getElementById(id);
const say = (text) => ($("stare").textContent = text);
const show = (id) => ["login", "refuzat", "editor"].forEach((k) => ($(k).hidden = k !== id));

let db = null;
let members = [];
let photos = [];

// ------------------------------------------------------------ Clerk
// Same loader as @clerk/clerk-react: the script comes from the instance's own Frontend API, named by the key.
function loadClerk() {
  const api = atob(CLERK_KEY.split("_").slice(2).join("_")).replace(/\$$/, "");
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://${api}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.clerkPublishableKey = CLERK_KEY;
    s.onload = () => resolve(window.Clerk);
    s.onerror = () => reject(new Error("Clerk nu s-a încărcat"));
    document.head.append(s);
  });
}

async function boot() {
  if (!configured || !CLERK_KEY) {
    say("Lipsesc cheile Supabase sau Clerk (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_CLERK_PUBLISHABLE_KEY).");
    return;
  }
  const clerk = await loadClerk();
  await clerk.load({ appearance });
  $("iesire").addEventListener("click", () => clerk.signOut({ redirectUrl: location.pathname }));
  let started = false;
  const onUser = () => {
    if (clerk.user && !started) {
      started = true;
      $("iesire").hidden = false;
      start(clerk).catch(fail);
    }
  };
  if (!clerk.user) {
    say("Intră în cont cu contul tău de Molted.");
    show("login");
    clerk.mountSignIn($("login"), { routing: "hash", fallbackRedirectUrl: location.pathname });
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
  say("Tot ce salvezi aici ajunge în Supabase.");
  show("editor");
}

function fail(err) {
  console.error(err);
  say(`Ceva n-a mers: ${err.message || err}`);
}

// ------------------------------------------------------------ data
async function reload() {
  const [m, p] = await Promise.all([
    db.from("team_members").select("*").order("sort").order("created_at"),
    db.from("team_photos").select("*").order("sort").order("created_at"),
  ]);
  if (m.error) throw m.error;
  if (p.error) throw p.error;
  members = m.data;
  photos = p.data;
  renderMembers();
  renderPhotos();
}

const check = ({ error }) => {
  if (error) throw error;
};

/** "@nume", "instagram.com/nume/" or a full URL -> "nume" */
const handle = (raw) =>
  raw.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");

function pickFile(file) {
  if (!TYPES[file.type]) throw new Error(`${file.name}: doar JPG, PNG sau WebP`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: are peste 5 MB`);
  return `${crypto.randomUUID()}.${TYPES[file.type]}`;
}

async function upload(path, file) {
  check(await db.storage.from("team").upload(path, file, { contentType: file.type, cacheControl: "31536000" }));
}

const removeFile = async (path) => path && check(await db.storage.from("team").remove([path]));

// rewrites sort = 1..n in the given order
async function saveOrder(table, rows) {
  for (const [i, r] of rows.entries()) {
    if (r.sort !== i + 1) check(await db.from(table).update({ sort: i + 1 }).eq("id", r.id));
  }
}

const moved = (rows, id, dir) => {
  const a = [...rows];
  const i = a.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= a.length) return null;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

// ------------------------------------------------------------ members
function renderMembers() {
  $("lista-membri").innerHTML = members
    .map(
      (m, i) => `
    <li class="panel" data-id="${m.id}">
      <form class="grid gap-5 md:grid-cols-[9rem_1fr]" data-form="member">
        <div class="flex flex-col items-center gap-3">
          <div class="avatar">${
            m.photo_path
              ? `<img src="${esc(photoUrl(m.photo_path))}" alt="" />`
              : `<span class="spr">${spriteSvg({ path: PATHS[i % PATHS.length], stage: "master", mood: "joy" })}</span>`
          }</div>
          <label class="btn btn-ghost btn-xs file-btn">${m.photo_path ? "Schimbă poza" : "Pune poză"}<input type="file" accept="image/jpeg,image/png,image/webp" data-action="member-photo" /></label>
          ${m.photo_path ? `<button type="button" class="text-xs font-bold text-dim underline" data-action="member-photo-remove">Scoate poza</button>` : ""}
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field">Nume<input class="input" name="name" value="${esc(m.name)}" maxlength="60" required /></label>
          <label class="field">Rol<input class="input" name="role" value="${esc(m.role)}" maxlength="60" placeholder="ex. Cod, Design" /></label>
          <label class="field sm:col-span-2">Instagram<input class="input" name="instagram" value="${m.instagram ? "@" + esc(m.instagram) : ""}" placeholder="@utilizator" /></label>
          <label class="field sm:col-span-2">Despre<textarea class="input" name="bio" maxlength="400" placeholder="O propoziție despre tine">${esc(m.bio)}</textarea></label>
          <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" class="btn btn-xs">Salvează</button>
            <button type="button" class="btn btn-ghost btn-xs" data-action="member-up" aria-label="Mută mai sus" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn btn-ghost btn-xs" data-action="member-down" aria-label="Mută mai jos" ${i === members.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="btn btn-danger btn-xs ml-auto" data-action="member-delete">Șterge</button>
          </div>
        </div>
      </form>
    </li>`
    )
    .join("");
}

async function saveMember(id, form) {
  const f = new FormData(form);
  const instagram = handle(String(f.get("instagram") || ""));
  if (!/^[A-Za-z0-9._]{0,30}$/.test(instagram)) throw new Error("Instagram: doar litere, cifre, punct și _ (maxim 30)");
  const row = { name: String(f.get("name")).trim(), role: String(f.get("role")).trim(), bio: String(f.get("bio")).trim(), instagram };
  if (!row.name) throw new Error("Numele nu poate fi gol");
  check(await db.from("team_members").update(row).eq("id", id));
}

async function setMemberPhoto(m, file) {
  const path = `members/${pickFile(file)}`;
  await upload(path, file);
  check(await db.from("team_members").update({ photo_path: path }).eq("id", m.id));
  await removeFile(m.photo_path);
}

// ------------------------------------------------------------ gallery
function renderPhotos() {
  $("lista-poze").innerHTML = photos.length
    ? photos
        .map(
          (p, i) => `
    <li class="panel !p-3" data-id="${p.id}">
      <img src="${esc(photoUrl(p.path))}" alt="" class="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
      <form class="mt-3 grid gap-3" data-form="photo">
        <label class="field">Descriere (opțional)<input class="input" name="caption" value="${esc(p.caption)}" maxlength="140" /></label>
        <div class="flex flex-wrap items-center gap-2">
          <button type="submit" class="btn btn-xs">Salvează</button>
          <button type="button" class="btn btn-ghost btn-xs" data-action="photo-up" aria-label="Mută mai devreme" ${i === 0 ? "disabled" : ""}>←</button>
          <button type="button" class="btn btn-ghost btn-xs" data-action="photo-down" aria-label="Mută mai târziu" ${i === photos.length - 1 ? "disabled" : ""}>→</button>
          <button type="button" class="btn btn-danger btn-xs ml-auto" data-action="photo-delete">Șterge</button>
        </div>
      </form>
    </li>`
        )
        .join("")
    : `<li class="text-sm text-dim">Nicio poză încă.</li>`;
}

async function addPhotos(files) {
  let sort = photos.reduce((n, p) => Math.max(n, p.sort), 0);
  for (const file of files) {
    const path = `gallery/${pickFile(file)}`;
    say(`Se urcă ${file.name}…`);
    await upload(path, file);
    check(await db.from("team_photos").insert({ path, sort: ++sort }));
  }
}

// ------------------------------------------------------------ events
async function act(label, fn) {
  say(`${label}…`);
  document.body.style.cursor = "progress";
  try {
    await fn();
    await reload();
    say(`${label}: gata.`);
  } catch (err) {
    fail(err);
  } finally {
    document.body.style.cursor = "";
  }
}

const rowOf = (el, list) => list.find((r) => r.id === el.closest("[data-id]")?.dataset.id);

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === "member") {
    const m = rowOf(form, members);
    act(`Salvez ${m.name}`, () => saveMember(m.id, form));
  } else {
    const p = rowOf(form, photos);
    act("Salvez descrierea", async () => check(await db.from("team_photos").update({ caption: new FormData(form).get("caption").trim() }).eq("id", p.id)));
  }
});

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "INPUT") return;
  const a = el.dataset.action;
  if (a === "add-member") {
    const sort = members.reduce((n, m) => Math.max(n, m.sort), 0) + 1;
    act("Adaug un membru", async () => check(await db.from("team_members").insert({ name: "Membru nou", sort })));
  } else if (a === "member-up" || a === "member-down") {
    const order = moved(members, rowOf(el, members).id, a === "member-up" ? -1 : 1);
    if (order) act("Schimb ordinea", () => saveOrder("team_members", order));
  } else if (a === "member-delete") {
    const m = rowOf(el, members);
    if (confirm(`Ștergi membrul ${m.name}?`))
      act(`Șterg ${m.name}`, async () => {
        check(await db.from("team_members").delete().eq("id", m.id));
        await removeFile(m.photo_path);
      });
  } else if (a === "member-photo-remove") {
    const m = rowOf(el, members);
    act("Scot poza", async () => {
      check(await db.from("team_members").update({ photo_path: null }).eq("id", m.id));
      await removeFile(m.photo_path);
    });
  } else if (a === "photo-up" || a === "photo-down") {
    const order = moved(photos, rowOf(el, photos).id, a === "photo-up" ? -1 : 1);
    if (order) act("Schimb ordinea", () => saveOrder("team_photos", order));
  } else if (a === "photo-delete") {
    const p = rowOf(el, photos);
    if (confirm("Ștergi poza din galerie?"))
      act("Șterg poza", async () => {
        check(await db.from("team_photos").delete().eq("id", p.id));
        await removeFile(p.path);
      });
  }
});

document.addEventListener("change", (e) => {
  const input = e.target;
  if (input.id === "poze-noi" && input.files.length) {
    const files = [...input.files];
    input.value = "";
    act(files.length === 1 ? "Adaug poza" : `Adaug ${files.length} poze`, () => addPhotos(files));
  } else if (input.dataset.action === "member-photo" && input.files[0]) {
    const m = rowOf(input, members);
    const file = input.files[0];
    input.value = "";
    act(`Pun poza lui ${m.name}`, () => setMemberPhoto(m, file));
  }
});

boot().catch(fail);
