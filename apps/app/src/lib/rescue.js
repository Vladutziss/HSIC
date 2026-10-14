const RESCUE_PREFIX = "Revenire: ";

/** Returns one small, deterministic recovery step when momentum is at risk or just returned. */
export function rescueInfo(d, state, today) {
  const resetRisk = !!d?.resetRisk;
  const returning = d?.companion?.mood === "joy" && (d.companion.awayDays || 0) >= 2;
  if (!resetRisk && !returning) return null;

  const habit = (d?.scheduled || []).find(({ code }) => !code)?.h;
  const title = habit ? `${RESCUE_PREFIX}${habit.name} - versiunea usoara` : `${RESCUE_PREFIX}un pas de 5 minute`;
  const exists = (state?.todos || []).some((todo) => todo.date === today && !todo.done && todo.title === title);
  if (exists) return null;

  return {
    title,
    date: today,
    dur: habit ? 10 : 5,
    reason: resetRisk ? "Un pas mic azi poate opri seria de zile fara activitate." : "Ai revenit dupa o pauza. Pastreaza ritmul cu un pas usor.",
    source: resetRisk ? "reset-risk" : "return",
  };
}
