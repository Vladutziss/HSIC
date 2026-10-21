// The Edge Functions share some of the app's rules (supabase/functions/_shared/app, copied by sync-functions.mjs).
// Those files import "./i18n.js" for tr(); on the server this stand-in is copied in its place: no React, and no
// language switching, because a server module is evaluated once and serves every player. It keeps the Romanian
// text, exactly what the functions used before tr() existed. The player's language reaches the AI prompts instead
// (the `lang` field of the request, see supabase/functions/_shared/prompts.ts).
export const LOCALES = ["ro", "en"];
export const getLocale = () => "ro";
export const isEn = () => false;
export const intlTag = () => "ro-RO";
export const tr = (msg, vars) => {
  const cut = msg.indexOf("§");
  const text = cut < 0 ? msg : msg.slice(0, cut);
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m)) : text;
};
