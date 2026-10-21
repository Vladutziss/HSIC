import { tr } from "./i18n.js";
const RESCUE_PREFIX = tr("Revenire: ");

/** Returns one small, deterministic recovery step when momentum is at risk or just returned. */
export function rescueInfo(d, state, today) {
  const resetRisk = !!d?.resetRisk;
  const returning = d?.companion?.mood === "joy" && (d.companion.awayDays || 0) >= 2;
  if (!resetRisk && !returning) return null;

  const habit = (d?.scheduled || []).find(({ code }) => !code)?.h;
  const title = habit ? tr("{RESCUE_PREFIX}{name} - versiunea usoara", { RESCUE_PREFIX, name: habit.name }) : tr("{RESCUE_PREFIX}un pas de 5 minute", { RESCUE_PREFIX });
  const exists = (state?.todos || []).some((todo) => todo.date === today && !todo.done && todo.title === title);
  if (exists) return null;

  return {
    title,
    date: today,
    dur: habit ? 10 : 5,
    reason: resetRisk ? tr("Un pas mic azi poate opri seria de zile fara activitate.") : tr("Ai revenit dupa o pauza. Pastreaza ritmul cu un pas usor."),
    source: resetRisk ? "reset-risk" : "return",
  };
}
