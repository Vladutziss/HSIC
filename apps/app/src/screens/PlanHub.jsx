// Plan: one place for what to do and where to go. The two parts are big tab cards, each saying what is inside and how
// it stands right now ("3 to-do-uri azi", "2 obiective · 40% progres"), so the goals are seen from the first glance
// and not hidden behind a small label.

import React from "react";
import { CalendarDays, Target } from "lucide-react";
import { pct } from "../lib/objectives.js";
import { todosForToday } from "../lib/todos.js";
import { tr } from "../lib/i18n.js";

function TabCard({ id, on, icon: Icon, title, short, sub, badge, onClick }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`focus-ring relative flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 text-left ring-1 transition sm:gap-3 sm:p-3.5 ${
        on ? "bg-gold/15 ring-2 ring-gold shadow-[0_10px_28px_-18px_rgb(var(--c-gold)/0.9)]" : "bg-well ring-edge hover:bg-panel-hi hover:ring-gold/50"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 sm:h-11 sm:w-11 ${on ? "bg-gold text-on-gold ring-gold" : "bg-panel text-dim ring-edge"}`}>
        <Icon size={22} strokeWidth={2.25} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-extrabold sm:text-base ${on ? "text-ink" : "text-body"}`}>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{title}</span>
        </span>
        <span className="block text-xs font-semibold text-dim">{sub}</span>
      </span>
      {badge > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1 text-[11px] font-black text-night">{badge}</span>}
    </button>
  );
}

export default function PlanHub({ view, go, state, today, goalsDue = 0, children }) {
  const here = view === "goals" ? "goals" : "plan";
  const todosLeft = todosForToday(state?.todos, today).filter((t) => !t.done).length;
  const goals = (state?.objectives || []).filter((o) => !o.archived && !o.doneOn);
  const avg = goals.length ? Math.round(goals.reduce((a, o) => a + pct(o), 0) / goals.length) : 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-3xl text-ink">{tr("Plan")}</h1>
        <p className="text-sm font-semibold text-dim">{tr("Ce ai de făcut azi și unde vrei să ajungi, într-un singur loc.")}</p>
      </div>
      <div role="tablist" aria-label={tr("Părțile din Plan")} className="grid grid-cols-2 gap-3">
        <TabCard
          id="plan-tab-calendar"
          on={here === "plan"}
          icon={CalendarDays}
          title={tr("Calendar și to-do")}
          short={tr("Calendar")}
          sub={todosLeft ? tr("{todosLeft} {v} de făcut azi", { todosLeft, v: todosLeft === 1 ? tr("to-do") : tr("to-do-uri") }) : tr("Nimic de făcut azi")}
          onClick={() => go("plan")}
        />
        <TabCard
          id="plan-tab-goals"
          on={here === "goals"}
          icon={Target}
          title={tr("Obiective și scopuri")}
          short={tr("Obiective")}
          sub={goals.length ? tr("{length} {v} · {avg}% progres", { length: goals.length, v: goals.length === 1 ? tr("obiectiv") : tr("obiective"), avg }) : tr("Pune-ți primul obiectiv")}
          badge={goalsDue}
          onClick={() => go("goals")}
        />
      </div>
      {children}
    </div>
  );
}
