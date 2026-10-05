import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built app run from any folder or static host
export default defineConfig({ base: "./", plugins: [react()] });
