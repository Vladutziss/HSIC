// The Supabase client, shared by the whole app. Sign-in is Clerk's. The same project serves the
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
      const url = import.meta.env.VITE_SUPABASE_URL?.trim();
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(); // a pasted env value can carry a trailing newline
      if (!url || !key) return null;
      // Clerk owns the session; Supabase just forwards its token (third-party auth), so client.auth is unused
      return createClient(url, key, { accessToken: async () => (await window.Clerk?.session?.getToken()) ?? null });
    });
  }
  return clientPromise || Promise.resolve(null);
}

