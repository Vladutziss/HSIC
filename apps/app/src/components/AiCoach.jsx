import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarCheck, Plus, Search, Sparkles, Wand2 } from "lucide-react";
import { Button, Panel, SectionTitle, Skeleton } from "./ui.jsx";
import { aiErrorCopy, coachAgent, habitInsights } from "../lib/ai.js";
import { coachData, hasHistory } from "../lib/coach.js";
import { habitFromCatalog } from "../lib/catalog.js";
import { scheduleLabel } from "./HabitEditor.jsx";

/**
 * One AI call per click, result kept until the next click. Not run on mount: every call
 * counts against the daily limit, and the player decides when the numbers are worth asking about.
 */
function useCoach(ask) {
  const [s, setS] = useState({ status: "idle", data: null, error: "" });
  const ctl = useRef(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const run = () => {
    ctl.current?.abort();
    ctl.current = new AbortController();
    setS({ status: "busy", data: null, error: "" });
    ask(ctl.current.signal)
      .then((data) => setS({ status: "done", data, error: "" }))
      .catch((e) => e?.code !== "cancelled" && setS({ status: "error", data: null, error: aiErrorCopy(e?.code) }));
  };
  return [s, run];
}

function Shell({ icon, title, sub, state, run, label, children }) {
  return (
    <Panel tone="violet" className="p-4 sm:p-5">
      <SectionTitle
        icon={icon}
        tone="violet"
        sub={sub}
        action={
          <Button size="sm" variant="ghost" icon={Sparkles} busy={state.status === "busy"} disabled={state.status === "busy"} onClick={run}>
            {state.status === "done" ? "Din nou" : label}
          </Button>
        }
      >
        {title}
      </SectionTitle>
      {state.status === "busy" && <Skeleton className="h-24" />}
      {state.status === "error" && <p className="text-sm font-semibold text-dim">{state.error}</p>}
      {state.status === "done" && children}
    </Panel>
  );
}

/** Patterns in the last 4 weeks of check-ins (Statistici). */
export function InsightsPanel({ state, today, ai }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [s, run] = useCoach((signal) => habitInsights(data, signal));
  if (!ai?.server || !hasHistory(data)) return null;
  return (
    <Shell icon={Wand2} title="Ce observă AI-ul" sub="Tipare din ultimele 4 săptămâni, calculate din bifările tale" state={s} run={run} label="Analizează">
      <ul className="grid gap-3 md:grid-cols-3">
        {s.data?.map((i) => (
          <li key={i.title} className="inset p-3">
            <p className="text-sm font-extrabold text-ink">{i.title}</p>
            <p className="mt-1 text-sm font-semibold text-body">{i.text}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

const STRENGTH = { strong: "dovezi solide", moderate: "dovezi moderate", theory: "model teoretic" };
/** "Sheeran, Listrom & Gollwitzer (2025). Title…" -> "Sheeran, Listrom & Gollwitzer 2025" */
const shortCite = (cite) => {
  const m = /^(.*?)\s*\((\d{4})\)/.exec(cite || "");
  return m ? `${m[1]} ${m[2]}` : cite;
};

function Sources({ sources }) {
  if (!sources.length) return <p className="mt-1 text-[11px] font-bold text-faint">Fără sursă din cercetare: propunerea vine doar din datele tale.</p>;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-[11px] font-extrabold text-dim hover:text-ink">
        <BookOpen size={12} className="mr-1 inline" aria-hidden="true" />
        {sources.map((s) => `${shortCite(s.cite)} (${STRENGTH[s.strength] || s.strength})`).join(" · ")}
      </summary>
      <ul className="mt-1.5 space-y-2">
        {sources.map((s) => (
          <li key={s.id} className="text-xs font-semibold text-body">
            <p>{s.cite}</p>
            <p className="mt-0.5 text-dim">Limită: {s.limits}</p>
            <a className="text-sky underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
              doi.org/{s.doi}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The coach agent (Obiceiuri). It reads the data and the research itself; every change is applied
 * by the player, never on its own. `steps` shows what it did, so the answer can be checked.
 */
export function PlanPanel({ state, today, ai, onAddHabit, onEdit }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [s, run] = useCoach((signal) => coachAgent(today, signal));
  const [applied, setApplied] = useState([]);
  if (!ai?.server || !hasHistory(data)) return null;

  const apply = (sg, i) => {
    if (sg.action === "add") {
      onAddHabit({ ...habitFromCatalog({ id: null, name: sg.name, icon: "target", cat: state.profile?.path || "sport", diff: sg.diff, days: sg.days, time: null, target: "" }, state.habits || [], today), catalogId: undefined });
      setApplied((a) => [...a, i]);
    } else {
      const habit = (state.habits || []).find((h) => h.id === sg.habitId);
      if (habit) onEdit({ ...habit, diff: sg.diff, days: sg.days }); // opens the editor with the change filled in
    }
  };

  const r = s.data;
  return (
    <Shell icon={CalendarCheck} title="Coach-ul tău" sub="Citește bifările tale și cercetarea, apoi propune pașii pentru săptămâna viitoare" state={s} run={run} label="Cere un plan">
      {r && (
        <div className="space-y-3">
          <ol className="space-y-1 text-xs font-bold text-dim">
            {r.steps
              .filter((x) => x.kind !== "propose")
              .map((x, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {x.kind === "stats" ? <Sparkles size={12} aria-hidden="true" /> : <Search size={12} aria-hidden="true" />}
                  {x.kind === "stats" ? "A citit bifările tale din ultimele 4 săptămâni" : `A căutat în cercetare: „${x.query}” (${x.sources?.length || 0} surse)`}
                </li>
              ))}
          </ol>
          {r.summary && <p className="text-sm font-semibold text-body">{r.summary}</p>}
          {r.proposals.length === 0 ? (
            <p className="text-sm font-semibold text-dim">Nicio schimbare propusă acum.</p>
          ) : (
            <ul className="space-y-2">
              {r.proposals.map((sg, i) => (
                <li key={i} className="inset flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-ink">
                      {sg.action === "add" ? "Obicei nou: " : "Schimbă: "}
                      {sg.action === "add" ? sg.name : (state.habits || []).find((h) => h.id === sg.habitId)?.name}
                    </p>
                    <p className="text-xs font-bold text-dim">
                      {["Ușor", "Mediu", "Greu"][sg.diff - 1]} · {scheduleLabel(sg.days)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-body">{sg.reason}</p>
                    <Sources sources={sg.sources} />
                  </div>
                  <Button size="sm" variant="mint" icon={Plus} disabled={applied.includes(i)} onClick={() => apply(sg, i)}>
                    {applied.includes(i) ? "Adăugat" : sg.action === "add" ? "Adaugă" : "Aplică"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}
