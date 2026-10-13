import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Sparkles, Wand2 } from "lucide-react";
import { Button, Panel, SectionTitle, Skeleton } from "./ui.jsx";
import { aiErrorCopy, habitInsights, weeklyReflection } from "../lib/ai.js";
import { coachData, hasHistory } from "../lib/coach.js";
import { getClient } from "../lib/supabase.js";
import { isoWeek, load as loadReflections, save as saveReflection } from "../lib/reflections.js";

/**
 * One AI call per click, result kept until the next click. Not run on mount: every call
 * counts against the daily limit, and the player decides when the numbers are worth asking about.
 */
export function useCoach(ask) {
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

export function Shell({ icon, title, sub, state, run, label, children, always }) {
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
      {always}
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

export function ReflectionPanel({ state, today, ai }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState([]);
  const server = !!ai?.server;
  useEffect(() => {
    if (!server) return;
    getClient().then((c) => loadReflections(c)).then(setHistory).catch(() => {}); // history is a bonus; the panel works without it
  }, [server]);
  const [s, run] = useCoach(async (signal) => {
    const r = await weeklyReflection(data, answer, signal);
    try {
      const saved = await saveReflection(await getClient(), { ...r, week: isoWeek(today), answer: answer.trim() });
      setHistory((h) => [saved, ...h].slice(0, 5));
    } catch {
      // not saved (offline, old schema): the answer is still shown
    }
    return r;
  });
  if (!ai?.server || !hasHistory(data)) return null;
  return (
    <Shell icon={BookOpen} title="Reflecție de săptămână" sub="Spune ce te-a ajutat sau ce te-a blocat, iar coach-ul propune un singur pas" state={s} run={() => answer.trim() && run()} label="Reflectează" always={history.length > 0 && <ReflectionHistory items={history} />}>
      <textarea className="field min-h-20 w-full resize-y" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ce ți-a făcut săptămâna mai ușoară sau mai grea?" aria-label="Răspuns pentru reflecție" />
      {s.data && (
        <div className="mt-3 inset p-3 text-sm font-semibold text-body">
          <p><strong className="text-ink">Observație:</strong> {s.data.observation}</p>
          <p className="mt-2"><strong className="text-ink">Următorul pas:</strong> {s.data.nextStep}</p>
          {s.data.dataUsed.length > 0 && <p className="mt-2 text-xs font-bold text-dim">Date folosite: {s.data.dataUsed.join(" · ")}.</p>}
        </div>
      )}
    </Shell>
  );
}

function ReflectionHistory({ items }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-extrabold text-dim hover:text-ink">Reflecții anterioare ({items.length})</summary>
      <ul className="mt-2 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="inset p-3 text-sm font-semibold text-body">
            <p className="text-xs font-bold text-dim">{r.week}</p>
            <p className="mt-1"><strong className="text-ink">Observație:</strong> {r.observation}</p>
            <p className="mt-1"><strong className="text-ink">Următorul pas:</strong> {r.nextStep}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

const STRENGTH = { strong: "dovezi solide", moderate: "dovezi moderate", theory: "model teoretic" };
/** "Sheeran, Listrom & Gollwitzer (2025). Title…" -> "Sheeran, Listrom & Gollwitzer 2025" */
const shortCite = (cite) => {
  const m = /^(.*?)\s*\((\d{4})\)/.exec(cite || "");
  return m ? `${m[1]} ${m[2]}` : cite;
};

export function Sources({ sources }) {
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
