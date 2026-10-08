import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// envDir: .env.local stays at the repo root. base "./" lets the built app run from any folder or static host.
// __SUPABASE__ switches the Supabase backend on; the artifact build sets it to false.
export default defineConfig({ base: "./", envDir: "../..", plugins: [react()], define: { __SUPABASE__: "true" } });
