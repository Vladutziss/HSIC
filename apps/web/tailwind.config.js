import preset from "@molted/ui/tailwind-preset.js";

/** @type {import('tailwindcss').Config} */
export default { presets: [preset], content: ["./*.html", "./admin/**/*.html", "./ro/**/*.html", "./en/**/*.html", "./src/**/*.js"], plugins: [] };
