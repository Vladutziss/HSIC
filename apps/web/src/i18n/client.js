// Strings used by the browser scripts (team.js, main.js). Kept apart from the build-time dictionaries so the pages
// only ship what they use. The locale comes from <html lang>.
const STRINGS = {
  ro: {
    numberLocale: "ro-RO",
    teamNotConfigured: "Pagina nu e configurată încă.",
    teamLoadError: "Nu am putut încărca echipa. Încearcă din nou mai târziu.",
    improvedPending: "în curs",
    improvedOf: (a, b) => `${a} din ${b}`,
  },
  en: {
    numberLocale: "en-US",
    teamNotConfigured: "This page is not configured yet.",
    teamLoadError: "We could not load the team. Please try again later.",
    improvedPending: "in progress",
    improvedOf: (a, b) => `${a} of ${b}`,
  },
};

export const locale = document.documentElement.lang === "en" ? "en" : "ro";
export const S = STRINGS[locale];
