// Școală, on Acasă: the next exams and assignments, one tap to tick them or to log a study block, and a small form to
// add them by hand. It works without the server (no AI), so the school side of the app is always in reach.

import React, { useState } from "react";
import { CalendarCheck, CalendarPlus, GraduationCap, Plus, X } from "lucide-react";
import { Button, CheckButton, Chip, Panel, SectionTitle, Tabs, useToast } from "./ui.jsx";
import { addSchoolItem, addStudySession, examPlan, examPlanTodos, nextAssignments, nextExams, overdueAssignments, removeSchoolItem, schoolPlanner, setSchoolDone, studiedMinutes } from "../lib/schoolPlanner.js";
import { addDays, diffDays } from "../lib/dates.js";
import { uid } from "../lib/catalog.js";
import { usePref } from "../lib/prefs.js";
import { tr } from "../lib/i18n.js";

const dayLabel = (n) => (n === 0 ? tr("azi") : n === 1 ? tr("mâine") : tr("în {n} zile", { n }));
const lateLabel = (n) => (n === 1 ? tr("ieri") : tr("acum {n} zile", { n }));
const MINUTES = [15, 25, 45, 60]; // quick choices; any number from 1 to 600 can be typed

/** Logs a study block: quick minutes or a typed number (the last one is remembered), the subject when it is not known. Focus time counts by itself. */
function StudyForm({ subject, askSubject, onAdd, onClose }) {
  const [last, setLast] = usePref("studyMinutes", 25);
  const [minutes, setMinutes] = useState(String(last));
  const [name, setName] = useState(subject || "");
  const n = Math.round(Number(minutes));
  const valid = n >= 1 && n <= 600;
  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setLast(n);
    onAdd(name, n);
    onClose();
  };
  return (
    <form onSubmit={submit} className="inset mt-3 basis-full space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr("Minute de studiu")}>
        {MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMinutes(String(m))}
            aria-pressed={n === m}
            className={`tap focus-ring rounded-lg px-2.5 py-1 text-xs font-extrabold ring-1 ${n === m ? "bg-gold/15 text-gold-hi ring-gold" : "text-dim ring-edge hover:text-ink"}`}
          >
            {m} min
          </button>
        ))}
        <input className="field !w-24 !py-1 text-sm" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label={tr("Minute")} autoFocus />
      </div>
      {askSubject && <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={tr("Materia (opțional)")} aria-label={tr("Materia")} />}
      <p className="text-xs font-semibold text-dim">{tr("Timpul din Focus se adaugă singur, nu-l nota și aici.")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" icon={X} onClick={onClose}>{tr("Renunță")}</Button>
        <Button type="submit" size="sm" icon={Plus} disabled={!valid}>{tr("Adaugă")}</Button>
      </div>
    </form>
  );
}

function AddForm({ today, onAdd, onClose }) {
  const [kind, setKind] = useState("assignment");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(addDays(today, 1));
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(kind, kind === "exam" ? { title, subject, date } : { title, subject, due: date, estimatedMinutes: 45 });
    onClose();
  };
  return (
    <form onSubmit={submit} className="inset mt-3 space-y-3 p-3">
      <Tabs
        size="sm"
        value={kind}
        onChange={setKind}
        items={[
          { value: "assignment", label: tr("Temă") },
          { value: "exam", label: tr("Examen") },
        ]}
      />
      <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "exam" ? tr("Test la matematică") : tr("Referat la istorie")} aria-label={tr("Titlu")} autoFocus />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="field" value={subject} maxLength={60} onChange={(e) => setSubject(e.target.value)} placeholder={tr("Materia (opțional)")} aria-label={tr("Materia")} />
        <input className="field" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label={tr("Data")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" icon={X} onClick={onClose}>{tr("Renunță")}</Button>
        <Button type="submit" size="sm" icon={Plus} disabled={!title.trim()}>{tr("Adaugă")}</Button>
      </div>
    </form>
  );
}

