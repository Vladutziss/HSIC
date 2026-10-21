// Fills the {{placeholders}} of a rendered email and builds the headers every campaign email carries. No I/O.

const APP_URL = "https://app.molted.eu";
const FUNCTIONS = "https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1";
export const CONTACT = "molted.app@gmail.com";
export const FROM = "Molted <noreply@mail.molted.eu>";

export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Salut, Ana!" / "Hi Ana," — or the plain form when we have no first name. */
export const greeting = (lang, name) => (lang === "en" ? (name ? `Hi ${name},` : "Hi,") : name ? `Salut, ${name}!` : "Salut!");

/** Links for one recipient. The token is the only secret in them. */
export function linksFor(token, lang, { functions = FUNCTIONS, app = APP_URL } = {}) {
  const l = lang === "en" ? "en" : "ro";
  return {
    app_url: `${app}/`,
    prefs_url: `${app}/`, // Settings → Emails is inside the app, behind the sign-in
    unsubscribe_url: `${app}/unsubscribe.html?t=${encodeURIComponent(token)}&lang=${l}`,
    // RFC 8058: an HTTPS endpoint that accepts a POST and unsubscribes at once, no page, no login
    one_click_url: `${functions}/email?a=unsub&t=${encodeURIComponent(token)}`,
    reply_url: `mailto:${CONTACT}?subject=${encodeURIComponent(l === "en" ? "Molted feedback" : "Părere despre Molted")}`,
  };
}

/** Every placeholder the templates use. A value missing here throws, so a typo never reaches a player. */
export function valuesFor({ lang, name, email, token }, extra = {}) {
  const links = linksFor(token, lang);
  return {
    greeting: greeting(lang, name),
    email,
    contact: CONTACT,
    app_url: links.app_url,
    prefs_url: links.prefs_url,
    unsubscribe_url: links.unsubscribe_url,
    reply_url: links.reply_url,
    ...extra,
  };
}

export function sampleValues(lang) {
  return valuesFor({ lang, name: lang === "en" ? "Alex" : "Ana", email: "ana@example.com", token: "SAMPLE-TOKEN" });
}

/** Replaces {{key}}; escapes values for HTML when `html` is set. Throws on a placeholder with no value. */
export function fillTemplate(template, values, { html = false } = {}) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`email template: no value for {{${key}}}`);
    return html ? escapeHtml(values[key]) : String(values[key]);
  });
}

/** Headers for the message: one-click unsubscribe (Gmail and Yahoo require it from bulk senders) and a precedence hint. */
export function headersFor(token, lang) {
  const { one_click_url } = linksFor(token, lang);
  return {
    "List-Unsubscribe": `<${one_click_url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
