import React, { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, Camera, CalendarDays, Clock, Flame, Pencil, Plus, RotateCcw, ScrollText, Sparkles, Target, Trophy } from "lucide-react";
import { Button, Chip, Empty, Gems, Panel, SectionTitle, Stat } from "../components/ui.jsx";
import { HabitArea, Heatmap, Sparkline } from "../components/Charts.jsx";
import { ProofBadge } from "../components/ProofModal.jsx";
import { iconFor } from "../components/icons.js";
import { scheduleLabel } from "../components/HabitEditor.jsx";
import { MAX_HABITS, PATHS } from "../lib/catalog.js";
import { CODE, DIFF, habitStats, isScheduled } from "../lib/engine.js";
import { CODE_VERDICT } from "../lib/derive.js";
import { addDays, fmtDay, monthKey, monthsBetween, relDay } from "../lib/dates.js";
import { assetUrl } from "../lib/store.js";

function HabitCard({ h, stats, series, onOpen, onEdit, onProof, code, today }) {
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
          <div className="font-pixel text-lg text-ink">{stats.proofs}</div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">dovezi</div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={ScrollText} onClick={onOpen}>
          Detalii
        </Button>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
          Editează
        </Button>
        {code <= CODE.DONE && (
          <Button size="sm" variant="violet" icon={Camera} onClick={onProof}>
            Dovadă
          </Button>
        )}
      </div>
    </Panel>
  );
}

function HabitDetail({ h, state, d, today, months, loadMonth, onBack, onEdit, onProof, onArchive }) {
  const Icon = iconFor(h.icon);
  const stats = habitStats(h, state, d.timeline, today);
  const series = d.timeline.habitSeries[h.id] || [];
  const code = state.log?.[today]?.[h.id] || 0;

  useEffect(() => {
    for (const ym of monthsBetween(addDays(today, -90), today)) loadMonth(ym);
  }, [h.id, today, loadMonth]);

  const proofs = useMemo(
    () =>
      Object.values(months)
        .filter(Boolean)
        .flatMap((m) => m.proofs || [])
        .filter((p) => p.habitId === h.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [months, h.id]
  );

  const cell = (day) => {
    const c = state.log?.[day]?.[h.id];
    const sched = isScheduled(h, day);
    if (c === CODE.VERIFIED) return { color: "#3fe0a5", title: `${fmtDay(day)}: bifat, dovadă verificată` };
    if (c) return { color: "#ffc542", title: `${fmtDay(day)}: bifat${c > 1 ? ", cu dovadă" : ""}` };
    if (sched && day < today) return { color: "#1c1838", ring: "#5a4fa8", title: `${fmtDay(day)}: ratat` };
    return { color: "#16122f", title: `${fmtDay(day)}: ${sched ? "programat" : "liber"}` };
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
              {h.proofHint ? ` · Dovadă: ${h.proofHint}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {code <= CODE.DONE && !h.archivedAt && (
              <Button variant="violet" size="sm" icon={Camera} onClick={onProof}>
                Trimite dovadă
              </Button>
            )}
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
        <Stat icon={Sparkles} tone="violet" label="Dovezi" value={stats.proofs} sub={`din ${stats.total} bifări`} />
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
              <span className="h-3 w-3 rounded-[3px] bg-mint" /> cu dovadă verificată
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] bg-gold" /> bifat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] ring-1 ring-inset ring-[#5a4fa8]" /> ratat
            </span>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <SectionTitle icon={Camera} tone="violet" sub="Ultimele 90 de zile">
          Dovezi
        </SectionTitle>
        {proofs.length === 0 ? (
          <Empty icon={Camera} title="Nicio dovadă încă">
            O poză, o notă vocală sau câteva rânduri. AI-ul le verifică și scrie povestea personajului tău.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {proofs.map((p) => (
              <li key={p.id} className="inset flex gap-3 p-3">
                {p.assetId || p.thumb ? (
                  <img src={p.assetId ? assetUrl(p.assetId) : p.thumb} alt={`Dovadă din ${fmtDay(p.day)}`} className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-edge" loading="lazy" />
                ) : (
                  <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-panel text-faint ring-1 ring-edge">
                    <ScrollText size={22} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-dim">
                    {relDay(p.day, today)} <ProofBadge verdict={p.verdict} />
                  </div>
                  {p.note && <p className="line-clamp-2 text-sm text-body">„{p.note}”</p>}
                  {p.type === "voice" && p.assetId && <audio controls src={assetUrl(p.assetId)} className="h-8 w-full" />}
                  <p className="line-clamp-2 text-xs italic text-dim">{p.story}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function Habits({ state, d, today, months, focus, setFocus, onCheck, onProof, onAdd, onEdit, onArchive, loadMonth }) {
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
        months={months}
        loadMonth={loadMonth}
        onBack={() => setFocus(null)}
        onEdit={() => onEdit(selected)}
        onProof={() => onProof(selected.id)}
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
              onProof={() => onProof(h.id)}
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
