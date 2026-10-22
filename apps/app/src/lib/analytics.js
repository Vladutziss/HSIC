import posthog from "posthog-js";

// PostHog, web build only (the artifact build stubs posthog-js and has __SUPABASE__=false).
// Without VITE_POSTHOG_PROJECT_TOKEN everything below is a no-op; dev builds say so once.
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const on = __SUPABASE__ && !!token;

// Analytics need the player's consent (Legea 506/2004): nothing is captured or stored until they accept.
const KEY = "molted.consent";
const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < 365 * 864e5 ? v.analytics : null; // asked again after 12 months
  } catch {
    return null;
  }
};

/** true = accepted, false = declined, null = not asked yet (or the choice expired). */
export const getConsent = () => read();
/** The banner only exists where analytics can run at all. */
export const analyticsAvailable = on;

export const setConsent = (analytics) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics, at: Date.now() }));
  } catch {
    // private window: the choice lasts until the page closes
  }
  if (on) analytics ? posthog.opt_in_capturing() : posthog.opt_out_capturing();
  window.dispatchEvent(new Event("molted:consent"));
};

if (on) {
  posthog.init(token, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
    defaults: "2026-05-30",
    opt_out_capturing_by_default: true,
    loaded: (ph) => read() === true && ph.opt_in_capturing(),
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
