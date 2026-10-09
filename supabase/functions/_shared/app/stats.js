// Everything the Statistici screen shows, as one JSON-safe object. Runs in the
// `stats` Edge Function (supabase/functions/stats) and, as a fallback, in the
// browser (artifact build, signed out, function unreachable).

import { computeTimeline, evolutionPoints, streakInfo } from "./engine.js";

export function buildStats(state, today) {
  const t = computeTimeline(state, today);
  const last30 = t.days.filter((x) => x.closed).slice(-30);
  return {
    today,
    days: t.days,
    habitSeries: t.habitSeries,
    resets: t.resets,
    bestMomentum: t.bestMomentum,
    bestLevel: t.bestLevel,
    resetAfter: t.resetAfter,
    streak: streakInfo(state, today),
    checkins: Object.values(state.log || {}).reduce((a, e) => a + Object.keys(e).length, 0),
    evolution: evolutionPoints(state),
    avg: last30.length ? Math.round(last30.reduce((a, x) => a + x.score, 0) / last30.length) : 0,
  };
}
