import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "./ui.jsx";
import { CoachNotes } from "./CoachNotes.jsx";
import { NeedHistory, Shell, Sources, useCoach } from "./AiCoach.jsx";
import { scheduleLabel } from "./HabitEditor.jsx";
import { agentClient, aiErrorCopy, coachAgent } from "../lib/ai.js";
import { cancelExperiment, decideAction, finishDue, loadExperiments, startExperiment } from "../lib/agentLog.js";
import { coachData, hasHistory } from "../lib/coach.js";
import { habitFromCatalog } from "../lib/catalog.js";
import { activeContext, addNote, loadNotes, removeNote } from "../lib/memory.js";
import { FACTORS } from "../lib/experiments.js";
import { fmtDay } from "../lib/dates.js";
import { tr } from "../lib/i18n.js";

const REJECT_REASONS = [tr("Nu am timp"), tr("E prea greu"), tr("Nu mi se potrivește")];

const stepText = (x) => {
  switch (x.kind) {
    case "stats":
      return tr("A citit bifările tale din ultimele 4 săptămâni");
    case "context":
      return tr("A citit ce i-ai spus ({notes} {v})", { notes: x.notes, v: x.notes === 1 ? tr("notă activă") : tr("note active") });
    case "feedback":
      return tr("A verificat cum ai reacționat la propunerile anterioare");
    case "history":
      return tr("A verificat ce a făcut înainte și ce efect a avut ({count})", { count: x.count });
    case "experiments":
      return tr("A verificat experimentele tale ({count})", { count: x.count });
    case "school":
      return tr("A citit planul tău de școală ({exams} examene, {assignments} teme)", { exams: x.exams, assignments: x.assignments });
    case "patterns":
      return tr("A rulat testele statistice: {findings} {v} din {tested} verificări", { findings: x.findings, v: x.findings === 1 ? tr("tipar a trecut") : tr("tipare au trecut"), tested: x.tested });
    case "search":
      return tr("A căutat în cercetare: „{query}” ({v} surse)", { query: x.query, v: x.sources?.length || 0 });
    default:
      return null;
  }
};

/**
 * The coach agent (Obiceiuri). It reads the data, the notes, its own history and the research itself;
 * every change is applied by the player, never on its own. `steps` shows what it did, so the answer
 * can be checked, and each decision is logged (agent_actions) and remembered as feedback.
 */
