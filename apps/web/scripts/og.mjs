// Generates the share cards (1200x630) shown when molted.eu is shared: the name, one line on what Molted is and
// Molt from egg to master. public/og.png is Romanian, public/og-en.png English (see ogImage() in src/seo.js).
// Builds an HTML card with the app's sprites and screenshots it with headless Chrome or Edge.
//   node apps/web/scripts/og.mjs        (CHROME=<path> if the browser is not in a usual place)
// The PNGs are committed; run this again only when the cards change.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spriteRuns } from "@molted/ui/sprites.js";

const CARDS = [
  { file: "og.png", lang: "ro", line: "Aplicație de obiceiuri cu coach AI", sub: "Tu bifezi, coach-ul te ajută, personajul tău crește." },
  { file: "og-en.png", lang: "en", line: "Habit tracker app with an AI coach", sub: "You tick habits, the coach helps, your character grows." },
];

const sprite = (stage, size) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" shape-rendering="crispEdges">${spriteRuns({ path: "sport", stage, mood: stage === "master" ? "joy" : "idle" })
    .map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`)
    .join("")}</svg>`;

const card = ({ lang, line, sub }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;800;900&display=swap" rel="stylesheet">
<style>
body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Nunito,sans-serif;color:#cfc8f0;background:#0c0a1d;
background-image:radial-gradient(2px 2px at 44px 68px,rgba(255,255,255,.45) 50%,transparent 52%),radial-gradient(2px 2px at 256px 172px,rgba(255,255,255,.3) 50%,transparent 52%),radial-gradient(3px 3px at 412px 316px,rgba(255,214,120,.5) 50%,transparent 52%),radial-gradient(2px 2px at 536px 88px,rgba(177,155,255,.55) 50%,transparent 52%),radial-gradient(1000px 600px at 92% -20%,rgba(143,107,255,.28),transparent 60%),radial-gradient(900px 500px at -10% 120%,rgba(255,197,66,.12),transparent 60%);
background-size:720px 520px,720px 520px,720px 520px,720px 520px,auto,auto;display:flex;flex-direction:column;justify-content:center;padding:0 80px;box-sizing:border-box}
.name{font-weight:900;font-size:96px;line-height:1;color:#ffc542;letter-spacing:4px}
.line{margin-top:18px;font-weight:800;font-size:46px;line-height:1.2;color:#f3efff}
.sub{margin-top:14px;font-weight:600;font-size:28px;color:#b19bff}
.row{margin-top:44px;display:flex;align-items:flex-end;gap:26px}
.row svg{display:block}
.url{position:absolute;right:80px;top:64px;font-weight:800;font-size:28px;color:#9a91c9}
</style></head><body>
<div class="url">molted.eu</div>
<div class="name">MOLTED</div>
<div class="line">${line}</div>
<div class="sub">${sub}</div>
<div class="row">${sprite("egg", 120)}${sprite("hatchling", 130)}${sprite("apprentice", 145)}${sprite("adept", 160)}${sprite("master", 175)}</div>
</body></html>`;

const chrome = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome or Edge not found: set CHROME=<path to the browser>");

const dir = mkdtempSync(join(tmpdir(), "molted-og-"));
for (const c of CARDS) {
  const page = join(dir, `${c.lang}.html`);
  writeFileSync(page, card(c));
  const out = fileURLToPath(new URL(`../public/${c.file}`, import.meta.url));
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,630", "--virtual-time-budget=5000", `--screenshot=${out}`, pathToFileURL(page).href], { stdio: "ignore" });
  console.log(`${c.file} written`);
}
