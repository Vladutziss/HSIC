// Roles around the plan: a school (admin, teacher, student) and the family link (a parent sees two numbers about a
// student who invited them). Rules, tables and the 5-student minimum of the class panel: supabase/migrations/0042_roles.sql.
// Nothing runs in the artifact build (no client): every read then answers null.

import { getClient } from "./supabase.js";

async function call(name, args) {
  const client = await getClient();
  if (!client) return { offline: true };
  const { data, error } = await client.rpc(name, args);
  if (error) return { error: String(error.message || "failed") };
  return { data };
}
const first = (d) => (Array.isArray(d) ? d[0] ?? null : d ?? null);

/** { name, role, seats, until, students } or null (no school, offline). */
export async function getSchool() {
  const r = await call("my_school");
  return r.data ? first(r.data) : null;
}

/** { students, active7, checkins7, hidden } for an admin or a teacher, else null. */
export async function getSchoolPanel() {
  const r = await call("school_panel");
  return r.data ? first(r.data) : null;
}

export async function listSchoolCodes() {
  const r = await call("school_list_codes");
  return Array.isArray(r.data) ? r.data : [];
}

/** Returns the new code, or throws Error("seats" | "failed"). */
export async function createSchoolCode({ label, role, maxUses, days }) {
  const r = await call("school_create_code", { p_label: label, p_role: role, p_max_uses: maxUses, p_days: days });
  if (r.error) throw new Error(/seats/.test(r.error) ? "seats" : "failed");
  if (!r.data) throw new Error("failed");
  return r.data;
}

export async function createFamilyInvite() {
  const r = await call("family_create_invite");
  if (r.error || !r.data) throw new Error(/too many/.test(r.error || "") ? "too_many" : "failed");
  return r.data;
}

/** The student's name, or throws Error("invalid") for an unknown, expired or own code. */
export async function joinFamily(code) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(c)) throw new Error("invalid");
  const r = await call("family_join", { p_code: c });
  if (r.error) throw new Error("failed");
  if (!r.data) throw new Error("invalid");
  return r.data;
}

export async function getFamilySummary() {
  const r = await call("family_summary");
  return Array.isArray(r.data) ? r.data : [];
}

/** [{ other_id, other_name, kind: "parent" | "student" }] */
export async function getFamilyLinks() {
  const r = await call("family_mine");
  return Array.isArray(r.data) ? r.data : [];
}

export async function unlinkFamily(otherId) {
  const r = await call("family_unlink", { p_other: otherId });
  if (r.error) throw new Error("failed");
}
