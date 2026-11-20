// Plans of Molted, shared by the app (Settings) and the landing (/pricing). No payment provider: a plan is granted to
// an account with a code or by an admin (supabase/migrations/0041_plans.sql). The AI factor must equal the one in
// bump_ai_usage(); apps/app/tests/plan.test.mjs checks it against the migration.
// Prices are working hypotheses of the team, in EUR, shown as "by arrangement" until a plan is actually sold.

export const PLAN_IDS = ["free", "pro", "school"];

export const PLANS = {
  free: { id: "free", aiFactor: 1, eurMonth: 0, eurYear: 0 },
  pro: { id: "pro", aiFactor: 3, eurMonth: 3, eurYear: 25 },
  // per active student per month, minimum 100 students, one code per school (max_uses = number of seats)
  school: { id: "school", aiFactor: 2, eurPerStudentMonth: 1, minStudents: 100 },
};

export const isPlan = (id) => PLAN_IDS.includes(id);

/** What the database returns from my_plan(): anything unknown or an ended grant is free. */
export function normalizePlan(row, now = Date.now()) {
  const id = isPlan(row?.plan) ? row.plan : "free";
  const until = row?.until ? new Date(row.until).getTime() : null;
  if (id !== "free" && (until === null || Number.isNaN(until) || until <= now)) return { plan: "free", until: null };
  return { plan: id, until: id === "free" ? null : new Date(until).toISOString() };
}

/** Codes are stored upper-case, 4 to 40 characters of A-Z, 0-9 and "-". Returns the clean code, or null. */
export function cleanCode(input) {
  const c = String(input ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{4,40}$/.test(c) ? c : null;
}

// Roles (0042_roles.sql). A school's class panel shows nothing below this many students; the migration has the same
// number and apps/app/tests/plan.test.mjs keeps them equal.
export const SCHOOL_ROLES = ["admin", "teacher", "student"];
export const PANEL_MIN_STUDENTS = 5;
