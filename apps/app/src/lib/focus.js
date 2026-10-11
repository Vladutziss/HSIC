// Focus sessions as a small state machine. All functions are pure and take `now` (ms), so the
// screen only has to call them on a timer and the rules can be tested.
//
// A session is a stopwatch of FOCUSED time: pauses and breaks never count towards it.
// With a pomodoro setting it alternates work and break phases by itself:
//   work -> (limit reached) -> break -> (limit reached) -> wait -> (player continues) -> work ...
// "wait" means the break is over and nothing counts until the player taps Continue, so stepping away
// during a break does not add focused time.
//
//   session = {
//     id, startedAt,
//     pomodoro: null | { work, brk },   // minutes
//     phase: "work" | "break" | "wait",
//     paused,                           // the running segment is stopped
//     segStart,                         // ms the running segment began, null while paused or waiting
//     phaseAcc,                         // ms already counted in this phase (closed segments)
//     workClosed, breakMs, cycles       // totals of finished phases
//   }

const KEY = "molted.focusSession";
const PREFS = "molted.focusPrefs";
const MIN = 60000;

export const PRESETS = [
  { id: "free", label: "Fără pauze", sub: "Cronometru simplu", pomodoro: null },
  { id: "p25", label: "Pomodoro", sub: "25 min lucru · 5 min pauză", pomodoro: { work: 25, brk: 5 } },
  { id: "p50", label: "Sesiune lungă", sub: "50 min lucru · 10 min pauză", pomodoro: { work: 50, brk: 10 } },
];
export const WORK_CHOICES = [15, 20, 25, 30, 45, 50, 60, 90];
export const BREAK_CHOICES = [3, 5, 10, 15, 20];
export const LONG_EVERY = 4; // every 4th break is a long one (3x)

export function newSession(now, pomodoro = null) {
  return {
    id: `f${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    startedAt: now,
    pomodoro: pomodoro ? { work: pomodoro.work, brk: pomodoro.brk } : null,
    phase: "work",
    paused: false,
    segStart: now,
    phaseAcc: 0,
    workClosed: 0,
    breakMs: 0,
    cycles: 0,
  };
}

/** Length in minutes of the break that follows `cycles` finished work phases. */
export const breakMinutes = (pomodoro, cycles) => (cycles > 0 && cycles % LONG_EVERY === 0 ? pomodoro.brk * 3 : pomodoro.brk);

const phaseMs = (s, now) => s.phaseAcc + (s.segStart != null ? Math.max(0, now - s.segStart) : 0);

/**
 * Applies the phase changes that are due at `now` (several can be, if the tab slept).
 * Returns { session, events } where events are "break" (a break just started) and "wait" (it just ended).
 */
export function advance(session, now) {
  let s = session;
  const events = [];
  if (!s.pomodoro) return { session: s, events };
  for (let guard = 0; guard < 50; guard++) {
    if (s.paused || s.segStart == null) break;
    if (s.phase === "work") {
      const limit = s.pomodoro.work * MIN;
      if (phaseMs(s, now) < limit) break;
      const at = s.segStart + (limit - s.phaseAcc); // the exact moment the limit was reached
      s = { ...s, phase: "break", phaseAcc: 0, segStart: at, workClosed: s.workClosed + limit, cycles: s.cycles + 1 };
      events.push("break");
    } else if (s.phase === "break") {
      const limit = breakMinutes(s.pomodoro, s.cycles) * MIN;
      if (phaseMs(s, now) < limit) break;
      s = { ...s, phase: "wait", phaseAcc: 0, segStart: null, breakMs: s.breakMs + limit };
      events.push("wait");
    } else break;
  }
  return { session: s, events };
}

export function pause(s, now) {
  if (s.paused || s.segStart == null) return s;
  return { ...s, paused: true, phaseAcc: phaseMs(s, now), segStart: null };
}
export function resume(s, now) {
  if (!s.paused || s.phase === "wait") return s;
  return { ...s, paused: false, segStart: now };
}

/** Back to work: skips what is left of a break, or continues after one has ended. */
export function continueWork(s, now) {
  if (s.phase === "work") return s;
  return { ...s, phase: "work", paused: false, phaseAcc: 0, segStart: now, breakMs: s.breakMs + (s.phase === "break" ? phaseMs(s, now) : 0) };
}

/** Focused ms so far. */
export const workMs = (s, now) => s.workClosed + (s.phase === "work" ? phaseMs(s, now) : 0);
/** What the screen needs besides the totals. */
export function view(s, now) {
  const inPhase = s.phase === "wait" ? 0 : phaseMs(s, now);
  const limitMs = !s.pomodoro || s.phase === "wait" ? 0 : (s.phase === "work" ? s.pomodoro.work : breakMinutes(s.pomodoro, s.cycles)) * MIN;
  return {
    phase: s.phase,
    paused: s.paused,
    work: workMs(s, now),
    inPhase,
    limitMs,
    remaining: limitMs ? Math.max(0, limitMs - inPhase) : 0,
    cycle: s.cycles + (s.phase === "work" ? 1 : 0), // the work phase in progress, or the one just finished
    longBreak: !!s.pomodoro && s.phase !== "work" && s.cycles % LONG_EVERY === 0,
  };
}

/** The record kept in the history. Null when there was less than a minute of focus. */
export function finish(session, now) {
  const { session: s } = advance(session, now);
  const work = workMs(s, now);
  if (work < MIN) return null;
  const breaks = s.breakMs + (s.phase === "break" ? phaseMs(s, now) : 0);
  const done = s.cycles + (s.phase === "work" && s.pomodoro && phaseMs(s, now) >= s.pomodoro.work * MIN ? 1 : 0);
  return {
    id: s.id,
    start: s.startedAt,
    end: now,
    work: Math.round(work / 1000), // seconds
    breaks: Math.round(breaks / 1000),
    cycles: s.pomodoro ? done : 0,
    pomodoro: s.pomodoro,
  };
}

// ------------------------------------------------------------ storage (a refresh must not lose the session)

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s && s.id && s.startedAt && s.phase ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* the session then just does not survive a reload */
  }
}
export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS) || "null") || {};
  } catch {
    return {};
  }
}
export function savePrefs(p) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ ...loadPrefs(), ...p }));
  } catch {
    /* fine */
  }
}

// ------------------------------------------------------------ history helpers

export const fmtClock = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
};
export const fmtMinSec = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
/** 3725 seconds -> "1 h 02 min"; under an hour -> "42 min". */
export function fmtSpan(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
