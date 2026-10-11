// "Scopuri": the week's and the month's goals, written by the player.

import React, { useState } from "react";
import { CopyPlus, Plus, Target, Trash2 } from "lucide-react";
import { Button, CheckButton, Panel, SectionTitle, Tabs } from "./ui.jsx";
import { MAX_PER_PERIOD, MAX_TEXT, carryable, goalsFor, periodKey, periodLabel } from "../lib/goals.js";

export function GoalsCard({ state, today, goals }) {
  const [period, setPeriod] = useState("week");
  const [text, setText] = useState("");
  const key = periodKey(period, today);
  const list = goalsFor(state.goals, period, key);
  const open = list.filter((g) => !g.done);
  const done = list.filter((g) => g.done);
  const carry = carryable(state.goals, period, key);
  const full = list.length >= MAX_PER_PERIOD;
  const noun = period === "week" ? "săptămâna" : "luna";

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || full) return;
    goals.add({ period, key, text: t.slice(0, MAX_TEXT) });
    setText("");
  };

  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={Target} tone="sky" sub={`${periodLabel(period, key)} · ${done.length} din ${list.length} gata`}>
        Scopuri
      </SectionTitle>
      <Tabs
        className="mb-3"
        size="sm"
        value={period}
        onChange={setPeriod}
        items={[
          { value: "week", label: "Săptămâna asta" },
          { value: "month", label: "Luna asta" },
        ]}
      />
      <form className="mb-3 flex gap-2" onSubmit={add}>
        <input
          id="goal-input"
          className="field"
          value={text}
          maxLength={MAX_TEXT}
          disabled={full}
          placeholder={full ? `Maximum ${MAX_PER_PERIOD} scopuri pentru ${noun}` : `Ce vrei să realizezi ${period === "week" ? "săptămâna asta" : "luna asta"}?`}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Scop nou pentru ${noun}`}
        />
        <Button type="submit" variant="mint" icon={Plus} disabled={!text.trim() || full} aria-label="Adaugă scop" />
      </form>
      {list.length === 0 && <p className="py-3 text-center text-sm font-semibold text-dim">Niciun scop scris pentru {noun}. Alege 2–3 lucruri care contează.</p>}
      <ul className="space-y-1.5">
        {[...open, ...done].map((g) => (
          <li key={g.id} className="flex items-center gap-2.5 rounded-xl bg-well px-2.5 py-2 ring-1 ring-edge">
            <CheckButton size="sm" checked={g.done} onClick={() => goals.toggle(g.id)} label={g.done ? `Debifează: ${g.text}` : `Bifează: ${g.text}`} />
            <span className={`min-w-0 flex-1 text-sm font-bold ${g.done ? "text-faint line-through" : "text-ink"}`}>{g.text}</span>
            <button
              type="button"
              onClick={() => goals.remove(g.id)}
              className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-rose"
              aria-label={`Șterge scopul: ${g.text}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {carry.length > 0 && !full && (
        <Button variant="ghost" size="sm" icon={CopyPlus} className="mt-3" onClick={() => goals.carry(period, key, carry.slice(0, MAX_PER_PERIOD - list.length))}>
          Reia {carry.length === 1 ? "scopul nefăcut" : `cele ${carry.length} scopuri nefăcute`} din {period === "week" ? "săptămâna trecută" : "luna trecută"}
        </Button>
      )}
    </Panel>
  );
}
