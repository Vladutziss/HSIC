import { defineConfig } from "vite";

// Static landing for molted.eu: plain HTML + Tailwind (same design tokens as the app, via @molted/ui).
// envDir: the Supabase and Clerk keys come from the repo-root .env.local, like the app's.
export default defineConfig({
  envDir: "../..",
  build: { rollupOptions: { input: { main: "index.html", admin: "admin.html" } } },
});
