// Tiny HTML helpers shared by the browser scripts and the tests (no import.meta.env here, so Node can load it).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Plain text with line breaks -> escaped paragraphs. */
export const paragraphs = (text) =>
  String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="mt-3">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** Only https URLs may become links or images: anything else is dropped. */
export const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
