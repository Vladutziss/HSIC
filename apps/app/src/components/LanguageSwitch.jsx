import React from "react";
import { LANG_NAMES, LOCALES, getLocale, setLocale, tr } from "../lib/i18n.js";
import { setPref } from "../lib/prefs.js";

// Română | English. `onAccount` is true once the player is signed in: the choice is then also saved with the account
// (prefs.lang), and the reload waits a moment so that save can leave the page first.
export default function LanguageSwitch({ account = false, className = "" }) {
  const now = getLocale();
  const pick = (l) => {
    if (l === now) return;
    setPref("lang", l);
    if (account) window.setTimeout(() => setLocale(l), 1500);
    else setLocale(l);
  };
  return (
    <div role="radiogroup" aria-label={tr("Limbă")} className={`inline-flex gap-1 rounded-xl bg-well p-1 ring-1 ring-edge ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === now}
          lang={l}
          onClick={() => pick(l)}
          className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-extrabold transition ${l === now ? "bg-gold text-on-gold" : "text-dim hover:text-ink"}`}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
