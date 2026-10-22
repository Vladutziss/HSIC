// The two things a new player confirms before an account exists: the terms and the privacy policy, and the age.
// LEGAL_VERSION is the date written at the top of terms.html ("Ultima actualizare"); change it when the terms change
// in a way that needs a new acceptance, and every account is asked once more.

import React from "react";
import { tr, legalUrl } from "../lib/i18n.js";

export const LEGAL_VERSION = "2026-10-21";

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

/** value: { terms, age, emails }. terms and age have to be ticked before `legalOk(value)` is true; emails is optional
 *  (ticked from the start, and it can be turned off here or at any time in Settings → Emailuri). */
export function LegalChecks({ value, onChange }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-2">
      <Check id="legal-terms" checked={!!value.terms} onChange={set("terms")}>{tr("Am citit și sunt de acord cu {a} și cu {a2}.", { a: <a className={LINK} href={legalUrl("terms")} target="_blank" rel="noopener">{tr("Termenii și condițiile")}</a>, a2: <a className={LINK} href={legalUrl("privacy")} target="_blank" rel="noopener">{tr("Politica de confidențialitate")}</a> })}</Check>
      <Check id="legal-age" checked={!!value.age} onChange={set("age")}>{tr("Am cel puțin 16 ani sau am acordul părintelui ori al tutorelui meu legal.")}</Check>
      <Check id="legal-emails" checked={value.emails !== false} onChange={set("emails")}>{tr("Vreau emailuri de la Molted despre progresul meu (cel mult unul pe săptămână). Mă pot dezabona oricând, dintr-un click.")}</Check>
    </div>
  );
}

export const legalOk = (v) => !!v?.terms && !!v?.age;

// A sign-up ticks the boxes before the account exists; the flag carries that over to the first screen after it,
// so the player is not asked twice.
const FLAG = "molted.legalTicked";
const EMAILS_FLAG = "molted.legalEmails";
export const rememberTicked = (emails = true) => {
  try {
    sessionStorage.setItem(FLAG, LEGAL_VERSION);
    sessionStorage.setItem(EMAILS_FLAG, emails === false ? "0" : "1");
  } catch {
    // private window: the player simply ticks once more
  }
};
/** The emails box as ticked on the sign-up form (true unless it was switched off). */
export const tickedEmails = () => {
  try {
    return sessionStorage.getItem(EMAILS_FLAG) !== "0";
  } catch {
    return true;
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
    sessionStorage.removeItem(EMAILS_FLAG);
  } catch {
    // nothing to clear
  }
};
