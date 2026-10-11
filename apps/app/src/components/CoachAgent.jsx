import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarCheck, FlaskConical, Plus, Search, Sparkles, X } from "lucide-react";
import { Button, Panel, SectionTitle } from "./ui.jsx";
import { CoachNotes } from "./CoachNotes.jsx";
import { Shell, Sources, useCoach } from "./AiCoach.jsx";
import { scheduleLabel } from "./HabitEditor.jsx";
import { agentClient, aiErrorCopy, coachAgent } from "../lib/ai.js";
import { cancelExperiment, decideAction, finishDue, loadExperiments, startExperiment } from "../lib/agentLog.js";
import { coachData, hasHistory } from "../lib/coach.js";
import { habitFromCatalog } from "../lib/catalog.js";
import { activeContext, addNote, loadNotes, removeNote } from "../lib/memory.js";
import { FACTORS } from "../lib/experiments.js";
import { fmtDay } from "../lib/dates.js";

const REJECT_REASONS = ["Nu am timp", "E prea greu", "Nu mi se potrivește"];

const stepText = (x) => {
  switch (x.kind) {
    case "stats":
      return "A citit bifările tale din ultimele 4 săptămâni";
    case "context":
      return `A citit ce i-ai spus (${x.notes} ${x.notes === 1 ? "notă activă" : "note active"})`;
    case "feedback":
      return "A verificat cum ai reacționat la propunerile anterioare";
    case "history":
      return `A verificat ce a făcut înainte și ce efect a avut (${x.count})`;
    case "experiments":
      return `A verificat experimentele tale (${x.count})`;
    case "patterns":
      return `A rulat testele statistice: ${x.findings} ${x.findings === 1 ? "tipar a trecut" : "tipare au trecut"} din ${x.tested} verificări`;
    case "search":
      return `A căutat în cercetare: „${x.query}” (${x.sources?.length || 0} surse)`;
    default:
      return null;
  }
};

/**
 * The coach agent (Obiceiuri). It reads the data, the notes, its own history and the research itself;
 * every change is applied by the player, never on its own. `steps` shows what it did, so the answer
 * can be checked, and each decision is logged (agent_actions) and remembered as feedback.
 */
