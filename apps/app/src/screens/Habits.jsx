import React, { useMemo, useState } from "react";
import { Archive, ArrowLeft, CalendarDays, Clock, Flame, Pencil, Plus, RotateCcw, ScrollText, Sparkles, Target, Trophy } from "lucide-react";
import { Button, Chip, Empty, DeleteButton, Gems, Panel, SectionTitle, Stat } from "../components/ui.jsx";
import { HabitArea, Heatmap } from "../components/Charts.jsx";
import { iconFor } from "../components/icons.js";
import { scheduleLabel } from "../components/HabitEditor.jsx";
import { MAX_HABITS, PATHS } from "../lib/catalog.js";
import { DIFF, RULES, habitStats, isScheduled } from "../lib/engine.js";
import { fmt12, fmtDay } from "../lib/dates.js";
import { c } from "../lib/themes.js";
import { tr } from "../lib/i18n.js";

function HabitDetail({ h, state, d, today, onBack, onEdit, onArchive }) {
  const Icon = iconFor(h.icon);
  const stats = habitStats(h, state, d.timeline, today);
  const series = d.timeline.habitSeries[h.id] || [];

  const cell = (day) => {
    const code = state.log?.[day]?.[h.id];
    const sched = isScheduled(h, day);
    if (code) return { color: c("gold"), title: tr("{fmtDay}: bifat", { fmtDay: fmtDay(day) }) };
    if (sched && day < today) return { color: c("panel-lo"), ring: c("mark"), title: tr("{fmtDay}: ratat", { fmtDay: fmtDay(day) }) };
    return { color: c("well"), title: `${fmtDay(day)}: ${sched ? tr("programat") : tr("liber")}` };
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-extrabold text-dim hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Toate obiceiurile")}</button>
      <Panel tone="gold" className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 2px ${h.color}88` }}>
            <Icon size={30} aria-hidden="true" />
          </span>
          <div className="min-w-[200px] flex-1">
            <h1 className="font-pixel text-3xl text-ink">{h.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-dim">
              <Chip tone="gold">{PATHS[h.cat]?.label}</Chip>
              <Gems n={h.diff} />
              <span>{tr("{label} · +{xp} momentum", { label: DIFF[h.diff].label, xp: DIFF[h.diff].xp })}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={13} aria-hidden="true" /> {scheduleLabel(h.days)}
              </span>
              {h.time && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} aria-hidden="true" /> {fmt12(h.time)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-body">{tr("Țintă: {target}", { target: h.target })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>{tr("Editează")}</Button>
            {h.archivedAt && (
              <Button variant="mint" size="sm" icon={RotateCcw} onClick={() => onArchive(h.id, false)}>{tr("Reactivează")}</Button>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Flame} tone="ember" label={tr("Momentum")} value={stats.momentum} sub={tr("al acestui obicei")} />
        <Stat icon={Target} tone="mint" label={tr("Ultimele 30 de zile")} value={stats.rate === null ? "–" : `${Math.round(stats.rate * 100)}%`} sub={tr("{done} din {sched} programate", { done: stats.done, sched: stats.sched })} />
        <Stat icon={Trophy} tone="gold" label={tr("La rând")} value={stats.run} sub={`record: ${stats.bestRun}`} />
        <Stat icon={Sparkles} tone="violet" label={tr("Bifări")} value={stats.total} sub={tr("în total")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="min-w-0 p-4 sm:p-5 lg:col-span-3">
          <SectionTitle icon={Flame} sub={tr("Crește la fiecare bifă, scade puțin la o zi programată ratată")}>{tr("Momentum-ul obiceiului")}</SectionTitle>
          <HabitArea points={series.slice(-60)} color={h.color} />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5 lg:col-span-2">
          <SectionTitle icon={CalendarDays} sub={tr("Ultimele 16 săptămâni")}>{tr("Istoric")}</SectionTitle>
          <Heatmap
            today={today}
            weeks={16}
            cell={cell}
            legend={false}
            label={tr("Istoricul obiceiului {name}", { name: h.name })}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-gold" />{" "}{tr("bifat")}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] ring-1 ring-inset ring-mark" />{" "}{tr("ratat")}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// How the habit list is laid out and sorted: the player's choice, kept with the account (see lib/prefs.js).
// one habit as a line
function HabitRow({ h, stats, code, today, onOpen, onEdit, onDelete }) {
  const Icon = iconFor(h.icon);
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-edge bg-panel p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 1px ${h.color}66` }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpen} className="focus-ring truncate text-left font-extrabold text-ink hover:underline">
            {h.name}
          </button>
          {code ? <Chip tone="mint">{tr("azi ✓")}</Chip> : isScheduled(h, today) ? <Chip tone="gold">{tr("azi")}</Chip> : null}
        </div>
        <div className="truncate text-xs font-semibold text-dim">
          {h.target} · {scheduleLabel(h.days)}
          {h.time ? ` · ${fmt12(h.time)}` : ""}
        </div>
      </div>
      <span className="font-pixel tabular text-lg text-ink" title={tr("Momentum")}>
        {stats.momentum}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit} aria-label={tr("Editează: {name}", { name: h.name })} title={tr("Editează")} className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-well hover:text-ink">
          <Pencil size={16} aria-hidden="true" />
        </button>
        <DeleteButton label={tr("Șterge obiceiul {name}", { name: h.name })} onClick={onDelete} />
      </div>
    </li>
  );
}

