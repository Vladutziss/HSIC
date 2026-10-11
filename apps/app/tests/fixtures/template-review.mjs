// Seed demo text for tests/fixtures/history.mjs. It stands in for what the AI would have written
// in the generated history; the app itself no longer has written fallbacks (src/lib/ai.js).

export function templateReview(p, score) {
  const done = p.habits.filter((h) => h.done);
  const missed = p.habits.filter((h) => h.scheduled && !h.done);
  const names = (list) => list.map((h) => h.name.toLowerCase());
  const join = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} și ${arr[arr.length - 1]}`);
  if (score >= 85) {
    return {
      summary: `Ai bifat aproape tot ce ți-ai propus azi. Ziua asta adaugă serios la momentum.`,
      highlight: "Toate misiunile duse la capăt",
      tip: `Păstrează aceeași oră pentru ${(done[0]?.name || "misiunile tale").toLowerCase()} și mâine.`,
    };
  }
  if (score >= 55) {
    return {
      summary: `Ai făcut cea mai mare parte din plan: ${join(names(done.slice(0, 3)))}. ${missed.length ? `${missed[0].name} rămâne pe mâine, fără grabă.` : "Restul a fost opțional."}`,
      highlight: `${done[0]?.name || "Ziua"} bifat`,
      tip: missed.length ? `Mâine, începe ziua cu ${missed[0].name.toLowerCase()}, cât ai energie.` : "Mâine, încearcă să bifezi o misiune în plus.",
    };
  }
  if (score >= 25) {
    return {
      summary: `Ai pornit motorul azi cu ${join(names(done.slice(0, 2))) || "câteva lucruri mici"}. Și pașii mici țin focul aprins.`,
      highlight: "Ai pornit, și asta contează",
      tip: "Alege o singură misiune ușoară pentru mâine dimineață și fă-o prima.",
    };
  }
  const easiest = [...p.habits].sort((a, b) => a.diff - b.diff)[0];
  return {
    summary: "Azi a fost o zi liniștită. Mâine e o pagină nouă, iar personajul tău te așteaptă.",
    highlight: "O zi de odihnă",
    tip: `Începe mâine cu cea mai ușoară misiune${easiest ? `: ${easiest.name.toLowerCase()}` : ""}.`,
  };
}
