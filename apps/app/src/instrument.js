import * as Sentry from "@sentry/react";

// Importat primul în main.jsx. Artifact-ul (__SUPABASE__=false) nu trimite nimic.
if (__SUPABASE__ && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  });
}