export function PlanPanel({ state, today, ai, onAddHabit, onEdit, onExperiment, onNotes }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [s, run, history] = useCoach((signal) => coachAgent(today, signal), { kind: "week" });
  const [decided, setDecided] = useState({}); // index -> "accepted" | "rejected"
  const [rejecting, setRejecting] = useState(null);
  const [problem, setProblem] = useState("");
  if (!ai?.server) return null;
  // not hidden: say what is missing, so a new player knows Molt is there and why it waits
  if (!hasHistory(data)) return <NeedHistory data={data} onNotes={onNotes} />;

  const record = async (sg, i, decision, reason) => {
    setProblem("");
    try {
      await decideAction(await agentClient(), { id: sg.id, proposal: sg, decision, reason });
    } catch {
      /* the log is best effort: the player's decision still stands */
    }
    setDecided((d) => ({ ...d, [i]: decision }));
    setRejecting(null);
  };

  const accept = async (sg, i) => {
    setProblem("");
    if (sg.action === "experiment") {
      try {
        await startExperiment(await agentClient(), sg);
      } catch (e) {
        setProblem(aiErrorCopy(e?.code));
        return;
      }
      onExperiment?.();
      return record(sg, i, "accepted");
    }
    if (sg.action === "add") {
      onAddHabit({ ...habitFromCatalog({ id: null, name: sg.name, icon: "target", cat: state.profile?.path || "sport", diff: sg.diff, days: sg.days, time: null, target: "" }, state.habits || [], today), catalogId: undefined });
    } else {
      const habit = (state.habits || []).find((h) => h.id === sg.habitId);
      if (habit) onEdit({ ...habit, diff: sg.diff, days: sg.days }); // opens the editor with the change filled in
    }
    return record(sg, i, "accepted");
  };

  const r = s.data;
  const habitName = (id) => (state.habits || []).find((h) => h.id === id)?.name;
  return (
    <Shell state={s} run={run} label={tr("Cere un plan")} idle={tr("Aici apar schimbările propuse pentru săptămâna viitoare.")} history={history} summary={(d) => d?.summary || (d?.proposals || []).map((p) => p.name || p.title).filter(Boolean).join(" · ")}>
      {r && (
        <div className="space-y-3">
          {r.summary && <p className="text-[15px] font-semibold text-ink">{r.summary}</p>}
          {r.notEnoughData && (
            <p className="text-sm font-semibold text-dim">{tr("Încă prea puține zile ca să spun ceva despre progresul tău: cel mai lung obicei are {longest} din {needed} zile programate necesare.", { longest: r.notEnoughData.longest, needed: r.notEnoughData.needed })}</p>
          )}
          {problem && (
            <p role="alert" className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">
              {problem}
            </p>
          )}
          {r.proposals.length === 0 ? (
            !r.notEnoughData && <p className="text-sm font-semibold text-dim">{tr("Nicio schimbare propusă acum.")}</p>
          ) : (
            <ul className="space-y-2">
              {r.proposals.map((sg, i) => (
                <li key={i} className="inset space-y-2 p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {sg.action === "todo" ? (
                        <>
                          <p className="text-sm font-extrabold text-ink">{tr("To-do: {title}", { title: sg.title })}</p>
                          <p className="text-xs font-bold text-dim">{tr("{fmtDay} · {dur} min · îl găsești în „Ce a făcut Molt”, de unde îl aplici", { fmtDay: fmtDay(sg.date), dur: sg.dur })}</p>
                        </>
                      ) : sg.action === "experiment" ? (
                        <>
                          <p className="text-sm font-extrabold text-ink">
                            <FlaskConical size={14} className="mr-1 inline text-violet-hi" aria-hidden="true" />{tr("Experiment de 2 săptămâni: {habitName}", { habitName: habitName(sg.habitId) })}</p>
                          {sg.experiment ? (
                            <p className="text-xs font-bold text-dim">{tr("{label} · {fmtDay} – {fmtDay2} · {length} zile", { label: sg.experiment.label, fmtDay: fmtDay(sg.experiment.startDay), fmtDay2: fmtDay(sg.experiment.endDay), length: Object.keys(sg.experiment.assignments).length })}</p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-extrabold text-ink">
                            {sg.action === "add" ? tr("Obicei nou: ") : tr("Schimbă: ")}
                            {sg.action === "add" ? sg.name : habitName(sg.habitId)}
                          </p>
                          <p className="text-xs font-bold text-dim">
                            {[tr("Ușor"), tr("Mediu"), tr("Greu")][sg.diff - 1]} · {scheduleLabel(sg.days)}
                          </p>
                        </>
                      )}
                      <p className="mt-1 text-sm font-semibold text-body">{sg.reason}</p>
                      {sg.experiment && (
                        <p className="mt-1 text-xs font-semibold text-dim">{tr("Zilele sunt trase la sorți. În zilele B: {replace}", { replace: sg.experiment.instruction.replace(/^În zilele B, /, "") })}</p>
                      )}
                      <Sources sources={sg.sources} />
                    </div>
                    {!decided[i] && sg.action !== "todo" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="mint" icon={Plus} onClick={() => accept(sg, i)}>
                          {sg.action === "experiment" ? tr("Începe") : sg.action === "add" ? tr("Adaugă") : tr("Aplică")}
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => setRejecting(rejecting === i ? null : i)}>{tr("Nu")}</Button>
                      </div>
                    )}
                    {decided[i] && <span className="text-xs font-extrabold text-dim">{decided[i] === "accepted" ? tr("Acceptat") : tr("Respins")}</span>}
                  </div>
                  {rejecting === i && !decided[i] && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-dim">{tr("De ce?")}</span>
                      {REJECT_REASONS.map((t) => (
                        <button key={t} type="button" onClick={() => record(sg, i, "rejected", t)} className="rounded-full bg-well px-2.5 py-1 text-xs font-extrabold text-ink ring-1 ring-edge hover:ring-edge-hi">
                          {t}
                        </button>
                      ))}
                      <button type="button" onClick={() => record(sg, i, "rejected")} className="text-xs font-bold text-dim underline">{tr("fără motiv")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {r.steps.some((x) => stepText(x)) && (
            <details className="text-xs font-bold text-dim">
              <summary className="cursor-pointer font-extrabold hover:text-ink">{tr("Ce a verificat Molt ca să ajungă aici")}</summary>
              <ol className="mt-2 space-y-1">
                {r.steps
                  .map((x) => [x, stepText(x)])
                  .filter(([, t]) => t)
                  .map(([x, t], i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {x.kind === "search" ? <Search size={12} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
                      {t}
                    </li>
                  ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </Shell>
  );
}

/** What the player tells the coach (events, constraints, preferences): kept private, read by the agent. */
export function NotesPanel({ ai, today }) {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ai?.server) return undefined;
    let live = true;
    (async () => {
      const client = await agentClient();
      const rows = client ? await loadNotes(client) : [];
      if (live) setNotes(activeContext(rows, today));
    })().catch(() => live && setNotes([]));
    return () => {
      live = false;
    };
  }, [ai?.server, today]);

  if (!ai?.server) return null;

  const onAdd = async ({ kind, body, endsOn }) => {
    setBusy(true);
    setError("");
    try {
      const client = await agentClient();
      const row = await addNote(client, { kind, body, endsOn }, today);
      setNotes((n) => [row, ...(n || [])]);
      return true;
    } catch (e) {
      setError(aiErrorCopy(e?.code));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const onRemove = async (id) => {
    setError("");
    try {
      await removeNote(await agentClient(), id);
      setNotes((n) => (n || []).filter((x) => x.id !== id));
    } catch (e) {
      setError(aiErrorCopy(e?.code));
    }
  };
  return <CoachNotes notes={notes} onAdd={onAdd} onRemove={onRemove} busy={busy} error={error} />;
}

const VERDICT = {
  B_better: (r) => tr("Varianta B a mers mai bine: {pct} față de {pct2} (diferență {signed}). E un singur test mic pe tine, deci tratează-l ca pe un indiciu, nu ca pe o dovadă.", { pct: pct(r.rateB), pct2: pct(r.rateA), signed: signed(r.diff) }),
  A_better: (r) => tr("Varianta A a mers mai bine: {pct} față de {pct2} (diferență {signed}). E un singur test mic pe tine, deci tratează-l ca pe un indiciu, nu ca pe o dovadă.", { pct: pct(r.rateA), pct2: pct(r.rateB), signed: signed(r.diff) }),
  no_clear_difference: (r) => tr("Datele nu pot spune care variantă e mai bună: {pct} (A) față de {pct2} (B), cu un interval de la {signed} la {signed2}. Două săptămâni sunt prea puține ca să decidă.", { pct: pct(r.rateA), pct2: pct(r.rateB), signed: signed(r.ci?.[0]), signed2: signed(r.ci?.[1]) }),
  insufficient: () => tr("Prea puține zile observate ca să se poată spune ceva."),
};
const pct = (v) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const signed = (v) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)} p.p.`);

/** The running experiment (what to do today) and the finished ones with their honest verdict. */
export function ExperimentsPanel({ state, today, ai, refreshKey = 0 }) {
  const [list, setList] = useState(null);
  const reload = useCallback(async () => {
    const client = await agentClient();
    if (!client) return setList([]);
    const rows = await loadExperiments(client);
    if (await finishDue(client, rows, state, today)) setList([...rows]);
    else setList(rows);
  }, [state, today]);

  useEffect(() => {
    if (ai?.server) reload().catch(() => setList([]));
  }, [ai?.server, reload, refreshKey]);

  if (!ai?.server || !list || list.length === 0) return null;
  const habitName = (id) => (state.habits || []).find((h) => h.id === id)?.name || tr("obicei");
  const running = list.find((e) => e.status === "running");
  const done = list.filter((e) => e.status === "done").slice(0, 3);
  const arm = running?.assignments?.[today];
  const f = running ? FACTORS[running.factor] : null;

  return (
    <section className="mt-6 space-y-3 border-t border-edge/60 pt-5" aria-label={tr("Experimente")}>
      <div>
        <h3 className="flex items-center gap-2 font-pixel text-lg text-ink">
          <FlaskConical size={16} className="text-violet-hi" aria-hidden="true" />{tr("Experimentele tale")}</h3>
        <p className="text-xs font-semibold text-dim">{tr("Teste pe tine însuți: zilele sunt trase la sorți, iar rezultatul e raportat cu incertitudine.")}</p>
      </div>
      {running && (
        <div className="inset space-y-1 p-3">
          <p className="text-sm font-extrabold text-ink">
            {f?.label}: {habitName(running.habitId)}
          </p>
          <p className="text-xs font-bold text-dim">
            {fmtDay(running.startDay)} – {fmtDay(running.endDay)}
          </p>
          <p className="text-sm font-semibold text-body">
            {arm === "B" ? tr("Azi e zi B: {replace}", { replace: f?.instruction.replace(/^În zilele B, /, "") }) : arm === "A" ? tr("Azi e zi A: fă obiceiul ca de obicei.") : tr("Azi nu e zi de test pentru acest obicei.")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await cancelExperiment(await agentClient(), running.id);
              reload();
            }}
          >{tr("Anulează experimentul")}</Button>
        </div>
      )}
      {done.map((e) => (
        <div key={e.id} className="inset space-y-1 p-3">
          <p className="text-sm font-extrabold text-ink">
            {FACTORS[e.factor]?.label}: {habitName(e.habitId)}
          </p>
          <p className="text-sm font-semibold text-body">{(VERDICT[e.result?.verdict] || VERDICT.insufficient)(e.result || {})}</p>
        </div>
      ))}
    </section>
  );
}
