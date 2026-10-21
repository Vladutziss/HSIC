import { defineConfig } from "vite";
import { writeSite } from "./scripts/generate.mjs";

// Static site for molted.eu: plain HTML + Tailwind (same design tokens as the app, via @molted/ui).
// The localized pages (/ro, /en) and the sitemap are generated from src/i18n/routes.js and the dictionaries every time
// the config loads (dev server and build), then Vite bundles them like hand-written pages.
// envDir: the Supabase and Clerk keys come from the repo-root .env.local, like the app's.
const generated = writeSite().filter((f) => f.file.endsWith(".html"));
const input = { admin: "admin.html" };
for (const f of generated) input[f.file.replace(/\.html$/, "").replace(/\//g, "_")] = f.file;

export default defineConfig({
  envDir: "../..",
  build: { rollupOptions: { input } },
});
