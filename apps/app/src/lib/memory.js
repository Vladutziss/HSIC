// Memory of the coach agent: notes the player writes (user_context) and feedback on proposals
// (proposal_feedback). Pure helpers first; the data layer takes a supabase-js client as argument.
// Errors are thrown as {code}: invalid_note | context_limit | unavailable | db_error.

export const KINDS = ["event", "constraint", "preference", "note"];
export const MAX_BODY = 300;
export const MAX_NOTES = 50;
const MAX_CONTEXT = 20;
const MAX_REASON = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (s) => typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
// eslint-disable-next-line no-control-regex
const stripControl = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();

/** Validated row fields for user_context, or throws {code:"invalid_note"}. */
export function cleanNote({ kind, body, startsOn, endsOn } = {}) {
  const text = stripControl(body).slice(0, MAX_BODY).trim();
  if (!text || !KINDS.includes(kind)) throw { code: "invalid_note" };
  const s = startsOn || null;
  const e = endsOn || null;
  if ((s && !isDate(s)) || (e && !isDate(e)) || (s && e && e < s)) throw { code: "invalid_note" };
  return { kind, body: text, starts_on: s, ends_on: e };
}

const activeOn = (r, today) => (!r.starts_on || r.starts_on <= today) && (!r.ends_on || r.ends_on >= today);

/** Rows in force on `today` (YYYY-MM-DD), newest first, at most 20. */
export function activeContext(rows, today) {
  return (rows || [])
    .filter((r) => activeOn(r, today))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, MAX_CONTEXT);
}

/** Compact picture of what the player turned down, for the agent prompt. */
export function summarizeFeedback(rows) {
  const out = { accepted: 0, rejected: 0, rejectedByAction: {}, rejectedByDays: {}, lastReasons: [] };
  const sorted = [...(rows || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  for (const r of sorted) {
    if (r.decision === "accepted") out.accepted++;
    if (r.decision !== "rejected") continue;
    out.rejected++;
    const action = r.proposal?.action || "unknown";
    out.rejectedByAction[action] = (out.rejectedByAction[action] || 0) + 1;
    if (Array.isArray(r.proposal?.days) && r.proposal.days.length) {
      const key = [...r.proposal.days].sort((x, y) => x - y).join(",");
      out.rejectedByDays[key] = (out.rejectedByDays[key] || 0) + 1;
    }
    const why = stripControl(r.reason);
    if (why && out.lastReasons.length < 5) out.lastReasons.push(why);
  }
  return out;
}

// ------------------------------------------------------------ data layer

function need(client) {
  if (!client) throw { code: "unavailable" };
  return client;
}
function fail(error) {
  throw { code: /context_limit/.test(error?.message || "") ? "context_limit" : "db_error" };
}

/** Own notes, newest first. RLS limits the rows to the signed-in user. */
export async function loadNotes(client) {
  const { data, error } = await need(client).from("user_context").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) fail(error);
  return data || [];
}

/**
 * Adds a note for the signed-in user (user_id defaults to the JWT subject in the database).
 * The cap of 50 active notes is checked here and again by the database trigger.
 */
export async function addNote(client, note, today = new Date().toISOString().slice(0, 10)) {
  const c = need(client);
  const row = cleanNote(note);
  const existing = await loadNotes(c);
  if (existing.filter((r) => !r.ends_on || r.ends_on >= today).length >= MAX_NOTES) throw { code: "context_limit" };
  const { data, error } = await c.from("user_context").insert(row).select().single();
  if (error) fail(error);
  return data;
}

export async function removeNote(client, id) {
  if (!id) throw { code: "invalid_note" };
  const { error } = await need(client).from("user_context").delete().eq("id", id);
  if (error) fail(error);
}

/** Logs what the player did with one proposal. `proposal` is stored as shown. */
export async function recordFeedback(client, { proposal, decision, reason } = {}) {
  if (!proposal || typeof proposal !== "object" || !["accepted", "rejected"].includes(decision)) throw { code: "invalid_note" };
  const c = need(client);
  const why = stripControl(reason).slice(0, MAX_REASON) || null;
  const row = { proposal, decision, reason: why };
  const { error } = await c.from("proposal_feedback").insert(row);
  if (error) fail(error);
}
