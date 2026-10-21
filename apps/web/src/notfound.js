// 404.html is shared by both languages: show the English block when the missing URL was under /en/.
const lang = location.pathname.startsWith("/en/") || location.pathname === "/en" ? "en" : "ro";
for (const el of document.querySelectorAll("[data-lang]")) el.hidden = el.dataset.lang !== lang;
document.documentElement.lang = lang;
if (lang === "en") document.title = "Page not found · Molted";
