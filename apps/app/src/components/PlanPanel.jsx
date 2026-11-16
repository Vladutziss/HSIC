// Settings section for the plan: which one the account has, until when, and a box for a code (from a school, a sponsor
// or after a bank transfer). Hidden when the plan cannot be read (offline, artifact build). Rules: 0041_plans.sql.

import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Chip, Field, Panel, SectionTitle } from "./ui.jsx";
import { getPlan, redeemCode, PLANS } from "../lib/plan.js";
import { intlTag, pricingUrl, tr } from "../lib/i18n.js";

export default function PlanPanel() {
  const [plan, setPlan] = useState(null); // null while reading, or when it cannot be read
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getPlan().then((p) => live && setPlan(p));
    return () => {
      live = false;
    };
  }, []);

  if (!plan) return null;

  async function redeem(e) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      setPlan(await redeemCode(code));
      setCode("");
    } catch (err) {
      setError(err.message === "invalid" ? tr("Cod invalid, folosit sau expirat.") : tr("Nu s-a putut. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  }

  const names = { free: tr("Gratuit"), pro: tr("Pro"), school: tr("Școală") };
  const until = plan.until ? new Date(plan.until).toLocaleDateString(intlTag(), { day: "numeric", month: "long", year: "numeric" }) : null;
  const factor = PLANS[plan.plan].aiFactor;

  return (
    <Panel className="space-y-3 p-4">
      <SectionTitle icon={Sparkles} tone="gold" className="!mb-1">{tr("Plan")}</SectionTitle>
      <p className="flex flex-wrap items-center gap-2 text-sm text-body">
        <Chip>{names[plan.plan]}</Chip>
        {until ? tr("Activ până pe {until}.", { until }) : tr("Planul gratuit nu expiră.")}
      </p>
      <p className="text-xs font-semibold text-dim">
        {factor === 1 ? tr("Limita zilnică de apeluri AI este cea standard.") : tr("Limita zilnică de apeluri AI este de {n} ori mai mare.", { n: factor })}
      </p>
      <form onSubmit={redeem} className="space-y-2">
        <Field label={tr("Ai un cod?")} htmlFor="set-plan-code" hint={tr("De la școală, de la un sponsor sau după o plată prin transfer.")}>
          <div className="flex gap-2">
            <input
              id="set-plan-code"
              className="field"
              value={code}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" size="sm" busy={busy} disabled={!code.trim()}>{tr("Folosește")}</Button>
          </div>
        </Field>
        {error && <p role="alert" className="text-xs font-semibold text-rose-ink">{error}</p>}
      </form>
      <a className="focus-ring text-xs font-bold text-dim underline hover:text-ink" href={pricingUrl()} target="_blank" rel="noopener">{tr("Vezi planurile și prețurile")}</a>
    </Panel>
  );
}
