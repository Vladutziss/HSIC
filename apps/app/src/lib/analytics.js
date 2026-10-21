import posthog from "posthog-js";

// PostHog, web build only (the artifact build stubs posthog-js and has __SUPABASE__=false).
// Without VITE_POSTHOG_PROJECT_TOKEN everything below is a no-op; dev builds say so once.
// the artifact build has no import.meta.env, so it is only read behind __SUPABASE__
const token = __SUPABASE__ ? import.meta.env.VITE_POSTHOG_PROJECT_TOKEN : "";
const on = __SUPABASE__ && !!token;

if (on) {
  posthog.init(token, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
    defaults: "2026-05-30",
  });
} else if (__SUPABASE__ && import.meta.env.DEV) {
  console.warn("VITE_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_PROJECT_TOKEN is configured");
}

/** Signed in: link events to the Clerk user id (id only, no email). */
export const identify = (id) => on && posthog.identify(id);

/** Signed out: start a new anonymous person, but only if someone was identified. */
export const resetIfIdentified = () => {
  if (on && posthog.get_property("$user_state") === "identified") posthog.reset();
};