export function PlanPanel({ state, today, ai, onAddHabit, onEdit, onExperiment }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [s, run] = useCoach((signal) => coachAgent(today, signal));
  const [decided, setDecided] = useState({}); // index -> "accepted" | "rejected"
  const [rejecting, setRejecting] = useState(null);
  const [problem, setProblem] = useState("");
  if (!ai?.server) return null;
  if (!hasHistory(data)) {
    // not hidden: say what is missing, so a new player knows the coach is there and why it waits
    const best = Math.max(0, ...data.habits.map((h) => h.sched));
    return (
      <Panel tone="violet" className="p-4 sm:p-5">
        <SectionTitle icon={CalendarCheck} tone="violet" sub="Lucrează cu istoricul tău real, nu cu presupuneri">
          Coach-ul tău
        </SectionTitle>
        <p className="text-sm font-semibold text-body">
          Mai are nevoie de câteva zile de bifări: caută tipare abia când un obicei are cel puțin 7 zile programate în ultimele 4 săptămâni (acum cel mai lung are {best}).
          Până atunci poți nota ce se întâmplă în „Notele coach-ului”.
        </p>
      </Panel>
    );
  }

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
    <Shell icon={CalendarCheck} title="Coach-ul tău" sub="Citește bifările, notele și cercetarea, apoi propune pașii pentru săptămâna viitoare" state={s} run={run} label="Cere un plan">
      {r && (
        <div className="space-y-3">
          <ol className="space-y-1 text-xs font-bold text-dim">
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
          {r.summary && <p className="text-sm font-semibold text-body">{r.summary}</p>}
          {r.notEnoughData && (
            <p className="text-sm font-semibold text-dim">
              Încă prea puține zile ca să spun ceva despre progresul tău: cel mai lung obicei are {r.notEnoughData.longest} din {r.notEnoughData.needed} zile programate necesare.
            </p>
          )}
          {problem && (
            <p role="alert" className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">
              {problem}
            </p>
          )}
          {r.proposals.length === 0 ? (
            !r.notEnoughData && <p className="text-sm font-semibold text-dim">Nicio schimbare propusă acum.</p>
          ) : (
            <ul className="space-y-2">
              {r.proposals.map((sg, i) => (
                <li key={i} className="inset space-y-2 p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {sg.action === "experiment" ? (
                        <>
                          <p className="text-sm font-extrabold text-ink">
                            <FlaskConical size={14} className="mr-1 inline text-violet-hi" aria-hidden="true" />
                            Experiment de 2 săptămâni: {habitName(sg.habitId)}
                          </p>
                          {sg.experiment ? (
                            <p className="text-xs font-bold text-dim">
                              {sg.experiment.label} · {fmtDay(sg.experiment.startDay)} – {fmtDay(sg.experiment.endDay)} · {Object.keys(sg.experiment.assignments).length} zile
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-extrabold text-ink">
                            {sg.action === "add" ? "Obicei nou: " : "Schimbă: "}
                            {sg.action === "add" ? sg.name : habitName(sg.habitId)}
                          </p>
                          <p className="text-xs font-bold text-dim">
                            {["Ușor", "Mediu", "Greu"][sg.diff - 1]} · {scheduleLabel(sg.days)}
                          </p>
                        </>
                      )}
                      <p className="mt-1 text-sm font-semibold text-body">{sg.reason}</p>
                      {sg.experiment && (
                        <p className="mt-1 text-xs font-semibold text-dim">
                          Zilele sunt trase la sorți. În zilele B: {sg.experiment.instruction.replace(/^În zilele B, /, "")}
                        </p>
                      )}
                      <Sources sources={sg.sources} />
                    </div>
                    {!decided[i] && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="mint" icon={Plus} onClick={() => accept(sg, i)}>
                          {sg.action === "experiment" ? "Începe" : sg.action === "add" ? "Adaugă" : "Aplică"}
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => setRejecting(rejecting === i ? null : i)}>
                          Nu
                        </Button>
                      </div>
                    )}
                    {decided[i] && <span className="text-xs font-extrabold text-dim">{decided[i] === "accepted" ? "Acceptat" : "Respins"}</span>}
                  </div>
                  {rejecting === i && !decided[i] && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-dim">De ce?</span>
                      {REJECT_REASONS.map((t) => (
                        <button key={t} type="button" onClick={() => record(sg, i, "rejected", t)} className="rounded-full bg-well px-2.5 py-1 text-xs font-extrabold text-ink ring-1 ring-edge hover:ring-edge-hi">
                          {t}
                        </button>
                      ))}
                      <button type="button" onClick={() => record(sg, i, "rejected")} className="text-xs font-bold text-dim underline">
                        fără motiv
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
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
  B_better: (r) => `Varianta B a mers mai bine: ${pct(r.rateB)} față de ${pct(r.rateA)} (diferență ${signed(r.diff)}). E un singur test mic pe tine, deci tratează-l ca pe un indiciu, nu ca pe o dovadă.`,
  A_better: (r) => `Varianta A a mers mai bine: ${pct(r.rateA)} față de ${pct(r.rateB)} (diferență ${signed(r.diff)}). E un singur test mic pe tine, deci tratează-l ca pe un indiciu, nu ca pe o dovadă.`,
  no_clear_difference: (r) => `Datele nu pot spune care variantă e mai bună: ${pct(r.rateA)} (A) față de ${pct(r.rateB)} (B), cu un interval de la ${signed(r.ci?.[0])} la ${signed(r.ci?.[1])}. Două săptămâni sunt prea puține ca să decidă.`,
  insufficient: () => "Prea puține zile observate ca să se poată spune ceva.",
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
  const habitName = (id) => (state.habits || []).find((h) => h.id === id)?.name || "obicei";
  const running = list.find((e) => e.status === "running");
  const done = list.filter((e) => e.status === "done").slice(0, 3);
  const arm = running?.assignments?.[today];
  const f = running ? FACTORS[running.factor] : null;

  return (
    <Panel tone="violet" className="space-y-3 p-4 sm:p-5">
      <SectionTitle icon={FlaskConical} tone="violet" sub="Teste pe tine însuți: zilele sunt trase la sorți, iar rezultatul e raportat cu incertitudine">
        Experimente
      </SectionTitle>
      {running && (
        <div className="inset space-y-1 p-3">
          <p className="text-sm font-extrabold text-ink">
            {f?.label}: {habitName(running.habitId)}
          </p>
          <p className="text-xs font-bold text-dim">
            {fmtDay(running.startDay)} – {fmtDay(running.endDay)}
          </p>
          <p className="text-sm font-semibold text-body">
            {arm === "B" ? `Azi e zi B: ${f?.instruction.replace(/^În zilele B, /, "")}` : arm === "A" ? "Azi e zi A: fă obiceiul ca de obicei." : "Azi nu e zi de test pentru acest obicei."}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await cancelExperiment(await agentClient(), running.id);
              reload();
            }}
          >
            Anulează experimentul
          </Button>
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
    </Panel>
  );
}
