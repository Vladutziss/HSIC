import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "rolldown/parseAst";
import EN from "../src/i18n/en.js";
import { englishOf, getLocale, tr, useLocale } from "../src/lib/i18n.js";
import { NAMES } from "../src/lib/dates.js";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(f) && !/i18n[\\/]en\.js$/.test(p)) files.push(p);
  }
})(SRC);

// every literal first argument of tr("…") in the source, with where it is
const used = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const ast = parseAst(src, { lang: file.endsWith(".jsx") ? "jsx" : "js" });
  (function visit(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && n.callee.name === "tr") {
      const a = n.arguments[0];
      const text = a?.type === "Literal" && typeof a.value === "string" ? a.value : a?.type === "TemplateLiteral" && !a.expressions.length ? a.quasis[0].value.cooked : null;
      if (text !== null) used.set(text, file.slice(SRC.length));
    }
    for (const k of Object.keys(n)) if (k !== "type" && k !== "start" && k !== "end") visit(n[k]);
  })(ast);
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every message wrapped in tr() has an English text", () => {
  const missing = [...used].filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, []);
});

test("English texts carry the same {placeholders} as the Romanian message", () => {
  const bad = Object.entries(EN).filter(([k, v]) => placeholders(k) !== placeholders(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("no English text is empty, still Romanian, or left over from a message that was removed", () => {
  const empty = Object.entries(EN).filter(([, v]) => !String(v).trim()).map(([k]) => k);
  assert.deepEqual(empty, []);
  const dangling = Object.keys(EN).filter((k) => !used.has(k));
  assert.deepEqual(dangling, []);
  const diacritics = Object.entries(EN).filter(([k, v]) => k !== v && /[ăâîșțĂÂÎȘȚ]/.test(v)).map(([k]) => k); // a name (an author) may be the same in both
  assert.deepEqual(diacritics, []);
});

test("Romanian is the default: tr returns the message itself, without the § hint", () => {
  assert.equal(getLocale(), "ro");
  assert.equal(tr("Ai {n} obiceiuri", { n: 3 }), "Ai 3 obiceiuri");
  assert.equal(tr("Oul tău§propoziție"), "Oul tău");
});

test("English: tr looks the message up (hint included), fills placeholders and falls back to Romanian", () => {
  useLocale("en");
  try {
    assert.equal(tr("Oul tău§propoziție"), "your egg");
    assert.equal(tr("o frază care nu există în dicționar"), "o frază care nu există în dicționar");
    assert.equal(tr("{done}/{sched} obiceiuri bifate", { done: 2, sched: 5 }), "2/5 habits checked off");
    assert.equal(englishOf("zi"), "day");
    assert.equal(englishOf("nu există"), null);
  } finally {
    useLocale("ro");
  }
  assert.equal(tr("zi"), "zi");
});

test("a placeholder can be a React element: tr then returns a fragment with the element in place", () => {
  const el = { $$typeof: Symbol.for("react.transitional.element"), type: "b", key: null, props: { children: "x" }, ref: null, _owner: null };
  const r = tr("Citește {link} acum", { link: el });
  assert.equal(typeof r, "object");
  assert.equal(r.props.children[0], "Citește ");
  assert.equal(r.props.children[2], " acum");
});

test("day and month names exist in both languages with the right lengths", () => {
  for (const l of ["ro", "en"]) {
    const n = NAMES[l];
    assert.equal(n.days.length, 7);
    assert.equal(n.short.length, 7);
    assert.equal(n.min.length, 7);
    assert.equal(n.months.length, 12);
    assert.equal(n.monthsShort.length, 12);
  }
  assert.equal(NAMES.en.days[0], "Sunday");
  assert.equal(NAMES.ro.days[0], "duminică");
});

test("source text in Romanian stays inside tr(): no string or JSX text with diacritics outside it", () => {
  const found = [];
  const skipFiles = /lib[\\/]dates\.js$/; // the Romanian day and month names themselves
  for (const file of files) {
    if (skipFiles.test(file) || /lib[\\/]i18n\.js$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    const ast = parseAst(src, { lang: file.endsWith(".jsx") ? "jsx" : "js" });
    const stack = [];
    (function visit(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(visit);
      if (!n.type) return;
      const parent = stack[stack.length - 1];
      const inTr = (p) => p?.type === "CallExpression" && p.callee?.name === "tr";
      const text =
        n.type === "Literal" && typeof n.value === "string" && !inTr(parent) && parent?.type !== "ImportDeclaration"
          ? n.value
          : n.type === "TemplateElement" && !inTr(stack[stack.length - 2])
            ? n.value.raw
            : n.type === "JSXText"
              ? n.value
              : null;
      if (text && /[ăâîșțĂÂÎȘȚ]/.test(text)) found.push(`${file.slice(SRC.length)}: ${text.trim().slice(0, 60)}`);
      stack.push(n);
      for (const k of Object.keys(n)) if (k !== "type" && k !== "start" && k !== "end") visit(n[k]);
      stack.pop();
    })(ast);
  }
  assert.deepEqual(found, []);
});
