// Settings section for emails from Molted: one switch, applied immediately (the server stops sending the moment it is
// off). It sits under the notifications and is hidden when the preference cannot be read (offline, artifact build).

import React, { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Toggle } from "./ui.jsx";
import { getMarketingEmails, setMarketingEmails } from "../lib/emailPrefs.js";
import { tr } from "../lib/i18n.js";

export default function EmailsPanel() {
  const [enabled, setEnabled] = useState(null); // null while reading, or when it cannot be read
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getMarketingEmails().then((v) => live && setEnabled(v));
    return () => {
      live = false;
    };
  }, []);

  if (enabled === null) return null;

  async function change(next) {
    const before = enabled;
    setEnabled(next);
    setFailed(false);
    try {
      await setMarketingEmails(next);
    } catch {
      setEnabled(before);
      setFailed(true);
    }
  }

  return (
    <div className="space-y-3 border-t border-edge pt-3">
      <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-dim">
        <Mail size={14} aria-hidden="true" />{" "}{tr("Emailuri")}</span>
      <label className="flex items-center justify-between gap-4" htmlFor="set-marketing-emails">
        <span>
          <span className="block font-extrabold text-ink">{tr("Emailuri de la Molted")}</span>
          <span className="block text-xs font-semibold text-dim">{tr("Rare și scurte, despre progresul tău. Cel mult unul pe săptămână; te poți dezabona oricând.")}</span>
        </span>
        <Toggle id="set-marketing-emails" checked={enabled} onChange={change} label={tr("Emailuri de la Molted")} />
      </label>
      {failed && <p className="text-xs font-semibold text-rose-ink">{tr("Nu s-a putut. Încearcă din nou.")}</p>}
    </div>
  );
}
