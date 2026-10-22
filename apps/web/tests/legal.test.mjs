import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { buildSite } from "../scripts/generate.mjs";

const read = (f) => readFileSync(new URL(`../content/${f}`, import.meta.url), "utf8");
const KINDS = ["terms", "privacy", "cookies"];
const text = (k, l) => read(`${k}.${l}.html`);
const updated = (html) => html.match(/<p class="updated">[^:]+: ([^<]+)<\/p>/)[1];

test("the consent rule and the strictly-necessary exception are cited at the right paragraph, in both languages", () => {
  for (const [file, exception, consent] of [
    ["cookies.ro.html", /art\. 4 alin\. \(6\) lit\. b\)/, /art\. 4 alin\. \(5\)/],
    ["privacy.ro.html", /art\. 4 alin\. \(6\) lit\. b\)/, /art\. 4 alin\. \(5\)/],
    ["cookies.en.html", /Article 4\(6\)\(b\)/, /Article 4\(5\)/],
    ["privacy.en.html", /Article 4\(6\)\(b\)/, /Article 4\(5\)/],
  ]) {
    const html = read(file);
    assert.match(html, exception, `${file}: exception`);
    assert.match(html, consent, `${file}: consent`);
    // art. 4(5) is the consent rule: it must never be given as the reason a cookie needs no consent
    assert.doesNotMatch(html, /sau? (?:la |prin )?art\. 4 alin\. \(5\) din Legea 506\/2004, care transpune/, file);
    assert.doesNotMatch(html, /\(Article 4\(5\) of Romanian Law 506\/2004, implementing/, file);
    assert.doesNotMatch(html, /transpusă prin art\. 4 alin\. \(5\) din Legea 506\/2004\)/, file);
    assert.doesNotMatch(html, /transposed in Romania by Article 4\(5\)/, file);
  }
});

test("language by country stores nothing: no geo cookie anywhere, and the policies say so", () => {
  for (const k of KINDS) for (const l of ["ro", "en"]) assert.doesNotMatch(text(k, l), /molted_lang_hint/, `${k}.${l}`);
  for (const l of ["ro", "en"]) {
    assert.match(text("cookies", l), /<code>\?hl=ro<\/code>/);
    assert.match(text("privacy", l), /Accept-Language/);
  }
  assert.match(text("cookies", "ro"), /Nu salvăm nimic pe dispozitivul tău pentru asta/i);
  assert.match(text("cookies", "en"), /We store nothing on your device for this/);
});

test("the privacy policy gives a legal basis for choosing the language from the IP address, and names no Google Fonts", () => {
  assert.match(text("privacy", "ro"), /Alegerea limbii paginii la prima vizită[\s\S]{0,400}art\. 6 alin\. \(1\) lit\. f\)/);
  assert.match(text("privacy", "en"), /Choosing the page language on the first visit[\s\S]{0,400}Art\. 6\(1\)\(f\)/);
  for (const l of ["ro", "en"]) assert.doesNotMatch(text("privacy", l), /încărcat de la Google Fonts|loaded from Google Fonts/);
});

test("the Romanian original and the English translation have the same structure and the same date", () => {
  for (const k of KINDS) {
    // giveaways exist only in Romania, so the English pages never mention them (see the giveaways test in i18n.test.mjs);
    // the Romanian original is compared without those passages
    const noGiveaways = (html) =>
      html
        .replace(/<h2>\d+\. Campanii \(giveaway-uri\)<\/h2>[\s\S]*?(?=<h2>)/, "")
        .replace(/<li><b>Giveaway-uri \(doar România\)[\s\S]*?<\/li>\n?/, "")
        .replace(/<tr><td>Giveaway-uri<\/td>[\s\S]*?<\/tr>\n?/, "");
    const ro = noGiveaways(text(k, "ro"));
    const en = text(k, "en");
    assert.doesNotMatch(en, /giveaway/i, `${k}: the English text must not mention giveaways`);
    const count = (html, re) => (html.match(re) || []).length;
    for (const re of [/<h2>/g, /<tr>/g, /<li>/g, /<table>/g, /<a href=/g]) assert.equal(count(en, re), count(ro, re), `${k}: ${re}`);
    assert.equal(
      new Date(Date.parse(updated(en).replace(/(\d+), (\d+)/, "$1 $2") + " UTC")).toISOString().slice(0, 10),
      roDate(updated(ro)),
      `${k}: last updated`,
    );
  }
});

function roDate(s) {
  const months = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
  const [d, m, y] = s.trim().split(/\s+/);
  return `${y}-${String(months.indexOf(m) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

test("no page of molted.eu asks Google (or any other third party) for fonts, and the font files exist", () => {
  const pages = buildSite().filter((f) => f.file.endsWith(".html"));
  assert.ok(pages.length > 8);
  for (const p of pages) {
    assert.doesNotMatch(p.html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, p.file);
    assert.match(p.html, /\/fonts\/nunito\.css/, p.file);
  }
  for (const f of ["admin.html", "admin/giveaways/index.html"]) assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /fonts\.googleapis|fonts\.gstatic/, f);
  const dir = readdirSync(new URL("../public/fonts/", import.meta.url));
  for (const f of ["nunito.css", "nunito-latin.woff2", "nunito-latin-ext.woff2"]) assert.ok(dir.includes(f), f);
  const css = readFileSync(new URL("../public/fonts/nunito.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /https?:\/\//);
});
