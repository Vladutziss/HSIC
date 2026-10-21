import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clock, History, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button, Skeleton } from "./ui.jsx";
import { aiErrorCopy, habitInsights, weeklyReflection } from "../lib/ai.js";
import { coachData, hasHistory } from "../lib/coach.js";
import { getClient } from "../lib/supabase.js";
import { isoWeek, load as loadReflections, save as saveReflection } from "../lib/reflections.js";
import { loadResults, removeResult, saveResult } from "../lib/aiHistory.js";
import { getLocale, tr } from "../lib/i18n.js";

/**
 * One AI call per click. Not run on mount: every call counts against the daily limit, and the player decides when the
 * numbers are worth asking about.
 *
 * With `opts` ({kind, label: () => string}) the answers are also kept per account (table ai_results): the newest one is
 * shown again after a refresh or a change of page, and the older ones are listed in the history (third value).
 */
export function useCoach(ask, opts) {
  const [s, setS] = useState({ status: "idle", data: null, error: "", at: null });
  const [items, setItems] = useState([]);
  const ctl = useRef(null);
  const asked = useRef(false);
  const kind = opts?.kind;
  const labelRef = useRef(opts?.label);
  labelRef.current = opts?.label;
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => {
    if (!kind) return undefined;
    let live = true;
    getClient()
      .then((c) => loadResults(c, kind))
      .then((list) => {
        if (!live) return;
        setItems(list);
        // the last answer is back on screen, unless the player already asked again in the meantime
        if (list[0] && !asked.current) setS({ status: "done", data: list[0].data, error: "", at: list[0].createdAt, id: list[0].id });
      })
      .catch(() => {}); // the history is a bonus
    return () => {
      live = false;
    };
  }, [kind]);
  const run = () => {
    asked.current = true;
    ctl.current?.abort();
    ctl.current = new AbortController();
    setS({ status: "busy", data: null, error: "", at: null });
    ask(ctl.current.signal)
      .then(async (data) => {
        let saved = null;
        if (kind) {
          try {
            saved = await saveResult(await getClient(), kind, labelRef.current?.() || "", data);
          } catch {
            // not saved (offline, old schema): the answer is still shown
          }
        }
        if (saved) setItems((l) => [saved, ...l].slice(0, 20));
        setS({ status: "done", data, error: "", at: saved?.createdAt || new Date().toISOString(), id: saved?.id });
      })
      .catch((e) => e?.code !== "cancelled" && setS({ status: "error", data: null, error: aiErrorCopy(e?.code), at: null }));
  };
  const history = kind
    ? {
        items,
        activeId: s.id,
        pick: (it) => {
          asked.current = true;
          ctl.current?.abort();
          setS({ status: "done", data: it.data, error: "", at: it.createdAt, id: it.id });
        },
        remove: async (it) => {
          try {
            await removeResult(await getClient(), it.id);
          } catch {
            return;
          }
          setItems((l) => l.filter((x) => x.id !== it.id));
          setS((cur) => (cur.id === it.id ? { status: "idle", data: null, error: "", at: null } : cur));
        },
      }
    : null;
  return [s, run, history];
}

