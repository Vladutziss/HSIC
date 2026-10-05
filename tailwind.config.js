/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0c0a1d",
        deep: "#110e27",
        panel: { DEFAULT: "#1a1636", hi: "#221d45", lo: "#15122d" },
        edge: { DEFAULT: "#2e2860", hi: "#463c8c" },
        ink: "#f3efff",
        body: "#cfc8f0",
        dim: "#9a91c9",
        faint: "#6d64a3",
        gold: { DEFAULT: "#ffc542", hi: "#ffd978", deep: "#a8740a" },
        violet: { DEFAULT: "#8f6bff", hi: "#b19bff", deep: "#5435c9" },
        mint: { DEFAULT: "#3fe0a5", deep: "#1a9e6f" },
        ember: "#ff7b47",
        sky: "#5cb8ff",
        rose: "#ff5f87",
      },
      fontFamily: {
        sans: ["Nunito", "ui-rounded", "system-ui", "Segoe UI", "sans-serif"],
        pixel: ['"Pixelify Sans"', "Nunito", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
