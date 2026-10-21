// "Scopuri": the week's and the month's goals, written by the player.

import React, { useState } from "react";
import { Ban, CalendarClock, CopyPlus, Link2, Plus, RotateCcw, Target, Trash2, X } from "lucide-react";
import { Button, CheckButton, Panel, SectionTitle, Tabs } from "./ui.jsx";
import { MAX_LINKS, childrenOf, liveLinks, normalizeGoal, progressOf, suggestDone, topLevel } from "../lib/milestones.js";
import { MAX_PER_PERIOD, MAX_TEXT, carryable, goalsFor, periodKey, periodLabel } from "../lib/goals.js";
import { tr } from "../lib/i18n.js";

const chip = "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ring-1";

/** One goal or milestone: check, linked todos/habits as chips, a small picker and done/dropped/reopen. */
function GoalRow({ g, state, goals, child = false }) {
  const [pick, setPick] = useState(false);
  const status = normalizeGoal(g).status;
  const dropped = status === "dropped";
  const kids = (state.goals || []).filter((x) => x.parentId === g.id);
  const p = progressOf(state.goals, g.id);
  const linked = liveLinks(g, state.todos, state.habits);
  const suggest = suggestDone(g, state.todos);
  const full = linked.todos.length + linked.habits.length >= MAX_LINKS;
  const openTodos = (state.todos || []).filter((t) => !t.done && !t.repeat).slice(0, 12);
  const habits = (state.habits || []).filter((h) => !h.archivedAt).slice(0, 12);
  const meta = [g.due && tr("până la {due}", { due: g.due }), child && g.criteria, dropped && tr("renunțat")].filter(Boolean).join(" · ");
  const chipBtn = ({ field, id, label, on }) => (
    <button
      key={id}
      type="button"
      disabled={!on && full}
      onClick={() => goals.link(g.id, field, id)}
      aria-pressed={on}
      className={`${chip} focus-ring ${on ? "bg-panel-hi text-ink ring-edge" : "text-dim ring-edge disabled:opacity-40"}`}
    >
      <span className="truncate">{label}</span>
      {on && <X size={12} aria-hidden="true" />}
    </button>
  );
  return (
    <div className={`rounded-xl bg-well px-2.5 ${child ? "py-1.5" : "py-2"} ring-1 ring-edge`}>
      <div className="flex items-center gap-2.5">
        <CheckButton size="sm" checked={g.done} onClick={() => goals.toggle(g.id)} label={g.done ? tr("Debifează: {text}", { text: g.text }) : tr("Bifează: {text}", { text: g.text })} />
        <span className={`min-w-0 flex-1 text-sm font-bold ${g.done || dropped ? "text-faint line-through" : "text-ink"}`}>
          {g.text}
          {meta && <span className="block text-xs font-semibold text-dim">{meta}</span>}
        </span>
        {kids.length > 0 && p.total > 0 && <span className="shrink-0 text-xs font-extrabold text-dim">{p.done}/{p.total}</span>}
        {!g.done && !dropped && goals.toTomorrow && (
          <button
            type="button"
            onClick={() => goals.toTomorrow(g.id)}
            className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-gold"
            aria-label={tr("Pune pe mâine ca to-do: {text}", { text: g.text })}
            title={tr("Pune pe mâine ca to-do")}
          >
            <CalendarClock size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setPick((v) => !v)}
          aria-expanded={pick}
          className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-ink"
          aria-label={tr("Leagă sarcini sau obiceiuri de: {text}", { text: g.text })}
        >
          <Link2 size={14} aria-hidden="true" />
        </button>
        {dropped ? (
          <button type="button" onClick={() => goals.status(g.id, "open")} className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-ink" aria-label={tr("Redeschide: {text}", { text: g.text })}>
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        ) : (
          !g.done && (
            <button type="button" onClick={() => goals.status(g.id, "dropped")} className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-ink" aria-label={tr("Renunță la: {text}", { text: g.text })}>
              <Ban size={14} aria-hidden="true" />
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => goals.remove(g.id)}
          className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-rose"
          aria-label={tr("Șterge scopul: {text}", { text: g.text })}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      {(linked.todos.length > 0 || linked.habits.length > 0 || suggest) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8">
          {linked.todos.map((t) => chipBtn({ field: "todoIds", id: t.id, label: t.title, on: true }))}
          {linked.habits.map((h) => chipBtn({ field: "habitIds", id: h.id, label: h.name, on: true }))}
          {suggest && (
            <button type="button" onClick={() => goals.status(g.id, "done")} className={`${chip} focus-ring text-mint ring-edge`}>{tr("Toate sarcinile sunt gata — marchează scopul ca făcut")}</button>
          )}
        </div>
      )}
      {pick && (
        <div className="mt-1.5 space-y-1.5 pl-8">
          {openTodos.length + habits.length === 0 && <p className="text-xs font-semibold text-dim">{tr("Nu ai sarcini deschise sau obiceiuri de legat.")}</p>}
          {openTodos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {openTodos.map((t) => chipBtn({ field: "todoIds", id: t.id, label: t.title, on: linked.todos.includes(t) }))}
            </div>
          )}
          {habits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {habits.map((h) => chipBtn({ field: "habitIds", id: h.id, label: h.name, on: linked.habits.includes(h) }))}
            </div>
          )}
          <p className="text-xs font-semibold text-dim">{tr("Cel mult {MAX_LINKS} legături.", { MAX_LINKS })}</p>
        </div>
      )}
    </div>
  );
}