const stamp = (iso) => (iso ? new Date(iso).toLocaleString(getLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** The older answers of one ability: pick one to see it again, or remove it. `summary(data)` is its one-line preview. */
function HistoryList({ history, summary }) {
  if (!history?.items.length) return null;
  return (
    <details className="mt-5 border-t border-edge/60 pt-3">
      <summary className="cursor-pointer text-xs font-extrabold text-dim hover:text-ink">
        <History size={13} className="mr-1.5 inline" aria-hidden="true" />
        {tr("Istoric ({length})", { length: history.items.length })}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {history.items.map((it) => (
          <li key={it.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ring-1 ${it.id === history.activeId ? "bg-violet/10 ring-violet/40" : "bg-well ring-edge"}`}>
            <button type="button" onClick={() => history.pick(it)} className="focus-ring min-w-0 flex-1 rounded-lg text-left">
              <span className="block text-[11px] font-bold text-dim">{stamp(it.createdAt)}{it.label ? ` · ${it.label}` : ""}</span>
              <span className="block truncate text-sm font-semibold text-body">{summary?.(it.data) || ""}</span>
            </button>
            <button type="button" onClick={() => history.remove(it)} className="focus-ring shrink-0 rounded-lg p-1.5 text-faint hover:text-rose" aria-label={tr("Șterge din istoric")}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

// The body of one Molt ability: the question (`input`), the action button right next to it, then the answer.
// `input` is always visible (what the player types or picks); `children` is the answer, shown once the AI replied;
// `hint` says why a tap did nothing yet; `idle` says where the answer will appear; `always` sits under the answer; `stack` puts the button under a wide input
// (a text area) instead of beside it. The title and the line Molt says live in the Molt page, not here.
export function Shell({ state, run, label, children, always, input, hint, idle, stack = false, history, summary }) {
  const busy = state.status === "busy";
  return (
    <div>
      <div className={`flex flex-wrap items-end gap-3 ${stack ? "flex-col items-stretch sm:items-start" : ""}`}>
        {input && <div className={`min-w-0 ${stack ? "w-full" : "flex-1 basis-60"}`}>{input}</div>}
        <Button variant="gold" icon={state.status === "done" ? RefreshCw : Sparkles} busy={busy} disabled={busy} onClick={run} className="max-sm:w-full sm:shrink-0">
          {busy ? tr("Se gândește…") : state.status === "done" ? tr("Din nou") : label}
        </Button>
      </div>
      {hint && (
        <p className="mt-2 text-xs font-bold text-rose" role="status">
          {hint}
        </p>
      )}
      <div aria-live="polite">
        {state.status === "idle" && idle && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-edge px-4 py-8 text-center text-sm font-semibold text-faint">
            <Sparkles size={16} className="shrink-0" aria-hidden="true" />
            {idle}
          </div>
        )}
        {busy && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-extrabold text-violet-hi">{tr("Molt se gândește…")}</p>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {state.status === "error" && <p className="mt-4 rounded-xl bg-rose/10 p-3 text-sm font-semibold text-body ring-1 ring-rose/30">{state.error}</p>}
        {state.status === "done" && (
          <div className="anim-slide mt-4 border-t border-edge/60 pt-4">
            {state.at && history && <p className="mb-2 text-[11px] font-bold text-dim">{tr("Răspuns din {when}", { when: stamp(state.at) })}</p>}
            {children}
          </div>
        )}
      </div>
      {always}
      <HistoryList history={history} summary={summary} />
    </div>
  );
}

/** Shown where an analysis needs the player's check-in history and there is not enough of it yet. */
export function NeedHistory({ data, onNotes }) {
  const best = Math.max(0, ...data.habits.map((h) => h.sched));
  return (
    <div className="inset flex items-start gap-3 p-4">
      <Clock size={18} className="mt-0.5 shrink-0 text-violet-hi" aria-hidden="true" />
      <div className="text-sm font-semibold text-body">
        <p>{tr("Mai are nevoie de câteva zile de bifări: caută tipare abia când un obicei are cel puțin 7 zile programate în ultimele 4 săptămâni (acum cel mai lung are {best}).", { best })}</p>
        {onNotes && (
          <button type="button" onClick={onNotes} className="focus-ring mt-1.5 text-violet-hi underline">{tr("Până atunci, spune-i lui Molt ce se întâmplă")}</button>
        )}
      </div>
    </div>
  );
}

/** Patterns in the last 4 weeks of check-ins (Statistici). */
export function InsightsPanel({ state, today, ai, onNotes }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [s, run, history] = useCoach((signal) => habitInsights(data, signal), { kind: "patterns", label: () => tr("ultimele 4 săptămâni") });
  if (!ai?.server) return null;
  if (!hasHistory(data)) return <NeedHistory data={data} onNotes={onNotes} />;
  return (
    <Shell state={s} run={run} label={tr("Ce observi?")} idle={tr("Aici apar 3 tipare găsite în bifările tale.")} history={history} summary={(d) => (Array.isArray(d) ? d.map((i) => i.title).join(" · ") : "")}>
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

export function ReflectionPanel({ state, today, ai, onNotes }) {
  const data = useMemo(() => coachData(state, today), [state, today]);
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState([]);
  const [hint, setHint] = useState("");
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
  if (!ai?.server) return null;
  if (!hasHistory(data)) return <NeedHistory data={data} onNotes={onNotes} />;
  const go = () => {
    if (!answer.trim()) return setHint(tr("Scrie mai întâi câteva cuvinte despre săptămâna ta."));
    setHint("");
    run();
  };
  return (
    <Shell
      state={s}
      run={go}
      label={tr("Reflectează")}
      hint={hint}
      idle={tr("Aici apar observația lui Molt și un singur pas pentru săptămâna viitoare.")}
      stack
      always={history.length > 0 && <ReflectionHistory items={history} />}
      input={<textarea className="field min-h-20 w-full resize-y" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={tr("Ce ți-a făcut săptămâna mai ușoară sau mai grea?")} aria-label={tr("Răspuns pentru reflecție")} />}
    >
      {s.data && (
        <div className="inset p-3 text-sm font-semibold text-body">
          <p><strong className="text-ink">{tr("Observație:")}</strong> {s.data.observation}</p>
          <p className="mt-2"><strong className="text-ink">{tr("Următorul pas:")}</strong> {s.data.nextStep}</p>
          {s.data.dataUsed.length > 0 && <p className="mt-2 text-xs font-bold text-dim">{tr("Date folosite: {join}.", { join: s.data.dataUsed.join(" · ") })}</p>}
        </div>
      )}
    </Shell>
  );
}

function ReflectionHistory({ items }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-extrabold text-dim hover:text-ink">{tr("Reflecții anterioare ({length})", { length: items.length })}</summary>
      <ul className="mt-2 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="inset p-3 text-sm font-semibold text-body">
            <p className="text-xs font-bold text-dim">{r.week}</p>
            <p className="mt-1"><strong className="text-ink">{tr("Observație:")}</strong> {r.observation}</p>
            <p className="mt-1"><strong className="text-ink">{tr("Următorul pas:")}</strong> {r.nextStep}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

const STRENGTH = { strong: tr("dovezi solide"), moderate: tr("dovezi moderate"), theory: tr("model teoretic") };
/** "Sheeran, Listrom & Gollwitzer (2025). Title…" -> "Sheeran, Listrom & Gollwitzer 2025" */
const shortCite = (cite) => {
  const m = /^(.*?)\s*\((\d{4})\)/.exec(cite || "");
  return m ? `${m[1]} ${m[2]}` : cite;
};

export function Sources({ sources }) {
  if (!sources.length) return <p className="mt-1 text-[11px] font-bold text-faint">{tr("Fără sursă din cercetare: propunerea vine doar din datele tale.")}</p>;
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
            <p className="mt-0.5 text-dim">{tr("Limită: {limits}", { limits: s.limits })}</p>
            <a className="text-sky underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
              doi.org/{s.doi}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
