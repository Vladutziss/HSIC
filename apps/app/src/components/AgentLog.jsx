import React, { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button, Chip, Skeleton } from "./ui.jsx";
import { scheduleLabel } from "./HabitEditor.jsx";
import { SUPPORTED, pendingConfirm, recent, traceLines } from "../lib/agentActions.js";
import { tr } from "../lib/i18n.js";

const REJECT_REASONS = [tr("Nu am timp"), tr("E prea greu"), tr("Nu mi se potrivește")];
const STATUS = { applied: ["mint", tr("Aplicat")], rejected: ["dim", tr("Respins")], undone: ["dim", tr("Anulat")], failed: ["rose", tr("Nu s-a putut aplica")], pending: ["gold", tr("În așteptare")] };

const pct = (x) => (typeof x === "number" ? Math.round(x <= 1 ? x * 100 : x) : null);
const CONFIDENCE = { high: tr("ridicată"), medium: tr("medie"), low: tr("scăzută"), unknown: tr("necunoscută") };

/** What the agent did, in one line. */
export function describe(a, state) {
  const p = a.payload || {};
  const habit = (state?.habits || []).find((h) => h.id === (a.habitId || p.habitId));
  const name = habit?.name || p.name || tr("obicei");
  switch (a.kind) {
    case "create_todo":
      return tr("To-do: „{v}”", { v: p.title || p.name || tr("fără titlu") });
    case "plan_focus":
      return tr("Focus: „{v}”{v2}", { v: p.title || p.name || tr("fără titlu"), v2: p.dur ? tr(", {dur} min", { dur: p.dur }) : "" });
    case "change_habit":
      return tr("Schimbă „{name}”{v}{v2}", { name, v: p.diff ? tr(", dificultate {diff}", { diff: p.diff }) : "", v2: Array.isArray(p.days) ? `, ${scheduleLabel(p.days).toLowerCase()}` : "" });
    case "add_habit":
      return tr("Obicei nou: „{name}”{v}", { name, v: Array.isArray(p.days) ? `, ${scheduleLabel(p.days).toLowerCase()}` : "" });
    case "set_reminder":
      return tr("Memento pentru „{name}”", { name });
    case "add_note":
      return tr("Să țin minte: „{v}”", { v: p.body || "" });
    case "start_experiment":
      return tr("Experiment la „{name}”", { name });
    default:
      return tr("Acțiune a lui Molt");
  }
}

function outcomeText(a) {
  const o = a.outcome;
  if (!o) return a.status === "applied" && a.outcomeDue ? tr("Efectul se vede după {outcomeDue}.", { outcomeDue: a.outcomeDue }) : null;
  const from = pct(o.before ?? o.rateBefore ?? a.baseline?.rate28);
  const to = pct(o.after ?? o.rateAfter ?? o.rate);
  const range = from != null && to != null ? tr(" de la {from}% la {to}%", { from, to }) : "";
  switch (o.verdict) {
    case "improved":
      return tr("Rata ta a crescut{range}.", { range });
    case "worse":
      return tr("Rata ta a scăzut{range}.", { range });
    case "no_clear_change":
      return tr("Nu se vede o diferență clară.");
    case "todo_done":
      return tr("Ai făcut pasul{v}.", { v: o.activity?.rate != null ? tr(" · {rate} bife pe zi în jurul lui, față de {baseline} înainte", { rate: o.activity.rate, baseline: o.activity.baseline }) : "" });
    case "todo_open":
      return tr("Pasul nu a fost bifat.");
    case "insufficient":
      return tr("Prea puține zile ca să spunem ceva.");
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
          <summary className="cursor-pointer font-extrabold text-ink">{tr("De ce această recomandare?")}</summary>
          <div className="mt-1.5 space-y-1">
            <p>{tr("Siguranță estimată: {v}.", { v: CONFIDENCE[a.explanation.confidence] || CONFIDENCE.unknown })}</p>
            {a.explanation.dataUsed?.length > 0 && <p>{tr("Date folosite: {join}.", { join: a.explanation.dataUsed.join(" · ") })}</p>}
            {a.explanation.expectedEffect && <p>{tr("Efect urmărit: {expectedEffect}", { expectedEffect: a.explanation.expectedEffect })}</p>}
          </div>
        </details>
      )}
      {effect && (
        <p className="mt-1 text-xs font-bold text-ink">
          {effect}
          <span className="mt-0.5 block font-semibold text-dim">{tr("Comparație înainte/după pe tine: nu dovedește că schimbarea a cauzat diferența.")}</span>
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
  else if (!actions.length) body = <p className="text-sm font-semibold text-dim">{tr("Molt n-a făcut încă nimic. Ce face sau propune apare aici, cu opțiunea de a anula.")}</p>;
  else {
    const waiting = pendingConfirm(actions);
    const done = recent(actions);
    const auto = done.filter((a) => a.autonomy === "auto" && a.status === "applied" && !a.outcome);
    const rest = done.filter((a) => !auto.includes(a));
    const undo = (a) =>
      a.status === "applied" &&
      !a.outcome &&
      SUPPORTED.includes(a.kind) && (
        <Button size="sm" variant="ghost" icon={Undo2} className="mt-2" disabled={off} busy={busy === a.id} onClick={() => onUndo?.(a)} aria-label={tr("Anulează: {describe}", { describe: describe(a, state) })}>{tr("Anulează")}</Button>
      );
    body = (
      <>
        <Group title={tr("Așteaptă confirmarea ta")} items={waiting}>
          {(a) => (
            <Item key={a.id} a={a} state={state}>
              {SUPPORTED.includes(a.kind) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="gold" disabled={off} busy={busy === a.id} onClick={() => onConfirm?.(a)}>{tr("Confirmă")}</Button>
                  <Button size="sm" variant="ghost" disabled={off} aria-expanded={asking === a.id} onClick={() => setAsking(asking === a.id ? null : a.id)}>{tr("Nu")}</Button>
                  {asking === a.id &&
                    REJECT_REASONS.map((r) => (
                      <Button key={r} size="sm" variant="ghost" disabled={off} onClick={() => (setAsking(null), onReject?.(a, r))}>
                        {r}
                      </Button>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-xs font-semibold text-dim">{tr("Se confirmă din ecranul Molt.")}</p>
              )}
            </Item>
          )}
        </Group>
        <Group title={tr("Aplicate automat")} items={auto}>
          {(a) => (
            <Item key={a.id} a={a} state={state}>
              {undo(a)}
            </Item>
          )}
        </Group>
        <Group title={tr("Istoric și efect")} items={rest}>
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
