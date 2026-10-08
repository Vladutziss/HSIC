// Account actions for the Supabase build: sign out, export, delete.

import { getClient } from "./supabase.js";
import { removeAllFiles } from "./store.js";

const TABLES = ["profiles", "habits", "completions", "day_reviews", "todos", "proofs", "chapters", "streak_revives"];

export async function signOut() {
  const client = await getClient();
  await client?.auth.signOut();
}

/** Everything the database holds about the signed-in user, as one JSON-able object. */
export async function exportData(env) {
  const e = env.current;
  const out = { exportedAt: new Date().toISOString(), userId: e.uid };
  for (const t of TABLES) {
    const { data, error } = await e.client.from(t).select("*");
    if (error) throw error;
    out[t] = data;
  }
  return out;
}

/** Removes the stored files, then the account and (by cascade) every row. */
export async function deleteAccount(env) {
  const e = env.current;
  await removeAllFiles(e);
  const { error } = await e.client.rpc("delete_my_account");
  if (error) throw error;
  await e.client.auth.signOut();
}
