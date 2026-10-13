// Chat history (table chat_messages): the player's own rows (RLS), append + clear.
// Errors are thrown as {code}: unavailable | db_error.

const KEY = "molted.chat";
const KEEP = 40;

/** chat_messages row -> {id, role, content, plan, createdAt}. */
export function mapRow(r) {
  return { id: r.id, role: r.role, content: r.content, plan: r.plan ?? null, createdAt: r.created_at };
}

function need(client) {
  if (!client) throw { code: "unavailable" };
  return client;
}

/** The last `limit` messages, oldest first (display order). */
export async function load(client, { limit = KEEP } = {}) {
  const { data, error } = await need(client).from("chat_messages").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw { code: "db_error" };
  return (data || []).map(mapRow).reverse();
}

/** Appends one message; returns the mapped row. */
export async function append(client, { role, content, plan = null }) {
  const { data, error } = await need(client).from("chat_messages").insert({ role, content, plan }).select().single();
  if (error || !data) throw { code: "db_error" };
  return mapRow(data);
}

/** Deletes the whole conversation (RLS limits it to the player's rows). */
export async function clear(client) {
  // PostgREST refuses a delete without a filter; id is never null, so this matches all own rows.
  const { error } = await need(client).from("chat_messages").delete().not("id", "is", null);
  if (error) throw { code: "db_error" };
}

/** Local fallback (artifact / no Supabase). */
export function loadLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v.slice(-KEEP) : [];
  } catch {
    return [];
  }
}

export function saveLocal(messages) {
  try {
    localStorage.setItem(KEY, JSON.stringify((messages || []).slice(-KEEP)));
  } catch {
    /* storage blocked: the chat just isn't remembered */
  }
}