export function GoalsCard({ state, today, goals }) {
  const [period, setPeriod] = useState("week");
  const [text, setText] = useState("");
  const key = periodKey(period, today);
  const list = goalsFor(state.goals, period, key);
  const open = list.filter((g) => !g.done);
  const done = list.filter((g) => g.done);
  const carry = carryable(state.goals, period, key);
  const full = list.length >= MAX_PER_PERIOD;
  const noun = period === "week" ? tr("săptămâna") : tr("luna");

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || full) return;
    goals.add({ period, key, text: t.slice(0, MAX_TEXT) });
    setText("");
  };

  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={Target} tone="sky" sub={tr("{periodLabel} · {length} din {length2} gata", { periodLabel: periodLabel(period, key), length: done.length, length2: list.length })}>{tr("Scopuri")}</SectionTitle>
      <Tabs
        className="mb-3"
        size="sm"
        value={period}
        onChange={setPeriod}
        items={[
          { value: "week", label: tr("Săptămâna asta") },
          { value: "month", label: tr("Luna asta") },
        ]}
      />
      <form className="mb-3 flex gap-2" onSubmit={add}>
        <input
          id="goal-input"
          className="field"
          value={text}
          maxLength={MAX_TEXT}
          disabled={full}
          placeholder={full ? tr("Maximum {MAX_PER_PERIOD} scopuri pentru {noun}", { MAX_PER_PERIOD, noun }) : tr("Ce vrei să realizezi {v}?", { v: period === "week" ? tr("săptămâna asta") : tr("luna asta") })}
          onChange={(e) => setText(e.target.value)}
          aria-label={tr("Scop nou pentru {noun}", { noun })}
        />
        <Button type="submit" variant="mint" icon={Plus} disabled={!text.trim() || full} aria-label={tr("Adaugă scop")} />
      </form>
      {list.length === 0 && <p className="py-3 text-center text-sm font-semibold text-dim">{tr("Niciun scop scris pentru {noun}. Alege 2–3 lucruri care contează.", { noun })}</p>}
      <ul className="space-y-1.5">
        {topLevel([...open, ...done], list).map((g) => {
          const kids = childrenOf(list, g.id);
          return (
          <li key={g.id}>
          <GoalRow g={g} state={state} goals={goals} />
          {kids.length > 0 && (
            <ul className="ml-6 mt-1 space-y-1">
              {kids.map((c) => (
                <li key={c.id}>
                  <GoalRow g={c} state={state} goals={goals} child />
                </li>
              ))}
            </ul>
          )}
          </li>
          );
        })}
      </ul>
      {carry.length > 0 && !full && (
        <Button variant="ghost" size="sm" icon={CopyPlus} className="mt-3" onClick={() => goals.carry(period, key, carry.slice(0, MAX_PER_PERIOD - list.length))}>{tr("Reia")}{" "}{carry.length === 1 ? tr("scopul nefăcut") : tr("cele {length} scopuri nefăcute", { length: carry.length })}{" "}{tr("din {v}", { v: period === "week" ? tr("săptămâna trecută") : tr("luna trecută") })}</Button>
      )}
    </Panel>
  );
}
