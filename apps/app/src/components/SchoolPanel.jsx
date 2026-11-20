// Settings section for a school account: the school, the role in it, and what the role allows. An admin makes teacher
// and student codes within the school's seats; admin and teacher see the class panel, which is counts only and shows
// nothing below 5 students. Hidden when the account is in no school. Rules: 0042_roles.sql.

import React, { useEffect, useState } from "react";
import { School } from "lucide-react";
import { Button, Chip, Field, Panel, SectionTitle } from "./ui.jsx";
import { Select } from "./Select.jsx";
import { createSchoolCode, getSchool, getSchoolPanel, listSchoolCodes } from "../lib/roles.js";
import { PANEL_MIN_STUDENTS } from "@molted/ui/plans-core.js";
import { intlTag, tr } from "../lib/i18n.js";

export default function SchoolPanel() {
  const [school, setSchool] = useState(null);
  const [panel, setPanel] = useState(null);
  const [codes, setCodes] = useState([]);
  const [role, setRole] = useState("student");
  const [uses, setUses] = useState("30");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState("");

  async function load() {
    const s = await getSchool();
    setSchool(s);
    if (s && (s.role === "admin" || s.role === "teacher")) setPanel(await getSchoolPanel());
    if (s?.role === "admin") setCodes(await listSchoolCodes());
  }
  useEffect(() => {
    load();
  }, []);

  if (!school) return null;

  async function make(e) {
    e.preventDefault();
    const n = Number.parseInt(uses, 10);
    if (busy || !(n >= 1)) return;
    setBusy(true);
    setError("");
    setFresh("");
    try {
      setFresh(await createSchoolCode({ label: label.trim(), role, maxUses: n, days: 90 }));
      setLabel("");
      setCodes(await listSchoolCodes());
    } catch (err) {
      setError(err.message === "seats" ? tr("Nu mai sunt locuri libere în școală.") : tr("Nu s-a putut. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  }

  const roles = { admin: tr("Admin de școală"), teacher: tr("Diriginte"), student: tr("Elev") };
  const until = new Date(school.until).toLocaleDateString(intlTag(), { day: "numeric", month: "long", year: "numeric" });
  const staff = school.role === "admin" || school.role === "teacher";

  return (
    <Panel className="space-y-3 p-4">
      <SectionTitle icon={School} tone="sky" className="!mb-1">{tr("Școala ta")}</SectionTitle>
      <p className="flex flex-wrap items-center gap-2 text-sm text-body">
        <b className="text-ink">{school.name}</b>
        <Chip>{roles[school.role]}</Chip>
        {tr("Contract până pe {until}.", { until })}
      </p>
      {!staff && <p className="text-xs font-semibold text-dim">{tr("Școala vede doar numere agregate despre clasă, niciodată datele tale personale.")}</p>}
      {staff && panel && (
        <div className="rounded-xl border border-edge p-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-dim">{tr("Panoul clasei, ultimele 7 zile")}</p>
          {panel.hidden ? (
            <p className="mt-1 text-sm font-semibold text-body">{tr("Panoul apare de la {n} elevi, ca să nu poată arăta spre o persoană. Acum sunt {k}.", { n: PANEL_MIN_STUDENTS, k: panel.students })}</p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-body">
              {tr("{k} elevi · {a} activi · {c} bifări", { k: panel.students, a: panel.active7, c: panel.checkins7 })}
            </p>
          )}
        </div>
      )}
      {school.role === "admin" && (
        <form onSubmit={make} className="space-y-2 border-t border-edge pt-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-dim">{tr("Coduri pentru școală")}</p>
          <p className="text-xs font-semibold text-dim">{tr("{k} din {s} locuri ocupate.", { k: school.students, s: school.seats })}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label={tr("Rol")} htmlFor="school-role">
              <Select id="school-role" value={role} onChange={setRole} options={[{ value: "student", label: roles.student }, { value: "teacher", label: roles.teacher }]} />
            </Field>
            <Field label={tr("Folosiri")} htmlFor="school-uses">
              <input id="school-uses" className="field" inputMode="numeric" value={uses} maxLength={4} onChange={(e) => setUses(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={tr("Etichetă")} htmlFor="school-label">
              <input id="school-label" className="field" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" size="sm" busy={busy}>{tr("Creează cod")}</Button>
          {fresh && <p className="text-sm font-bold text-ink">{tr("Cod nou: {code}", { code: fresh })}</p>}
          {error && <p role="alert" className="text-xs font-semibold text-rose-ink">{error}</p>}
          {codes.length > 0 && (
            <ul className="space-y-1 text-xs font-semibold text-dim">
              {codes.map((c) => (
                <li key={c.code}>
                  <code className="text-ink">{c.code}</code> · {roles[c.role]} · {c.uses}/{c.max_uses}
                  {c.label ? ` · ${c.label}` : ""}
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </Panel>
  );
}
