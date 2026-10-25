// Colour themes. The palettes themselves live in src/styles.css ([data-theme="..."] blocks);
// this file only lists them for the picker and switches the active one.
//
// To add a theme: add a block in styles.css and an entry below.

import { useSyncExternalStore } from "react";
import { tr } from "./i18n.js";

export const THEMES = [
  { id: "noapte", name: tr("Noapte"), mode: "dark", blurb: tr("Violet închis, cu accente aurii. Tema originală.") },
  { id: "grafit", name: tr("Grafit"), mode: "dark", blurb: tr("Gri închis neutru, fără stele. Simplu și sobru.") },
  { id: "padure", name: tr("Pădure"), mode: "dark", blurb: tr("Verde-închis, cu accente de salvie. Calm și contrastat.") },
  { id: "ceata", name: tr("Lumină"), mode: "light", blurb: tr("Gri deschis și alb, accente discrete.") },
  { id: "lavanda", name: tr("Lavandă"), mode: "light", blurb: tr("Pastel luminos, lavandă și liliac, text violet-închis.") },
];

// Themes that no longer exist fall back to the one of the same mode (the account may still hold the old id).
const RETIRED = { cod: "noapte", nord: "noapte", piersica: "ceata", pergament: "ceata" };

export const DEFAULT_THEME = "noapte";
const KEY = "molted.theme"; // stored as "<id>:<mode>", read by the inline script in index.html too

const byId = (id) => THEMES.find((t) => t.id === (RETIRED[id] || id));
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

export const isTheme = (id) => !!byId(id);

// The choice belongs to the account (settings.theme, see App.jsx), so the same theme shows on every device; this
// device keeps a copy only so the page can paint it before the account has loaded.
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
