// Colour themes. The palettes themselves live in src/styles.css ([data-theme="..."] blocks);
// this file only lists them for the picker and switches the active one.
//
// To add a theme: add a block in styles.css and an entry below.

import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "noapte", name: "Noapte", mode: "dark", blurb: "Violet închis, cu accente aurii. Tema originală." },
  { id: "pergament", name: "Pergament", mode: "light", blurb: "Crem cald, salvie și miere, text maro închis." },
  { id: "piersica", name: "Piersică", mode: "light", blurb: "Unt, piersică și roz pal, text roșu-brun." },
  { id: "padure", name: "Pădure", mode: "dark", blurb: "Verde-închis, cu accente de salvie. Calm și contrastat." },
  { id: "grafit", name: "Grafit", mode: "dark", blurb: "Gri închis neutru, fără stele. Simplu și sobru." },
  { id: "ceata", name: "Ceață", mode: "light", blurb: "Gri deschis și alb, accente discrete." },
  { id: "cod", name: "Cod", mode: "dark", blurb: "Ca VS Code Dark+: #1E1E1E, albastru și turcoaz." },
  { id: "nord", name: "Nord", mode: "dark", blurb: "Gri-albastru arctic, culori pastelate." },
  { id: "lavanda", name: "Lavandă", mode: "light", blurb: "Paletă pastel de pe Color Hunt: lavandă și liliac." },
];

export const DEFAULT_THEME = "noapte";
const KEY = "molted.theme"; // stored as "<id>:<mode>", read by the inline script in index.html too

const byId = (id) => THEMES.find((t) => t.id === id);
const listeners = new Set();
let current = readStored();

function readStored() {
  try {
    const id = (localStorage.getItem(KEY) || "").split(":")[0];
    if (byId(id)) return id;
  } catch {
    /* storage can be blocked (private mode, embedded viewers) */
  }
  return DEFAULT_THEME;
}

function paint(id) {
  const t = byId(id) || byId(DEFAULT_THEME);
  const root = document.documentElement;
  root.dataset.theme = t.id;
  root.dataset.mode = t.mode;
  // keeps the browser's own UI (scrollbars, form controls, mobile address bar) in step
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", t.mode);
}

export function getTheme() {
  return current;
}

export function setTheme(id) {
  const t = byId(id);
  if (!t || t.id === current) return;
  current = t.id;
  paint(current);
  try {
    localStorage.setItem(KEY, `${t.id}:${t.mode}`);
  } catch {
    /* the choice then lasts only until the page closes */
  }
  listeners.forEach((fn) => fn());
}

/** The active theme id, re-rendering when it changes. */
export function useTheme() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getTheme,
    () => DEFAULT_THEME
  );
}

// CSS colour strings that follow the active theme, for SVG, charts and inline styles:
//   c("gold")        -> rgb(var(--c-gold))
//   c("gold", 0.35)  -> rgb(var(--c-gold) / 0.35)
//   mix(c("gold"), 40, c("night")) -> 40% gold over night
export const c = (name, alpha) => (alpha == null ? `rgb(var(--c-${name}))` : `rgb(var(--c-${name}) / ${alpha})`);
export const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

paint(current);
