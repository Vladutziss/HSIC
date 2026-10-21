// History of Molt's single-shot abilities (table ai_results): what each one answered, kept per account so a result
// survives a refresh or a change of page. Best effort everywhere: the answer on screen never depends on it.

export const KINDS = ["day", "school", "week", "goal", "patterns"];

const map = (r) => ({ id: r.id, kind: r.kind, label: r.label || "", data: r.data, createdAt: r.created_at });

/** Newest first. */
export async function loadResults(client, kind, limit = 20) {
  if (!client) return [];
  const { data, error } = await client.from("ai_results").select("id,kind,label,data,created_at").eq("kind", kind).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(map);
}

export async function saveResult(client, kind, label, data) {
  if (!client) return null;
  const { data: row, error } = await client.from("ai_results").insert({ kind, label: String(label || "").slice(0, 200), data }).select("id,kind,label,data,created_at").single();
  if (error) throw error;
  return map(row);
}

export async function removeResult(client, id) {
  if (!client) return;
  const { error } = await client.from("ai_results").delete().eq("id", id);
  if (error) throw error;
}
