import React, { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button, Chip, Skeleton } from "./ui.jsx";
import { scheduleLabel } from "./HabitEditor.jsx";
import { SUPPORTED, pendingConfirm, recent, traceLines } from "../lib/agentActions.js";

const REJECT_REASONS = ["Nu am timp", "E prea greu", "Nu mi se potrivește"];
const STATUS = { applied: ["mint", "Aplicat"], rejected: ["dim", "Respins"], undone: ["dim", "Anulat"], failed: ["rose", "Nu s-a putut aplica"], pending: ["gold", "În așteptare"] };

const pct = (x) => (typeof x === "number" ? Math.round(x <= 1 ? x * 100 : x) : null);
const CONFIDENCE = { high: "ridicată", medium: "medie", low: "scăzută", unknown: "necunoscută" };

/** What the agent did, in one line. */
export function describe(a, state) {
  const p = a.payload || {};
  const habit = (state?.habits || []).find((h) => h.id === (a.habitId || p.habitId));
  const name = habit?.name || p.name || "obicei";
  switch (a.kind) {
    case "create_todo":
      return `To-do: „${p.title || p.name || "fără titlu"}”`;
    case "plan_focus":
      return `Focus: „${p.title || p.name || "fără titlu"}”${p.dur ? `, ${p.dur} min` : ""}`;
    case "change_habit":
      return `Schimbă „${name}”${p.diff ? `, dificultate ${p.diff}` : ""}${Array.isArray(p.days) ? `, ${scheduleLabel(p.days).toLowerCase()}` : ""}`;
    case "add_habit":
      return `Obicei nou: „${name}”${Array.isArray(p.days) ? `, ${scheduleLabel(p.days).toLowerCase()}` : ""}`;
    case "set_reminder":
      return `Memento pentru „${name}”`;
    case "add_note":
      return `Să țin minte: „${p.body || ""}”`;
    case "start_experiment":
      return `Experiment la „${name}”`;
    default:
      return "Acțiune a lui Molt";
  }
}

function outcomeText(a) {
  const o = a.outcome;
  if (!o) return a.status === "applied" && a.outcomeDue ? `Efectul se vede după ${a.outcomeDue}.` : null;
  const from = pct(o.before ?? o.rateBefore ?? a.baseline?.rate28);
  const to = pct(o.after ?? o.rateAfter ?? o.rate);
  const range = from != null && to != null ? ` de la ${from}% la ${to}%` : "";
  switch (o.verdict) {
    case "improved":
      return `Rata ta a crescut${range}.`;
    case "worse":
      return `Rata ta a scăzut${range}.`;
    case "no_clear_change":
      return "Nu se vede o diferență clară.";
    case "todo_done":
      return `Ai făcut pasul${o.activity?.rate != null ? ` · ${o.activity.rate} bife pe zi în jurul lui, față de ${o.activity.baseline} înainte` : ""}.`;
    case "todo_open":
      return "Pasul nu a fost bifat.";
    case "insufficient":
      return "Prea puține zile ca să spunem ceva.";
    default:
      return null;
  }
}

function Item({ a, state, children }) {
  const [tone, label] = STATUS[a.status] || STATUS.pending;
  const effect = outcomeText(a);
  return (
    <li className="rounded-xl bg-ink/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">{describe(a, state)}</span>
        <Chip tone={tone}>{label}</Chip>
      </div>
      {a.reason && <p className="mt-1 text-xs font-semibold text-dim">{a.reason}</p>}
      {a.explanation && (
        <details className="mt-2 text-xs font-semibold text-dim">
          <summary className="cursor-pointer font-extrabold text-ink">De ce această recomandare?</summary>
          <div className="mt-1.5 space-y-1">
            <p>Siguranță estimată: {CONFIDENCE[a.explanation.confidence] || CONFIDENCE.unknown}.</p>
            {a.explanation.dataUsed?.length > 0 && <p>Date folosite: {a.explanation.dataUsed.join(" · ")}.</p>}
            {a.explanation.expectedEffect && <p>Efect urmărit: {a.explanation.expectedEffect}</p>}
          </div>
        </details>
      )}
      {effect && (
        <p className="mt-1 text-xs font-bold text-ink">
          {effect}
          <span className="mt-0.5 block font-semibold text-dim">Comparație înainte/după pe tine: nu dovedește că schimbarea a cauzat diferența.</span>
        </p>
      )}
      {children}
    </li>
  );
}

function Group({ title, items, children }) {
  if (!items.length) return null;
  return (
    <section className="mt-4 first:mt-0" aria-label={title}>
      <h3 className="mb-2 text-sm font-extrabold text-ink">{title}</h3>
      <ul className="space-y-2">{items.map(children)}</ul>
    </section>
  );
}

/** actions: null while loading. busy: true or the id of the action being decided. */
export function AgentLog({ actions, state, onConfirm, onReject, onUndo, busy, error }) {
  const [asking, setAsking] = useState(null); // id of the proposal whose reason is being picked
  const off = !!busy;

  let body;
  if (actions == null) body = <Skeleton className="h-20 w-full" />;
  else if (!actions.length) body = <p className="text-sm font-semibold text-dim">Molt n-a făcut încă nimic. Ce face sau propune apare aici, cu opțiunea de a anula.</p>;
  else {
    const waiting = pendingConfirm(actions);
    const done = recent(actions);
    const auto = done.filter((a) => a.autonomy === "auto" && a.status === "applied" && !a.outcome);
    const rest = done.filter((a) => !auto.includes(a));
    const undo = (a) =>
      a.status === "applied" &&
      !a.outcome &&
      SUPPORTED.includes(a.kind) && (
        <Button size="sm" variant="ghost" icon={Undo2} className="mt-2" disabled={off} busy={busy === a.id} onClick={() => onUndo?.(a)} aria-label={`Anulează: ${describe(a, state)}`}>
          Anulează
        </Button>
      );
    body = (
      <>
        <Group title="Așteaptă confirmarea ta" items={waiting}>
          {(a) => (
            <Item key={a.id} a={a} state={state}>
              {SUPPORTED.includes(a.kind) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="gold" disabled={off} busy={busy === a.id} onClick={() => onConfirm?.(a)}>
                    Confirmă
                  </Button>
                  <Button size="sm" variant="ghost" disabled={off} aria-expanded={asking === a.id} onClick={() => setAsking(asking === a.id ? null : a.id)}>
                    Nu
                  </Button>
                  {asking === a.id &&
                    REJECT_REASONS.map((r) => (
                      <Button key={r} size="sm" variant="ghost" disabled={off} onClick={() => (setAsking(null), onReject?.(a, r))}>
                        {r}
                      </Button>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-xs font-semibold text-dim">Se confirmă din ecranul Molt.</p>
              )}
            </Item>
          )}
        </Group>
        <Group title="Aplicate automat" items={auto}>
          {(a) => (
            <Item key={a.id} a={a} state={state}>
              {undo(a)}
            </Item>
          )}
        </Group>
        <Group title="Istoric și efect" items={rest}>
          {(a) => (
            <Item key={a.id} a={a} state={state}>
              {undo(a)}
            </Item>
          )}
        </Group>
      </>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm font-bold text-rose">
          {error}
        </p>
      )}
      <div aria-live="polite">{body}</div>
    </div>
  );
}
