// The Edge Functions share some of the app's rules (supabase/functions/_shared/app, copied by sync-functions.mjs).
// Those files import "./i18n.js" for tr(); on the server this stand-in is copied in its place: no React, and no
// page language, because a server module is evaluated once and serves every player. `tr` keeps the Romanian text,
// exactly what the functions used before tr() existed. The player's language reaches the AI prompts through the
// `lang` field of the request (supabase/functions/_shared/prompts.ts); texts a function writes itself for one player
// (a calendar feed, a Markdown note, a Notion page) use trFor(lang), which looks the message up in the app's own
// English dictionary (en.js, copied next to this file).
import EN from "./en.js";

export const LOCALES = ["ro", "en"];
export const getLocale = () => "ro";
export const isEn = () => false;
export const intlTag = () => "ro-RO";
const source = (msg) => {
  const cut = msg.indexOf("§");
  return cut < 0 ? msg : msg.slice(0, cut);
};
const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)) : text);
export const tr = (msg, vars) => fill(source(msg), vars);
/** tr for one player's language: English when `lang` is "en", Romanian otherwise. */
export const trFor = (lang) => (lang === "en" ? (msg, vars) => fill(EN[msg] ?? source(msg), vars) : tr);
