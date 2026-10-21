// Key moments: momentum reset or drop, coming back, hatching, evolving,
// a new level, streak milestones. Each one is shown once, with a quote.

import { diffDays } from "./dates.js";
import { momentumDrop } from "./engine.js";
import { tr } from "./i18n.js";

export const STREAK_MARKS = [3, 7, 14, 30, 60, 100, 200, 365];
const ORDER = ["reset", "return", "hatch", "evolve", "levelup", "streak", "drop"];

export const MOMENT_META = {
  reset: { title: tr("Momentum-ul pornește din nou"), tone: "rose" },
  drop: { title: tr("Momentum-ul încetinește"), tone: "ember" },
  return: { title: tr("Bine ai revenit!"), tone: "mint" },
  hatch: { title: tr("Oul s-a deschis!"), tone: "gold" },
  evolve: { title: tr("Molt-ul tău a evoluat"), tone: "gold" },
  levelup: { title: tr("Nivel nou de momentum"), tone: "gold" },
  streak: { title: tr("Serie nouă"), tone: "ember" },
};

const markFor = (n) => STREAK_MARKS.filter((m) => m <= n).pop() || 0;

export function snapshot({ timeline, companion, streak, today }) {
  return {
    day: today,
    peak: timeline.level.lvl,
    resets: timeline.resets.length,
    stage: companion.stageIndex,
    streakMark: markFor(streak.current),
    returnDay: null,
    dropDay: null,
  };
}

/**
 * Compares the derived state with what the player has already seen.
 * Returns the new moments (most important first) and the updated "seen" record.
 */
export function detectMoments({ seen, timeline, companion, streak, today }) {
  if (!seen) return { moments: [], seen: snapshot({ timeline, companion, streak, today }) };
  const out = [];
  const next = { ...seen, day: today };
  const lvl = timeline.level;

  if (timeline.resets.length > (seen.resets || 0)) {
    out.push({ type: "reset", day: timeline.resets[timeline.resets.length - 1] });
    next.resets = timeline.resets.length;
    next.peak = lvl.lvl;
  }
  if (companion.mood === "joy" && (companion.awayDays || 0) >= 2 && seen.returnDay !== today) {
    out.push({ type: "return", away: companion.awayDays });
    next.returnDay = today;
  }
  if (companion.stageIndex > (seen.stage ?? 0)) {
    out.push({ type: (seen.stage ?? 0) === 0 ? "hatch" : "evolve", stage: companion.stage.name, stageIndex: companion.stageIndex });
  }
  next.stage = Math.max(seen.stage ?? 0, companion.stageIndex);

  if (lvl.lvl > (next.peak ?? 1)) {
    out.push({ type: "levelup", lvl: lvl.lvl, name: lvl.name });
    next.peak = lvl.lvl;
  }

  const mark = markFor(streak.current);
  if (mark > (seen.streakMark || 0)) out.push({ type: "streak", n: mark });
  next.streakMark = streak.current < (seen.streakMark || 0) ? mark : Math.max(mark, seen.streakMark || 0);

  const drop = momentumDrop(timeline);
  if (drop && !out.some((m) => m.type === "reset") && (!seen.dropDay || diffDays(seen.dropDay, today) >= 7)) {
    out.push({ type: "drop", from: drop.from, to: drop.to });
    next.dropDay = today;
  }

  out.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  return { moments: out.slice(0, 2), seen: next };
}

/** Plain-language situation for the AI prompt. */
export function momentSituation(m, { name, resetAfter = 3 }) {
  switch (m.type) {
    case "reset":
      return `the player was inactive for ${resetAfter} days, so their momentum reset to zero; their companion ${name} is waiting`;
    case "drop":
      return `the player's momentum fell from ${m.from} to ${m.to} over the last three days`;
    case "return":
      return `the player came back after ${m.away} days away; their companion ${name} woke up happy`;
    case "hatch":
      return "the player's first check-ins hatched their companion's egg";
    case "evolve":
      return `the player's companion ${name} evolved to the ${m.stage} stage thanks to their check-ins`;
    case "levelup":
      return `the player reached momentum level ${m.lvl} (${m.name})`;
    case "streak":
      return `the player has been active ${m.n} days in a row`;
    default:
      return "a key moment";
  }
}
