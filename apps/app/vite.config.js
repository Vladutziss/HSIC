import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// envDir: .env.local stays at the repo root. base "./" lets the built app run from any folder or static host.
// __SUPABASE__ switches the Supabase backend on; the artifact build sets it to false.
// Source maps go to Sentry only when SENTRY_AUTH_TOKEN is set (CI / Vercel); they are deleted from dist after upload.
const sentry = process.env.SENTRY_AUTH_TOKEN
  ? [sentryVitePlugin({ org: "molted", project: "molted-app", authToken: process.env.SENTRY_AUTH_TOKEN, sourcemaps: { filesToDeleteAfterUpload: "./dist/**/*.map" } })]
  : [];

export default defineConfig({
  base: "./",
  envDir: "../..",
  plugins: [react(), ...sentry],
  define: { __SUPABASE__: "true" },
  build: { sourcemap: "hidden" },
});
