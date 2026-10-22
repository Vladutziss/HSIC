// Analytics consent: shown until the player accepts or declines (equal buttons), changeable later in Settings.

import React, { useEffect, useState } from "react";
import { Button } from "./ui.jsx";
import { analyticsAvailable, getConsent, setConsent } from "../lib/analytics.js";
import { tr, legalUrl } from "../lib/i18n.js";

export function useConsent() {
  const [v, setV] = useState(getConsent);
  useEffect(() => {
    const sync = () => setV(getConsent());
    window.addEventListener("molted:consent", sync);
    return () => window.removeEventListener("molted:consent", sync);
  }, []);
  return v;
}

export default function ConsentBanner() {
  const choice = useConsent();
  if (!analyticsAvailable || choice !== null) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border border-edge bg-panel p-4 shadow-lg"
      role="region"
      aria-label={tr("Cookie-uri")}
    >
      <p className="text-sm leading-snug text-body">
        {tr("Folosim cookie-uri strict necesare ca să funcționeze aplicația. Cu acordul tău, folosim și analiză anonimizată de utilizare, ca să o îmbunătățim. {a}", {
          a: <a className="focus-ring font-extrabold text-ink underline" href={legalUrl("cookies")} target="_blank" rel="noopener">{tr("Politica de cookie-uri")}</a>,
        })}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => setConsent(false)}>{tr("Refuz")}</Button>
        <Button size="sm" className="flex-1" onClick={() => setConsent(true)}>{tr("Accept")}</Button>
      </div>
    </div>
  );
}

/** Settings row: shows the current choice and flips it. */
export function ConsentSetting() {
  const choice = useConsent();
  if (!analyticsAvailable) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-body">
      <span>{choice ? tr("Analiza de utilizare este activă.") : tr("Analiza de utilizare este oprită.")}</span>
      <Button size="sm" onClick={() => setConsent(!choice)}>{choice ? tr("Oprește") : tr("Pornește")}</Button>
    </div>
  );
}
