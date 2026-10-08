// The Supabase client, shared by the whole app. The same project serves the
// web app and (later) the Flutter app.
//
// __SUPABASE__ is set by the bundler: true for the normal web build (vite.config.js),
// false for the claude.ai artifact build, where this whole file's body is dropped
// from the bundle and the app keeps using the artifact runtime.

let clientPromise = null;

/** Resolves to the client, or null when Supabase is off (artifact build, or no env configured). */
export function getClient() {
  // the condition is a literal after bundling, so esbuild drops the import and import.meta below
  if (__SUPABASE__) {
    clientPromise ||= import("@supabase/supabase-js").then(({ createClient }) => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return null;
      return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    });
  }
  return clientPromise || Promise.resolve(null);
}

const signed = new Map(); // storage path -> {url, until}

/** A temporary URL for a private proof file (path as stored in proofs.asset_path). */
export async function signedUrl(path) {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client.storage.from("proofs").createSignedUrl(path, 3600);
  if (error || !data) return null;
  signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
