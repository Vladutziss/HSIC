// Settings section for push notifications (sits inside the report card): daily report at the chosen time, and group reminders.
// The permission prompt only ever follows a tap on the button.

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button, Toggle } from "./ui.jsx";
import { disablePush, enablePush, pushStatus, syncPush } from "../lib/push.js";
import { tr } from "../lib/i18n.js";

export default function NotificationsPanel({ settings, set }) {
  const [status, setStatus] = useState(null); // null while checking
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const prefs = { reviewTime: settings.reviewTime, report: settings.pushReport, nudges: settings.pushNudges };

  useEffect(() => {
    pushStatus().then(setStatus);
  }, []);

  // keep the server row in step with the report time and the toggles
  useEffect(() => {
    if (status === "on") syncPush(prefs).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, settings.reviewTime, settings.pushReport, settings.pushNudges]);

  if (!status || status === "unsupported") return null;

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (status === "on") {
        await disablePush();
        setStatus("off");
      } else {
        setStatus(await enablePush(prefs));
      }
    } catch (e) {
      setFailed(e?.step || true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-edge pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-dim">
          <Bell size={14} aria-hidden="true" />{" "}{tr("Notificări")}</span>
        {(status === "off" || status === "on") && (
          <Button size="sm" variant={status === "on" ? "ghost" : "gold"} busy={busy} onClick={toggle}>
            {status === "on" ? tr("Oprește") : tr("Activează")}
          </Button>
        )}
      </div>
      {status === "install" && (
        <p className="text-sm font-semibold text-body">{tr("Pe iPhone, notificările merg doar după ce pui Molted pe ecranul principal: Partajare → Adaugă pe ecranul principal, apoi deschide aplicația de acolo.")}</p>
      )}
      {status === "denied" && (
        <p className="text-sm font-semibold text-body">{tr("Notificările sunt blocate pentru Molted. Le poți permite din setările browserului sau ale telefonului.")}</p>
      )}
      {(status === "off" || status === "on") && (
        <>
          {status === "off" && !failed && <p className="text-xs font-semibold text-dim">{tr("Primește raportul zilei și impulsurile din grup și când aplicația e închisă.")}</p>}
          {failed === "subscribe" && (
            <p className="text-xs font-semibold text-rose-ink">{tr("Browserul nu a putut crea abonarea la notificări. În Brave: Setări → Confidențialitate și securitate → activează „Use Google services for push messaging”, apoi repornește browserul.")}</p>
          )}
          {failed === "save" && <p className="text-xs font-semibold text-rose-ink">{tr("Abonarea nu s-a putut salva pe server. Încearcă din nou.")}</p>}
          {failed === true && <p className="text-xs font-semibold text-rose-ink">{tr("Nu s-a putut. Încearcă din nou.")}</p>}
        </>
      )}
      {status === "on" && (
        <>
          <label className="flex items-center justify-between gap-4" htmlFor="set-push-report">
            <span>
              <span className="block font-extrabold text-ink">{tr("Raportul zilei")}</span>
              <span className="block text-xs font-semibold text-dim">{tr("La ora raportului, dacă nu l-ai primit deja.")}</span>
            </span>
            <Toggle id="set-push-report" checked={settings.pushReport !== false} onChange={(v) => set({ pushReport: v })} label={tr("Raportul zilei")} />
          </label>
          <label className="flex items-center justify-between gap-4" htmlFor="set-push-nudges">
            <span>
              <span className="block font-extrabold text-ink">{tr("Remindere din grup")}</span>
              <span className="block text-xs font-semibold text-dim">{tr("Când un prieten îți trimite un impuls.")}</span>
            </span>
            <Toggle id="set-push-nudges" checked={settings.pushNudges !== false} onChange={(v) => set({ pushNudges: v })} label={tr("Remindere din grup")} />
          </label>
        </>
      )}
    </div>
  );
}
