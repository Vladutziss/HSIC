// Interface language. Romanian is the language the app is written in: every visible text is a Romanian message,
// wrapped in tr("…"), and English is looked up by that same text in src/i18n/en.js. A message with no English entry
// shows in Romanian (a test fails the build on that, so it cannot ship). {name} placeholders are filled from `vars`;
// a var may also be a React element (links, <b>), in which case tr returns a fragment.
//
//   tr("Ai {n} obiceiuri", { n })                    -> "You have 3 habits" in English
//   tr("Citește {link}", { link: <a href="…">…</a> })
//
// The language is chosen once per page load: switching it saves the choice and reloads, so nothing has to re-render
// piecemeal and module-level constants built with tr() are right. Order: ?lang= in the address, then the choice saved
// on this device (the account keeps it too: prefs.lang), then Romanian if the country hint cookie says Romania or Moldova
// (set by middleware.js, see lib/geo.js) or the browser language is Romanian (ro-*), otherwise English.

import { Fragment, cloneElement, createElement, isValidElement } from "react";
import EN from "../i18n/en.js";
import { hintFromCookie } from "./geo.js";

export const LOCALES = ["ro", "en"];
export const LANG_NAMES = { ro: "Română", en: "English" };
const PREFS_KEY = "molted.prefs"; // the same store as lib/prefs.js (read directly: prefs.js must be able to import this file)

function savedChoice() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")?.lang;
    return LOCALES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function detectLocale() {
  if (typeof window === "undefined") return "ro";
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (LOCALES.includes(q)) return q;
  } catch {}
  const saved = savedChoice();
  if (saved) return saved;
  try {
    if (hintFromCookie(document.cookie) === "ro") return "ro";
  } catch {}
  const langs = (typeof navigator !== "undefined" && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  const first = String(langs[0] || "ro").toLowerCase();
  return first.startsWith("ro") ? "ro" : "en";
}

let current = detectLocale();
export const getLocale = () => current;
export const isEn = () => current === "en";
/** For tests and the account sync: change the language of this page load without reloading. */
export function useLocale(l) {
  if (LOCALES.includes(l)) current = l;
}

/** Locale tag for Intl and toLocaleString. */
export const intlTag = () => (current === "en" ? "en-GB" : "ro-RO");

const fill = (text, vars) => {
  if (!vars) return text;
  const rich = Object.values(vars).some((v) => v !== null && typeof v === "object");
  if (!rich) return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
  const parts = text.split(/(\{\w+\})/g).map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p);
    if (!m || !(m[1] in vars)) return p;
    const v = vars[m[1]];
    return isValidElement(v) ? cloneElement(v, { key: i }) : String(v ?? "");
  });
  return createElement(Fragment, null, ...parts);
};

/** The message in the page language. `msg` is the Romanian text (with optional {placeholders}). */
export function tr(msg, vars) {
  // "word§hint": the hint tells apart two uses of the same Romanian word that need different English; it is never shown
  const cut = msg.indexOf("§");
  const ro = cut < 0 ? msg : msg.slice(0, cut);
  const text = current === "en" ? EN[msg] ?? ro : ro;
  return fill(text, vars);
}

/** The English text of a message, or null when there is none (used by tests and the missing-text report). */
export const englishOf = (msg) => EN[msg] ?? null;

/** Saves the language (device now, account through prefs) and reloads so the whole page is in it. */
export function setLocale(l) {
  if (!LOCALES.includes(l) || l === current) return;
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, lang: l }));
  } catch {}
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("lang");
    window.history.replaceState(null, "", u);
  } catch {}
  window.location.reload();
}

const LEGAL_PATHS = { terms: ["termeni", "terms"], privacy: ["confidentialitate", "privacy"], cookies: ["cookie-uri", "cookies"] };

/** The public terms / privacy / cookies pages on molted.eu in the page language. */
export const legalUrl = (kind) => {
  const en = current === "en";
  return `https://www.molted.eu/${en ? "en" : "ro"}/${LEGAL_PATHS[kind][en ? 1 : 0]}/`;
};
