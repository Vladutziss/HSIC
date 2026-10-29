// The player's small interface choices: the side menu folded or not, how the habit list is laid out and sorted, what the
// Focus screen remembers. They belong to the account (settings.prefs, saved with the profile), so they are the same on
// every device. This device keeps a copy only so the page can show them before the account has loaded; the account wins
// as soon as it is there (App.jsx hydrates this store and saves what changes), like the colour theme.
//
//   sidebar        "open" | "closed"
//   habitsLayout   "compact" | "details" | "large"
//   habitsSort     { sort, desc }
//   focus          { setup, todosOpen, clock }
//   studyMinutes   the minutes last typed in the study form of the Școală card

import { useSyncExternalStore } from "react";
import { LOCALES, getLocale, setLocale } from "./i18n.js";

const KEY = "molted.prefs";
// what earlier versions kept on the device, one key each; read once so nobody has to choose again
const LEGACY = { sidebar: "molted.sidebar", habitsLayout: "molted.habitsLayout", habitsSort: "molted.habitsSort", focus: "molted.focusPrefs" };

const parse = (raw) => {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

function readLocal() {
  try {
    const own = parse(localStorage.getItem(KEY));
    if (own) return own;
    const out = {};
    const side = localStorage.getItem(LEGACY.sidebar);
    if (side === "open" || side === "closed") out.sidebar = side;
    const layout = localStorage.getItem(LEGACY.habitsLayout);
    if (layout) out.habitsLayout = layout;
    const sort = parse(localStorage.getItem(LEGACY.habitsSort));
    if (sort) out.habitsSort = sort;
    const focus = parse(localStorage.getItem(LEGACY.focus));
    if (focus) out.focus = focus;
    return out;
  } catch {
    return {}; // storage can be blocked (private mode, embedded viewers)
  }
}

let values = readLocal();
let sync = null; // saves a change with the account
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function keepLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    /* the choices then last until the page closes */
  }
}

export const getPref = (key, fallback) => (values[key] === undefined ? fallback : values[key]);
export const allPrefs = () => values;

/** Sets one choice: shown at once, kept on this device for the first paint, and saved with the account. */
export function setPref(key, value) {
  values = { ...values, [key]: value };
  keepLocal();
  notify();
  sync?.(values);
}

/** The account's choices replace this device's, key by key (App calls this when the account loads or changes). */
export function hydratePrefs(account) {
  if (!account || typeof account !== "object") return;
  const next = { ...values, ...account };
  if (JSON.stringify(next) === JSON.stringify(values)) return;
  values = next;
  keepLocal();
  notify();
  // the account's language wins on every device: this page reloads once in it (setLocale saves it on this device first)
  if (LOCALES.includes(account.lang) && account.lang !== getLocale()) setLocale(account.lang);
}

/** `fn(values)` is called with every change so App can save it in settings.prefs; returns the way to unbind. */
export function bindPrefsSync(fn) {
  sync = fn;
  return () => {
    if (sync === fn) sync = null;
  };
}

/** [value, set] for one choice, re-rendering when it changes. */
export function usePref(key, fallback) {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => getPref(key, fallback),
    () => fallback
  );
  return [value, (v) => setPref(key, typeof v === "function" ? v(getPref(key, fallback)) : v)];
}

/** For tests: start from these values, with nothing bound. */
export function resetPrefs(initial = {}) {
  values = initial;
  sync = null;
  listeners.clear();
}
