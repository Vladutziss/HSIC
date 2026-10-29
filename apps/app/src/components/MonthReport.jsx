// Raport lunar: one month of the student's own numbers on a light sheet, to read here or to print / save as PDF and show
// a parent or a teacher. Nothing is sent anywhere; the numbers come from lib/report.js.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, FileText, Printer } from "lucide-react";
import { Button, Modal } from "./ui.jsx";
import { fmtDay, fmtDuration, fmtMonth, monthKey } from "../lib/dates.js";
import { monthReport, shiftMonth } from "../lib/report.js";
import { tr } from "../lib/i18n.js";

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);

function Sheet({ r, nick, today }) {
  return (
    <div className="report-sheet">
      <h2 className="rs-title">{tr("Raport lunar Molted")}</h2>
      <p className="rs-sub">
        {nick ? `${nick} · ` : ""}
        {fmtMonth(r.ym)}
      </p>
      {r.empty ? (
        <p className="mt-4 font-semibold">{tr("Nu sunt date pentru această lună.")}</p>
      ) : (
        <>
          <p className="rs-note">{tr("Perioada: {a} – {b}", { a: fmtDay(r.from), b: fmtDay(r.to) })}</p>
          <div className="rs-grid">
            <div className="rs-tile">
              <div className="rs-label">{tr("Zile active")}</div>
              <div className="rs-value">{r.activeDays} / {r.elapsed}</div>
              <div className="rs-note">{tr("Cea mai lungă serie activă: {n}", { n: r.bestRun })}</div>
            </div>
            <div className="rs-tile">
              <div className="rs-label">{tr("Obiceiuri la zi")}</div>
              <div className="rs-value">{pct(r.rate)}</div>
              <div className="rs-note">{tr("Bifate: {done} din {sched}", { done: r.done, sched: r.sched })}</div>
            </div>
            <div className="rs-tile">
              <div className="rs-label">{tr("Timp de studiu")}</div>
              <div className="rs-value">{fmtDuration(r.study.total)}</div>
              <div className="rs-note">{r.study.focus > 0 ? tr("din care Focus: {v}", { v: fmtDuration(r.study.focus) }) : tr("Zile cu studiu: {n}", { n: r.study.days })}</div>
            </div>
            <div className="rs-tile">
              <div className="rs-label">{tr("Momentum")}</div>
              <div className="rs-value">{r.momentumEnd}</div>
              <div className="rs-note">{tr("cel mai mare din lună: {n}", { n: r.momentumPeak })}</div>
            </div>
          </div>

          {r.habits.length > 0 && (
            <>
              <h3>{tr("Obiceiuri")}</h3>
              {r.habits.map((h) => (
                <div key={h.id}>
                  <div className="rs-row">
                    <span style={{ fontWeight: 700 }}>{h.name}</span>
                    <span className="rs-note" style={{ whiteSpace: "nowrap" }}>
                      {tr("Bifat: {n}", { n: h.ticks })} · {pct(h.rate)}
                    </span>
                  </div>
                  {h.rate != null && (
                    <div className="rs-bar" aria-hidden="true">
                      <i style={{ width: `${Math.round(h.rate * 100)}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {(r.study.total > 0 || r.exams.length > 0 || r.assignments.due > 0) && <h3>{tr("Școală")}</h3>}
          {r.study.total > 0 && (
            <>
              <div className="rs-row">
                <span>{tr("Timp de studiu")}</span>
                <b>{fmtDuration(r.study.total)}</b>
              </div>
              {r.study.focus > 0 && (
                <div className="rs-row">
                  <span>{tr("Sesiuni Focus: {n}", { n: r.focusCount })}</span>
                  <b>{fmtDuration(r.study.focus)}</b>
                </div>
              )}
              {r.study.bySubject.map((s) => (
                <div key={s.subject} className="rs-row">
                  <span>{s.subject}</span>
                  <b>{fmtDuration(s.minutes)}</b>
                </div>
              ))}
            </>
          )}
          {r.exams.map((e) => (
            <div key={`${e.date}-${e.title}`} className="rs-row">
              <span>
                {tr("Examen")}: {e.title}
                {e.subject ? ` (${e.subject})` : ""}
              </span>
              <span className="rs-note" style={{ whiteSpace: "nowrap" }}>
                {fmtDay(e.date)} · {e.done ? tr("Bifat") : e.past ? tr("Nebifat") : tr("Programat")}
              </span>
            </div>
          ))}
          {r.assignments.due > 0 && (
            <div className="rs-row">
              <span>{tr("Teme cu termen în această lună")}</span>
              <b>{tr("{done} din {due} bifate", { done: r.assignments.done, due: r.assignments.due })}</b>
            </div>
          )}
          {r.todosDone > 0 && (
            <div className="rs-row">
              <span>{tr("To-do-uri bifate")}</span>
              <b>{r.todosDone}</b>
            </div>
          )}
        </>
      )}
      <p className="rs-note" style={{ marginTop: 20 }}>
        {tr("Raportul arată doar ce ai notat în Molted. Nu înlocuiește notele sau părerea profesorilor.")} {tr("Generat la {v}", { v: fmtDay(today) })}
      </p>
    </div>
  );
}

export function MonthReport({ open, onClose, state, days, today }) {
  const [ym, setYm] = useState(monthKey(today));
  useEffect(() => {
    if (open) setYm(monthKey(today));
  }, [open, today]);
  if (!open) return null;
  const first = days?.length ? monthKey(days[0].day) : monthKey(today);
  const r = monthReport(state, days, ym, today);
  const nick = state.profile?.nick || "";
  const print = () => {
    const done = () => document.body.classList.remove("printing-report");
    document.body.classList.add("printing-report");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    setTimeout(done, 1000); // browsers that do not report afterprint
  };
  return (
    <>
      <Modal
        open
        wide
        onClose={onClose}
        title={tr("Raport lunar")}
        icon={FileText}
        tone="violet"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>{tr("Închide")}</Button>
            <Button icon={Printer} onClick={print} disabled={r.empty}>{tr("Tipărește sau salvează PDF")}</Button>
          </>
        }
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={ym <= first} onClick={() => setYm(shiftMonth(ym, -1))} aria-label={tr("Luna anterioară")} />
          <span className="font-display text-lg text-ink">{fmtMonth(ym)}</span>
          <Button variant="ghost" size="sm" icon={ChevronRight} disabled={ym >= monthKey(today)} onClick={() => setYm(shiftMonth(ym, 1))} aria-label={tr("Luna următoare")} />
        </div>
        <Sheet r={r} nick={nick} today={today} />
      </Modal>
      {createPortal(
        <div className="report-print">
          <Sheet r={r} nick={nick} today={today} />
        </div>,
        document.body
      )}
    </>
  );
}