export default function Habits({ state, d, today, go, ai, focus, setFocus, onAdd, onEdit, onArchive, onDelete }) {
  const [showArchived, setShowArchived] = useState(false);
  const habits = state.habits || [];
  const active = habits.filter((h) => !h.archivedAt);
  const statsById = useMemo(() => Object.fromEntries(active.map((h) => [h.id, habitStats(h, state, d.timeline, today)])), [active, state, d.timeline, today]);
  const archived = habits.filter((h) => h.archivedAt);
  const selected = habits.find((h) => h.id === focus);

  if (selected) {
    return (
      <HabitDetail
        h={selected}
        state={state}
        d={d}
        today={today}
        onBack={() => setFocus(null)}
        onEdit={() => onEdit(selected)}
        onArchive={onArchive}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-dim">{tr("{length} din {MAX_HABITS} active · fiecare obicei are propriul momentum", { length: active.length, MAX_HABITS })}</p>
        <Button icon={Plus} size="sm" onClick={onAdd} disabled={active.length >= MAX_HABITS}>{tr("Adaugă obicei")}</Button>
      </div>
      {active.length > RULES.habitsPerDay && (
        <p role="note" className="text-xs font-semibold text-dim">
          {tr("Într-o zi, doar cele mai valoroase {habitsPerDay} obiceiuri bifate aduc momentum și evoluție. Restul rămân în listă, dar nu mai adaugă puncte.", { habitsPerDay: RULES.habitsPerDay })}
        </p>
      )}
      {active.length === 0 ? (
        <Panel>
          <Empty icon={ScrollText} title={tr("Niciun obicei activ")} action={<Button icon={Plus} onClick={onAdd}>{tr("Adaugă primul obicei")}</Button>}>{tr("Alege din catalog sau creează unul personalizat.")}</Empty>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {active.map((h) => (
            <HabitRow
              key={h.id}
              h={h}
              today={today}
              code={state.log?.[today]?.[h.id] || 0}
              stats={statsById[h.id]}
              onOpen={() => setFocus(h.id)}
              onEdit={() => onEdit(h)}
              onDelete={() => onDelete(h.id)}
            />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div>
          <button type="button" className="focus-ring inline-flex items-center gap-2 text-sm font-extrabold text-dim hover:text-ink" onClick={() => setShowArchived((x) => !x)}>
            <Archive size={15} aria-hidden="true" />{" "}{tr("Arhivate ({length})", { length: archived.length })}</button>
          {showArchived && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {archived.map((h) => {
                const Icon = iconFor(h.icon);
                return (
                  <li key={h.id} className="inset flex items-center gap-3 p-3">
                    <Icon size={18} style={{ color: h.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-body">{h.name}</span>
                    <span className="text-xs text-faint">{tr("din {fmtDay}", { fmtDay: fmtDay(h.archivedAt) })}</span>
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onArchive(h.id, false)}>{tr("Reactivează")}</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
