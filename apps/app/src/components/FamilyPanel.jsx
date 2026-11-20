// Settings section for the family link. A student invites a parent with a one-use code; a parent enters the code and
// then sees that student's name and two numbers for the last 7 days. Either side can unlink at any time. Hidden when
// it cannot be read (offline, artifact build). Rules: 0042_roles.sql.

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button, Field, Panel, SectionTitle } from "./ui.jsx";
import { createFamilyInvite, getFamilyLinks, getFamilySummary, joinFamily, unlinkFamily } from "../lib/roles.js";
import { getClient } from "../lib/supabase.js";
import { tr } from "../lib/i18n.js";

export default function FamilyPanel() {
  const [ready, setReady] = useState(false);
  const [links, setLinks] = useState([]);
  const [summary, setSummary] = useState([]);
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLinks(await getFamilyLinks());
    setSummary(await getFamilySummary());
  }
  useEffect(() => {
    let live = true;
    getClient().then((c) => {
      if (!live || !c) return;
      setReady(true);
      load();
    });
    return () => {
      live = false;
    };
  }, []);

  if (!ready) return null;

  async function makeInvite() {
    setBusy(true);
    setError("");
    try {
      setInvite(await createFamilyInvite());
    } catch (e) {
      setError(e.message === "too_many" ? tr("Ai deja 3 părinți legați.") : tr("Nu s-a putut. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  }
  async function join(e) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      await joinFamily(code);
      setCode("");
      await load();
    } catch (err) {
      setError(err.message === "invalid" ? tr("Cod invalid, folosit sau expirat.") : tr("Nu s-a putut. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  }
  async function unlink(id) {
    await unlinkFamily(id).catch(() => {});
    await load();
  }

  const parents = links.filter((l) => l.kind === "parent");
  return (
    <Panel className="space-y-3 p-4">
      <SectionTitle icon={Users} tone="violet" className="!mb-1">{tr("Familie")}</SectionTitle>
      <p className="text-xs font-semibold text-dim">{tr("Un părinte legat vede doar numele tău și două numere din ultimele 7 zile: zilele cu bifări și numărul de bifări. Poți șterge legătura oricând.")}</p>
      {parents.map((p) => (
        <p key={p.other_id} className="flex items-center justify-between gap-2 text-sm text-body">
          <span>{tr("Părinte: {name}", { name: p.other_name || "-" })}</span>
          <Button variant="ghost" size="sm" onClick={() => unlink(p.other_id)}>{tr("Șterge legătura")}</Button>
        </p>
      ))}
      <div className="space-y-2">
        <Button size="sm" variant="ghost" busy={busy} onClick={makeInvite}>{tr("Invită un părinte")}</Button>
        {invite && <p className="text-sm font-bold text-ink">{tr("Cod pentru părinte: {code} (valabil 3 zile, o singură folosire)", { code: invite })}</p>}
      </div>
      <form onSubmit={join} className="space-y-2 border-t border-edge pt-3">
        <Field label={tr("Ești părinte? Introdu codul de la copil")} htmlFor="family-code">
          <div className="flex gap-2">
            <input id="family-code" className="field" value={code} maxLength={8} autoComplete="off" autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" size="sm" busy={busy} disabled={!code.trim()}>{tr("Leagă")}</Button>
          </div>
        </Field>
      </form>
      {error && <p role="alert" className="text-xs font-semibold text-rose-ink">{error}</p>}
      {summary.length > 0 && (
        <ul className="space-y-1 border-t border-edge pt-3 text-sm text-body">
          {summary.map((s) => (
            <li key={s.student_id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b className="text-ink">{s.student_name || "-"}</b> · {tr("{d} zile active, {c} bifări", { d: s.active_days7, c: s.checkins7 })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => unlink(s.student_id)}>{tr("Șterge legătura")}</Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
