// Account actions for the web build: sign out, export, delete. The session is Clerk's.

const TABLES = ["profiles", "habits", "completions", "day_reviews", "todos", "chapters", "streak_revives"];

export async function signOut() {
  await window.Clerk?.signOut();
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

/** Removes every row (by cascade from the profile), then the Clerk user. */
export async function deleteAccount(env) {
  const e = env.current;
  const { error } = await e.client.rpc("delete_my_account");
  if (error) throw error;
  await window.Clerk?.user?.delete();
}
