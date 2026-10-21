// The two things a new player confirms before an account exists: the terms and the privacy policy, and the age.
// LEGAL_VERSION is the date written at the top of terms.html ("Ultima actualizare"); change it when the terms change
// in a way that needs a new acceptance, and every account is asked once more.

import React from "react";
import { tr, legalUrl } from "../lib/i18n.js";

export const LEGAL_VERSION = "2026-10-11";

const LINK = "focus-ring font-extrabold text-ink underline hover:text-gold-hi";

function Check({ id, checked, onChange, children }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-well/60 p-3 ring-1 ring-edge transition hover:ring-edge-hi">
      <input
        id={id}
        type="checkbox"
        className="focus-ring mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--c-gold))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-semibold leading-snug text-body">{children}</span>
    </label>
  );
}

/** value: { terms, age }. Both have to be ticked before `legalOk(value)` is true. */
export function LegalChecks({ value, onChange }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      <Check id="legal-terms" checked={!!value.terms} onChange={set("terms")}>{tr("Am citit și sunt de acord cu {a} și cu {a2}.", { a: <a className={LINK} href={legalUrl("terms")} target="_blank" rel="noopener">{tr("Termenii și condițiile")}</a>, a2: <a className={LINK} href={legalUrl("privacy")} target="_blank" rel="noopener">{tr("Politica de confidențialitate")}</a> })}</Check>
      <Check id="legal-age" checked={!!value.age} onChange={set("age")}>{tr("Am cel puțin 16 ani sau am acordul părintelui ori al tutorelui meu legal.")}</Check>
    </div>
  );
}

export const legalOk = (v) => !!v?.terms && !!v?.age;

// A sign-up ticks the boxes before the account exists; the flag carries that over to the first screen after it,
// so the player is not asked twice.
const FLAG = "molted.legalTicked";
export const rememberTicked = () => {
  try {
    sessionStorage.setItem(FLAG, LEGAL_VERSION);
  } catch {
    // private window: the player simply ticks once more
  }
};
export const wasTicked = () => {
  try {
    return sessionStorage.getItem(FLAG) === LEGAL_VERSION;
  } catch {
    return false;
  }
};
export const clearTicked = () => {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // nothing to clear
  }
};
