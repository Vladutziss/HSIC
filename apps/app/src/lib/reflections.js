// Weekly reflection history (table reflections): append-only, the player's own rows (RLS).
// Errors are thrown as {code}: unavailable | db_error.

/** reflections row -> camelCase. */
export function mapRow(r) {
  return {
    id: r.id,
    week: r.week,
    answer: r.answer,
    observation: r.observation,
    nextStep: r.next_step,
    dataUsed: Array.isArray(r.data_used) ? r.data_used : [],
    confidence: r.confidence || "unknown",
    createdAt: r.created_at,
  };
}

/** ISO week of a YYYY-MM-DD day, e.g. "2026-W41". */
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd); // the Thursday of this week decides the year
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function need(client) {
  if (!client) throw { code: "unavailable" };
  return client;
}

/** Newest first. */
export async function load(client, { limit = 5 } = {}) {
  const { data, error } = await need(client).from("reflections").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw { code: "db_error" };
  return (data || []).map(mapRow);
}

/** Appends one reflection; returns the mapped row. `r` = {week, answer, observation, nextStep, dataUsed, confidence}. */
export async function save(client, r) {
  const row = {
    week: r.week,
    answer: r.answer,
    observation: r.observation,
    next_step: r.nextStep,
    data_used: r.dataUsed || [],
    confidence: r.confidence || "unknown",
  };
  const { data, error } = await need(client).from("reflections").insert(row).select().single();
  if (error || !data) throw { code: "db_error" };
  return mapRow(data);
}