export function SchoolCard({ state, today, onStateChange }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [logging, setLogging] = useState(null); // the row (kind-id) or "free" whose study form is open
  const exams = nextExams(state, today);
  const assignments = nextAssignments(state, today);
  const studied = studiedMinutes(state, today);
  const update = (fn) => onStateChange?.((s) => ({ ...s, schoolPlanner: fn(schoolPlanner(s)) }));
  const late = overdueAssignments(state, today);
  // overdue work comes first and always shows: it used to vanish once the deadline had passed
  const lateRows = late.map((a) => ({ kind: "assignment", id: a.id, title: a.title, subject: a.subject, late: a.daysLate }));
  const examRows = exams.map((e) => ({ kind: "exam", id: e.id, title: e.title, subject: e.subject, left: e.daysLeft, date: e.date }));
  const dueRows = assignments.map((a) => ({ kind: "assignment", id: a.id, title: a.title, subject: a.subject, left: Math.max(0, diffDays(today, a.due)) }));
  const all = [...lateRows, ...examRows, ...dueRows];
  const rows = showAll ? all : [...lateRows, ...examRows.slice(0, 2), ...dueRows.slice(0, 4 - Math.min(2, examRows.length))];
  const remove = (r) => update((p) => removeSchoolItem(p, r.kind, r.id));
  // study blocks spread over the days before the exam, the last one a self-test (lib/schoolPlanner.js examPlan)
  const prepare = (r) => {
    const topic = r.subject || r.title;
    const title = (x) => (x.last ? tr("Autotestare {topic} ({i}/{n})", { topic, i: x.i, n: x.n }) : tr("Pregătire {topic} ({i}/{n})", { topic, i: x.i, n: x.n }));
    if (examPlan({ date: r.date }, today).length === 0) return toast({ title: tr("Nu e loc pentru un plan"), text: tr("Examenul e prea aproape: ai nevoie de cel puțin două zile libere."), icon: CalendarCheck });
    const drafts = examPlanTodos({ date: r.date }, today, state.todos, title);
    if (drafts.length === 0) return toast({ title: tr("Planul e deja în calendar"), icon: CalendarCheck });
    onStateChange?.((s) => ({ ...s, todos: [...(s.todos || []), ...drafts.map((d) => ({ id: uid("t"), time: null, done: false, doneOn: null, createdAt: today, ...d }))] }));
    toast({ title: tr("Plan de pregătire adăugat"), text: tr("{n} sesiuni până la examen, în calendar. Sesiuni pe mai multe zile, nu într-o singură seară: exersarea distribuită și autotestarea au primit cele mai bune evaluări (Dunlosky et al., 2013).", { n: drafts.length }), icon: CalendarCheck, tone: "mint", ms: 7000 });
  };
  const logStudy = (subject, minutes) => update((p) => addStudySession(p, { subject, minutes, day: today }, today));
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={GraduationCap}
        sub={studied > 0 ? tr("Azi ai învățat {studied} min", { studied }) : tr("Teme, examene și timp de studiu")}
        action={
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={GraduationCap} onClick={() => setLogging((v) => (v === "free" ? null : "free"))} aria-expanded={logging === "free"}>
              {tr("Am învățat")}
            </Button>
            <Button variant="ghost" size="sm" icon={adding ? X : Plus} onClick={() => setAdding((v) => !v)}>
              {adding ? tr("Închide") : tr("Adaugă")}
            </Button>
          </span>
        }
      >{tr("Școală")}</SectionTitle>
      {logging === "free" && <StudyForm askSubject onAdd={logStudy} onClose={() => setLogging(null)} />}
      {rows.length === 0 && !adding && <p className="text-sm font-semibold text-dim">{tr("Adaugă o temă sau un examen și Molt te ajută să le planifici.")}</p>}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-edge bg-panel-lo px-3 py-2">
              <CheckButton size="sm" checked={false} label={tr("Bifează: {v}", { v: r.title })} onClick={() => update((p) => setSchoolDone(p, r.kind, r.id, true))} />
              <span className="min-w-0 flex-1 basis-32">
                <span className="flex flex-wrap items-center gap-x-2">
                  {r.kind === "exam" && <Chip tone="gold">{tr("Examen")}</Chip>}
                  {r.late > 0 && <Chip tone="rose">{tr("Întârziată")}</Chip>}
                  <span className="min-w-0 break-words text-sm font-extrabold text-ink">{r.title}</span>
                </span>
                <span className="block truncate text-xs font-semibold text-dim">
                  {[r.subject, r.late > 0 ? lateLabel(r.late) : dayLabel(r.left)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {r.kind === "exam" && r.left >= 2 && (
                  <button
                    type="button"
                    onClick={() => prepare(r)}
                    className="tap focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink"
                    aria-label={tr("Creează un plan de pregătire pentru {title}", { title: r.title })}
                  >
                    <CalendarPlus size={13} aria-hidden="true" />
                    {tr("Plan")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLogging((v) => (v === `${r.kind}-${r.id}` ? null : `${r.kind}-${r.id}`))}
                  aria-expanded={logging === `${r.kind}-${r.id}`}
                  className="tap focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink"
                  aria-label={r.subject ? tr("Notează studiu la {subject}", { subject: r.subject }) : tr("Notează studiu pentru {title}", { title: r.title })}
                >
                  {tr("Studiu")}
                </button>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  className="tap focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-dim ring-1 ring-edge hover:text-rose"
                  aria-label={tr("Șterge: {v}", { v: r.title })}
                  title={tr("Șterge")}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
              {logging === `${r.kind}-${r.id}` && <StudyForm subject={r.subject} onAdd={logStudy} onClose={() => setLogging(null)} />}
            </li>
          ))}
        </ul>
      )}
      {(showAll ? all.length > 4 : all.length > rows.length) && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="focus-ring mt-2 rounded-lg px-1 text-xs font-extrabold text-dim hover:text-ink">
          {showAll ? tr("Arată mai puține") : tr("Vezi tot ({n})", { n: all.length })}
        </button>
      )}
      {adding && <AddForm today={today} onClose={() => setAdding(false)} onAdd={(kind, raw) => update((p) => addSchoolItem(p, kind, raw, today))} />}
    </Panel>
  );
}
