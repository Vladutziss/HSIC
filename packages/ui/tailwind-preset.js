/** Shared Molted design tokens (colors, fonts) for the app and the landing. @type {import('tailwindcss').Config} */

// Colours are CSS variables (see the theme blocks in packages/ui/base.css and apps/app/src/styles.css), so one build
// serves every theme. <alpha-value> keeps opacity classes like bg-gold/10 working.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  theme: {
    extend: {
      colors: {
        night: c("night"),
        deep: c("deep"),
        panel: { DEFAULT: c("panel"), hi: c("panel-hi"), lo: c("panel-lo") },
        edge: { DEFAULT: c("edge"), hi: c("edge-hi") },
        well: c("well"), // inputs and inset areas
        mark: c("mark"), // muted outline (missed days, "no AI" bars)
        key: c("key"), // bottom edge of ghost buttons and switches
        scrim: c("scrim"), // modal backdrop
        ink: c("ink"),
        body: c("body"),
        dim: c("dim"),
        faint: c("faint"),
        gold: { DEFAULT: c("gold"), hi: c("gold-hi"), deep: c("gold-deep"), ink: c("gold-ink") },
        violet: { DEFAULT: c("violet"), hi: c("violet-hi"), deep: c("violet-deep"), ink: c("violet-ink") },
        mint: { DEFAULT: c("mint"), deep: c("mint-deep"), ink: c("mint-ink") },
        ember: { DEFAULT: c("ember"), ink: c("ember-ink") },
        sky: { DEFAULT: c("sky"), ink: c("sky-ink") },
        rose: { DEFAULT: c("rose"), ink: c("rose-ink") },
        on: { gold: c("on-gold"), violet: c("on-violet"), mint: c("on-mint"), rose: c("on-rose") },
      },
      boxShadow: {
        // the "3D" bottom edge on chunky toggles and tabs
        "key-gold": "0 3px 0 rgb(var(--c-gold-deep))",
        "key-gold-sm": "0 2px 0 rgb(var(--c-gold-deep))",
        "key-gold-lg": "0 4px 0 rgb(var(--c-gold-deep))",
        "key-mint": "0 3px 0 rgb(var(--c-mint-key))",
        "key-ghost": "0 3px 0 rgb(var(--c-key))",
      },
      fontFamily: {
        sans: ["Nunito", "ui-rounded", "system-ui", "Segoe UI", "sans-serif"],
        pixel: ['"Pixelify Sans"', "Nunito", "ui-monospace", "monospace"],
      },
    },
  },
};
