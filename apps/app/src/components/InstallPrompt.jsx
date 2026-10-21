// "Install the app": a button on Android/Chrome (beforeinstallprompt), a how-to banner on iPhone/Safari.
// Hidden when the app already runs standalone, and after the user closes it once.

import React, { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button, IconButton } from "./ui.jsx";
import { dismissInstall, installDismissed, isIosSafari, isStandalone } from "../lib/pwa.js";
import { tr } from "../lib/i18n.js";

export default function InstallPrompt() {
  const [hidden, setHidden] = useState(() => !__SUPABASE__ || isStandalone() || installDismissed());
  const [evt, setEvt] = useState(null); // the deferred beforeinstallprompt event
  const ios = !hidden && isIosSafari();

  useEffect(() => {
    if (hidden) return undefined;
    const onPrompt = (e) => {
      e.preventDefault();
      setEvt(e);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [hidden]);

  if (hidden || (!evt && !ios)) return null;

  const close = () => {
    dismissInstall();
    setHidden(true);
  };
  const install = async () => {
    evt.prompt();
    await evt.userChoice.catch(() => null);
    setEvt(null);
  };

  return (
    <div
      className="fixed inset-x-3 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-edge bg-panel p-3 shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
      role="region"
      aria-label={tr("Instalează aplicația")}
    >
      <Download className="mt-0.5 shrink-0 text-gold-ink" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm text-body">
        <div className="font-extrabold text-ink">{tr("Pune Molted pe ecranul principal")}</div>
        {ios ? (
          <p className="mt-1 leading-snug">{tr("Apasă")}{" "}<Share size={14} className="inline align-[-2px]" aria-hidden="true" />{" "}{tr("{b}, apoi", { b: <b>{tr("Partajare")}</b> })}{" "}<SquarePlus size={14} className="inline align-[-2px]" aria-hidden="true" /> <b>{tr("Adaugă pe ecranul principal")}</b>.
          </p>
        ) : (
          <Button size="sm" className="mt-2" onClick={install}>{tr("Instalează aplicația")}</Button>
        )}
      </div>
      <IconButton icon={X} label={tr("Închide")} size={16} onClick={close} />
    </div>
  );
}
