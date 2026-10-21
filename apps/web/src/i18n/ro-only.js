// Copy for Romania-only features (giveaways). It lives apart from ro.js/en.js on purpose: those two must have the same
// keys, and a feature that exists only under /ro has no English text to keep in step. Nothing here ever reaches /en.
const OG_ALT = "Molt, personajul din Molted, în cinci stadii: ou, pui, ucenic, adept și maestru.";

export default {
  common: { giveaways: "Giveaway-uri" },
  meta: {
    giveaways: {
      title: "Giveaway-uri Molted",
      description: "Campaniile de giveaway Molted din România: premii, condiții de participare, regulamente oficiale și câștigători.",
      ogTitle: "Giveaway-uri Molted",
      ogDescription: "Campaniile de giveaway Molted din România: premii, condiții de participare și regulamente oficiale.",
      ogImageAlt: OG_ALT,
    },
    // the shared shell of every campaign page: the browser replaces these with the campaign's own title and text
    giveaway: {
      title: "Giveaway · Molted",
      description: "Detaliile unei campanii de giveaway Molted din România: premiul, condițiile de participare și regulamentul oficial.",
      ogTitle: "Giveaway · Molted",
      ogDescription: "Detaliile unei campanii de giveaway Molted din România.",
      ogImageAlt: OG_ALT,
    },
  },
  giveaways: {
    h1: "Giveaway-uri",
    lead: "Campaniile Molted din România. Citește regulamentul fiecăreia înainte să participi: premiile, datele și condițiile sunt acolo.",
    loading: "Se încarcă campaniile…",
  },
  giveaway: { loading: "Se încarcă campania…" },
};
