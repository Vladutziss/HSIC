// Școală, on Acasă: the next exams and assignments, one tap to tick them or to log a study block, and a small form to
// add them by hand. It works without the server (no AI), so the school side of the app is always in reach.

import React, { useState } from "react";
import { CalendarCheck, CalendarPlus, GraduationCap, Plus, X } from "lucide-react";
import { Button, CheckButton, Chip, Panel, SectionTitle, Tabs, useToast } from "./ui.jsx";
import { addSchoolItem, addStudySession, examPlan, examPlanTodos, nextAssignments, nextExams, schoolPlanner, setSchoolDone, studiedMinutes } from "../lib/schoolPlanner.js";
import { addDays, diffDays } from "../lib/dates.js";
import { uid } from "../lib/catalog.js";
import { tr } from "../lib/i18n.js";

const dayLabel = (n) => (n === 0 ? tr("azi") : n === 1 ? tr("mâine") : tr("în {n} zile", { n }));
const SESSION = 25; // minutes logged by the one-tap button

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
  const exams = nextExams(state, today);
  const assignments = nextAssignments(state, today);
  const studied = studiedMinutes(state, today);
  const update = (fn) => onStateChange?.((s) => ({ ...s, schoolPlanner: fn(schoolPlanner(s)) }));
  const rows = [
    ...exams.slice(0, 2).map((e) => ({ kind: "exam", id: e.id, title: e.title, subject: e.subject, left: e.daysLeft, date: e.date })),
    ...assignments.slice(0, 4 - Math.min(2, exams.length)).map((a) => ({ kind: "assignment", id: a.id, title: a.title, subject: a.subject, left: Math.max(0, diffDays(today, a.due)) })),
  ];
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
  const logStudy = (subject) => update((p) => addStudySession(p, { subject, minutes: SESSION, day: today }, today));
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={GraduationCap}
        sub={studied > 0 ? tr("Azi ai învățat {studied} min", { studied }) : tr("Teme, examene și timp de studiu")}
        action={
          <Button variant="ghost" size="sm" icon={adding ? X : Plus} onClick={() => setAdding((v) => !v)}>
            {adding ? tr("Închide") : tr("Adaugă")}
          </Button>
        }
      >{tr("Școală")}</SectionTitle>
      {rows.length === 0 && !adding && <p className="text-sm font-semibold text-dim">{tr("Adaugă o temă sau un examen și Molt te ajută să le planifici.")}</p>}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-edge bg-panel-lo px-3 py-2">
              <CheckButton size="sm" checked={false} label={tr("Bifează: {v}", { v: r.title })} onClick={() => update((p) => setSchoolDone(p, r.kind, r.id, true))} />
              <span className="min-w-0 flex-1 basis-32">
                <span className="flex flex-wrap items-center gap-x-2">
                  {r.kind === "exam" && <Chip tone="gold">{tr("Examen")}</Chip>}
                  <span className="min-w-0 break-words text-sm font-extrabold text-ink">{r.title}</span>
                </span>
                <span className="block truncate text-xs font-semibold text-dim">
                  {[r.subject, dayLabel(r.left)].filter(Boolean).join(" · ")}
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
                  onClick={() => logStudy(r.subject)}
                  className="tap focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink"
                  aria-label={r.subject ? tr("Am învățat {minutes} minute la {subject}", { minutes: SESSION, subject: r.subject }) : tr("Am învățat {minutes} minute", { minutes: SESSION })}
                >
                  +{SESSION} min
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddForm today={today} onClose={() => setAdding(false)} onAdd={(kind, raw) => update((p) => addSchoolItem(p, kind, raw, today))} />}
    </Panel>
  );
}
