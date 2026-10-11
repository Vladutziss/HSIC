// Settings panel for push notifications: daily report at the chosen time, and group reminders.
// The permission prompt only ever follows a tap on the button.

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button, Panel, SectionTitle, Toggle } from "./ui.jsx";
import { disablePush, enablePush, pushStatus, syncPush } from "../lib/push.js";

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
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4 p-4 sm:p-5">
      <SectionTitle icon={Bell} tone="gold">
        Notificări
      </SectionTitle>
      {status === "install" && (
        <p className="text-sm font-semibold text-body">
          Pe iPhone, notificările merg doar după ce pui Molted pe ecranul principal: Partajare → Adaugă pe ecranul principal, apoi deschide aplicația de acolo.
        </p>
      )}
      {status === "denied" && (
        <p className="text-sm font-semibold text-body">
          Notificările sunt blocate pentru Molted. Le poți permite din setările browserului sau ale telefonului.
        </p>
      )}
      {(status === "off" || status === "on") && (
        <>
          <Button variant={status === "on" ? "ghost" : "gold"} busy={busy} onClick={toggle}>
            {status === "on" ? "Oprește notificările" : "Activează notificările"}
          </Button>
          {failed && <p className="text-xs font-semibold text-rose-ink">Nu s-a putut. Încearcă din nou.</p>}
        </>
      )}
      {status === "on" && (
        <>
          <label className="flex items-center justify-between gap-4" htmlFor="set-push-report">
            <span>
              <span className="block font-extrabold text-ink">Raportul zilei</span>
              <span className="block text-xs font-semibold text-dim">La ora raportului, dacă nu l-ai primit deja.</span>
            </span>
            <Toggle id="set-push-report" checked={settings.pushReport !== false} onChange={(v) => set({ pushReport: v })} label="Raportul zilei" />
          </label>
          <label className="flex items-center justify-between gap-4" htmlFor="set-push-nudges">
            <span>
              <span className="block font-extrabold text-ink">Remindere din grup</span>
              <span className="block text-xs font-semibold text-dim">Când un prieten îți trimite un impuls.</span>
            </span>
            <Toggle id="set-push-nudges" checked={settings.pushNudges !== false} onChange={(v) => set({ pushNudges: v })} label="Remindere din grup" />
          </label>
        </>
      )}
    </Panel>
  );
}
