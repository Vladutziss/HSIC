import React, { useState } from "react";
import { Archive, ArrowLeft, CalendarDays, Clock, Flame, Pencil, Plus, RotateCcw, ScrollText, Sparkles, Target, Trophy } from "lucide-react";
import { Button, Chip, Empty, Gems, Panel, SectionTitle, Stat } from "../components/ui.jsx";
import { HabitArea, Heatmap, Sparkline } from "../components/Charts.jsx";
import { iconFor } from "../components/icons.js";
import { scheduleLabel } from "../components/HabitEditor.jsx";
import { MAX_HABITS, PATHS } from "../lib/catalog.js";
import { DIFF, habitStats, isScheduled } from "../lib/engine.js";
import { fmtDay } from "../lib/dates.js";
import { c } from "../lib/themes.js";

function HabitCard({ h, stats, series, onOpen, onEdit, code, today }) {
  const Icon = iconFor(h.icon);
  const spark = series.slice(-30).map((p) => p.m);
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 1px ${h.color}66` }}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-ink">{h.name}</h3>
            <Gems n={h.diff} size={11} />
          </div>
          <div className="text-xs font-semibold text-dim">
            {h.target} · {scheduleLabel(h.days)}
            {h.time ? ` · ${h.time}` : ""}
          </div>
        </div>
        {code ? <Chip tone="mint">azi ✓</Chip> : isScheduled(h, today) ? <Chip tone="gold">azi</Chip> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-dim">Momentum</div>
          <div className="font-pixel tabular text-3xl leading-none text-ink">{stats.momentum}</div>
        </div>
        <Sparkline points={spark} color={h.color} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="inset px-2 py-1.5">
          <div className="font-pixel text-lg text-ink">{stats.rate === null ? "–" : `${Math.round(stats.rate * 100)}%`}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">30 zile</div>
        </div>
        <div className="inset px-2 py-1.5">
          <div className="font-pixel text-lg text-ink">{stats.run}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">la rând</div>
        </div>
        <div className="inset px-2 py-1.5">
          <div className="font-pixel text-lg text-ink">{stats.total}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">bifări</div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={ScrollText} onClick={onOpen}>
          Detalii
        </Button>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
          Editează
        </Button>
      </div>
    </Panel>
  );
}

function HabitDetail({ h, state, d, today, onBack, onEdit, onArchive }) {
  const Icon = iconFor(h.icon);
  const stats = habitStats(h, state, d.timeline, today);
  const series = d.timeline.habitSeries[h.id] || [];

  const cell = (day) => {
    const code = state.log?.[day]?.[h.id];
    const sched = isScheduled(h, day);
    if (code) return { color: c("gold"), title: `${fmtDay(day)}: bifat` };
    if (sched && day < today) return { color: c("panel-lo"), ring: c("mark"), title: `${fmtDay(day)}: ratat` };
    return { color: c("well"), title: `${fmtDay(day)}: ${sched ? "programat" : "liber"}` };
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-extrabold text-dim hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Toate obiceiurile
      </button>
      <Panel tone="gold" corners className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 2px ${h.color}88` }}>
            <Icon size={30} aria-hidden="true" />
          </span>
          <div className="min-w-[200px] flex-1">
            <h1 className="font-pixel text-3xl text-ink">{h.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-dim">
              <Chip tone="gold">{PATHS[h.cat]?.label}</Chip>
              <Gems n={h.diff} />
              <span>{DIFF[h.diff].label} · +{DIFF[h.diff].xp} momentum</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={13} aria-hidden="true" /> {scheduleLabel(h.days)}
              </span>
              {h.time && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} aria-hidden="true" /> {h.time}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-body">
              Țintă: {h.target}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
              Editează
            </Button>
            {h.archivedAt && (
              <Button variant="mint" size="sm" icon={RotateCcw} onClick={() => onArchive(h.id, false)}>
                Reactivează
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Flame} tone="ember" label="Momentum" value={stats.momentum} sub="al acestui obicei" />
        <Stat icon={Target} tone="mint" label="Ultimele 30 de zile" value={stats.rate === null ? "–" : `${Math.round(stats.rate * 100)}%`} sub={`${stats.done} din ${stats.sched} programate`} />
        <Stat icon={Trophy} tone="gold" label="La rând" value={stats.run} sub={`record: ${stats.bestRun}`} />
        <Stat icon={Sparkles} tone="violet" label="Bifări" value={stats.total} sub="în total" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="min-w-0 p-4 sm:p-5 lg:col-span-3">
          <SectionTitle icon={Flame} tone="ember" sub="Crește la fiecare bifă, scade puțin la o zi programată ratată">
            Momentum-ul obiceiului
          </SectionTitle>
          <HabitArea points={series.slice(-60)} color={h.color} />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5 lg:col-span-2">
          <SectionTitle icon={CalendarDays} tone="gold" sub="Ultimele 16 săptămâni">
            Istoric
          </SectionTitle>
          <Heatmap
            today={today}
            weeks={16}
            cell={cell}
            legend={false}
            label={`Istoricul obiceiului ${h.name}`}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-gold" /> bifat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] ring-1 ring-inset ring-mark" /> ratat
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function Habits({ state, d, today, focus, setFocus, onAdd, onEdit, onArchive }) {
  const [showArchived, setShowArchived] = useState(false);
  const habits = state.habits || [];
  const active = habits.filter((h) => !h.archivedAt);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-ink">Obiceiuri</h1>
          <p className="text-sm font-semibold text-dim">
            {active.length} din {MAX_HABITS} active · fiecare obicei are propriul momentum
          </p>
        </div>
        <Button icon={Plus} onClick={onAdd} disabled={active.length >= MAX_HABITS}>
          Adaugă obicei
        </Button>
      </div>
      {active.length === 0 ? (
        <Panel>
          <Empty icon={ScrollText} title="Niciun obicei activ" action={<Button icon={Plus} onClick={onAdd}>Adaugă primul obicei</Button>}>
            Alege din catalog sau creează unul personalizat.
          </Empty>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((h) => (
            <HabitCard
              key={h.id}
              h={h}
              today={today}
              code={state.log?.[today]?.[h.id] || 0}
              stats={habitStats(h, state, d.timeline, today)}
              series={d.timeline.habitSeries[h.id] || []}
              onOpen={() => setFocus(h.id)}
              onEdit={() => onEdit(h)}
            />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div>
          <button type="button" className="focus-ring inline-flex items-center gap-2 text-sm font-extrabold text-dim hover:text-ink" onClick={() => setShowArchived((x) => !x)}>
            <Archive size={15} aria-hidden="true" /> Arhivate ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {archived.map((h) => {
                const Icon = iconFor(h.icon);
                return (
                  <li key={h.id} className="inset flex items-center gap-3 p-3">
                    <Icon size={18} style={{ color: h.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-body">{h.name}</span>
                    <span className="text-xs text-faint">din {fmtDay(h.archivedAt)}</span>
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onArchive(h.id, false)}>
                      Reactivează
                    </Button>
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
