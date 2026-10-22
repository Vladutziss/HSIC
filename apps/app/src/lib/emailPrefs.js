// Emails from Molted, client side: keeps the server's copy of the address and "last seen" time fresh, and reads and
// writes the opt-in. The rules and the tables are in supabase/migrations/0032_email.sql. Nothing runs in the artifact build.

import { getClient } from "./supabase.js";

const KEY = "molted.emailSync";

/**
 * After sign-in, at most once a day per device and account. The address is read by the database from the session
 * token. `user.unsafeMetadata.legal.emails` is the box ticked on the sign-up form; the server uses it only when it
 * creates the row, so a choice made later in Settings is never overwritten.
 */
export async function syncEmailProfile(client, user) {
  const today = new Date().toISOString().slice(0, 10);
  const mark = `${user.id}:${today}`;
  try {
    if (window.localStorage.getItem(KEY) === mark) return;
  } catch {
    // private window: it just syncs again next time
  }
  const chosen = user.unsafeMetadata?.legal?.emails;
  const { error } = await client.rpc("sync_email_profile", { p_marketing: typeof chosen === "boolean" ? chosen : null });
  if (error) return;
  try {
    window.localStorage.setItem(KEY, mark);
  } catch {
    // nothing to remember
  }
}

/** true | false, or null when it cannot be read (offline, artifact build). */
export async function getMarketingEmails() {
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client.rpc("my_marketing_emails");
  return error || typeof data !== "boolean" ? null : data;
}

export async function setMarketingEmails(enabled) {
  const client = await getClient();
  if (!client) throw new Error("offline");
  const { error } = await client.rpc("set_marketing_emails", { p_enabled: !!enabled });
  if (error) throw error;
}
