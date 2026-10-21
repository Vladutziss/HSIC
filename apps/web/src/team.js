// Public team page (team.html): reads the rows admin.html writes (team_members, team_photos), anon key only.
import { SUPABASE_URL, SUPABASE_KEY, configured, photoUrl, PATHS, esc } from "./team-data.js";
import { spriteSvg } from "./sprite.js";
import { S } from "./i18n/client.js";

const $ = (id) => document.getElementById(id);

const get = async (table) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=sort.asc,created_at.asc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

const member = (m, i) => `
  <li class="panel flex flex-col items-center text-center">
    <div class="avatar">${
      m.photo_path
        ? `<img src="${esc(photoUrl(m.photo_path))}" alt="${esc(m.name)}" loading="lazy" />`
        : `<span class="spr">${spriteSvg({ path: PATHS[i % PATHS.length], stage: "master", mood: "joy" })}</span>`
    }</div>
    <h2 class="font-pixel mt-4 text-xl font-bold text-ink">${esc(m.name)}</h2>
    ${m.role ? `<p class="text-sm font-bold text-gold">${esc(m.role)}</p>` : ""}
    ${m.bio ? `<p class="mt-3 text-sm">${esc(m.bio)}</p>` : ""}
    ${m.instagram ? `<a class="mt-3 text-sm font-bold text-dim hover:text-ink" href="https://instagram.com/${esc(m.instagram)}" rel="noopener" target="_blank">@${esc(m.instagram)}</a>` : ""}
  </li>`;

(async () => {
  if (!configured) return ($("stare").textContent = S.teamNotConfigured);
  try {
    const [members, photos] = await Promise.all([get("team_members"), get("team_photos")]);
    $("stare").hidden = true;
    $("membri").innerHTML = members.map(member).join("");
    if (photos.length) {
      $("galerie").innerHTML = photos
        .map((p) => `<li><img src="${esc(photoUrl(p.path))}" alt="${esc(p.caption)}" class="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />${p.caption ? `<p class="mt-2 text-sm text-dim">${esc(p.caption)}</p>` : ""}</li>`)
        .join("");
      $("galerie-sectiune").hidden = false;
    }
  } catch {
    $("stare").textContent = S.teamLoadError;
  }
})();
