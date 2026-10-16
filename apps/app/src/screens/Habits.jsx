import React, { useMemo, useState } from "react";
import { Archive, ArrowLeft, CalendarDays, Clock, Flame, Info, LayoutGrid, List, Pencil, Plus, Rows3, RotateCcw, ScrollText, Sparkles, Target, Trophy } from "lucide-react";
import { Button, Chip, Empty, DeleteButton, Field, Gems, Panel, SectionTitle, Stat } from "../components/ui.jsx";
import { Select } from "../components/Select.jsx";
import { HabitArea, Heatmap, Sparkline } from "../components/Charts.jsx";
import { iconFor } from "../components/icons.js";
import { scheduleLabel } from "../components/HabitEditor.jsx";
import { MAX_HABITS, PATHS } from "../lib/catalog.js";
import { DIFF, habitStats, isScheduled } from "../lib/engine.js";
import { fmt12, fmtDay } from "../lib/dates.js";
import { c } from "../lib/themes.js";

function HabitCard({ h, stats, series, onOpen, onEdit, onDelete, code, today }) {
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
            {h.time ? ` · ${fmt12(h.time)}` : ""}
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
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={ScrollText} onClick={onOpen}>
            Detalii
          </Button>
          <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
            Editează
          </Button>
        </div>
        <DeleteButton label={`Șterge obiceiul ${h.name}`} onClick={onDelete} />
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
                  <Clock size={13} aria-hidden="true" /> {fmt12(h.time)}
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

// How the habit list is laid out. Chosen on this device only, so it is kept in localStorage.
const LAYOUTS = [
  { id: "compact", label: "Compact", icon: List },
  { id: "details", label: "Detalii", icon: Rows3 },
  { id: "large", label: "Mari", icon: LayoutGrid },
];
const LAYOUT_KEY = "molted.habitsLayout";
const loadLayout = () => {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return LAYOUTS.some((l) => l.id === v) ? v : "large";
  } catch {
    return "large";
  }
};
// Sorting for the habit list. `label` is the first direction, `rev` the opposite one: picking the same
// sort again flips it, and the menu shows the direction that is active.
const SORTS = [
  { value: "added", label: "Ordinea adăugării", rev: "Ordinea adăugării (cele mai noi întâi)" },
  { value: "name", label: "Nume (A–Z)", rev: "Nume (Z–A)" },
  { value: "cat", label: "Tip de obicei", rev: "Tip de obicei (invers)" },
  { value: "diff", label: "Dificultate (ușor → greu)", rev: "Dificultate (greu → ușor)" },
  { value: "momentum", label: "Momentum (mare → mic)", rev: "Momentum (mic → mare)" },
  { value: "time", label: "Ora (devreme → târziu)", rev: "Ora (târziu → devreme)" },
];
const SORT_KEY = "molted.habitsSort";
const loadSort = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
    if (v && SORTS.some((x) => x.value === v.sort)) return { sort: v.sort, desc: !!v.desc };
  } catch {
    // unreadable: use the default
  }
  return { sort: "added", desc: false };
};
const saveSort = (v) => {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(v));
  } catch {
    // nothing to keep
  }
};

// ties always fall back to the name, so the order stays stable
function sortAscending(list, sort, statsById) {
  const byName = (a, b) => a.name.localeCompare(b.name, "ro");
  const copy = [...list];
  switch (sort) {
    case "name":
      return copy.sort(byName);
    case "cat":
      return copy.sort((a, b) => (PATHS[a.cat]?.label || "").localeCompare(PATHS[b.cat]?.label || "", "ro") || byName(a, b));
    case "diff":
      return copy.sort((a, b) => a.diff - b.diff || byName(a, b));
    case "momentum":
      return copy.sort((a, b) => (statsById[b.id]?.momentum || 0) - (statsById[a.id]?.momentum || 0) || byName(a, b));
    case "time":
      // habits without an hour go last
      return copy.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || byName(a, b));
    default:
      return copy;
  }
}

function sortHabits(list, sort, statsById, desc) {
  const sorted = sortAscending(list, sort, statsById);
  return desc ? sorted.reverse() : sorted;
}

const saveLayout = (v) => {
  try {
    localStorage.setItem(LAYOUT_KEY, v);
  } catch {
    // private window: the choice lasts until reload
  }
};

// three buttons stuck together, like the view switch of a file manager
function LayoutSwitch({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Cum vezi obiceiurile" className="inline-flex overflow-hidden rounded-xl bg-well ring-1 ring-edge">
      {LAYOUTS.map((l, i) => {
        const on = l.id === value;
        const Icon = l.icon;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.id)}
            className={`focus-ring flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold transition ${i > 0 ? "border-l border-edge" : ""} ${
              on ? "bg-gold text-on-gold" : "text-dim hover:text-ink"
            }`}
          >
            <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

// one habit as a line; "Detalii" also shows the numbers in a row
function HabitRow({ h, stats, code, today, detailed, onOpen, onEdit, onDelete }) {
  const Icon = iconFor(h.icon);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-panel p-3 sm:flex-nowrap">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 1px ${h.color}66` }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpen} className="focus-ring truncate text-left font-extrabold text-ink hover:underline">
            {h.name}
          </button>
          <Gems n={h.diff} size={11} />
          {code ? <Chip tone="mint">azi ✓</Chip> : isScheduled(h, today) ? <Chip tone="gold">azi</Chip> : null}
        </div>
        <div className="truncate text-xs font-semibold text-dim">
          {h.target} · {scheduleLabel(h.days)}
          {h.time ? ` · ${fmt12(h.time)}` : ""}
        </div>
      </div>
      {detailed && (
        <dl className="grid w-full grid-cols-4 gap-2 text-center sm:w-auto sm:min-w-[17rem]">
          <div className="inset px-2 py-1">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-dim">Momentum</dt>
            <dd className="font-pixel tabular text-base text-ink">{stats.momentum}</dd>
          </div>
          <div className="inset px-2 py-1">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-dim">30 zile</dt>
            <dd className="font-pixel tabular text-base text-ink">{stats.rate === null ? "–" : `${Math.round(stats.rate * 100)}%`}</dd>
          </div>
          <div className="inset px-2 py-1">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-dim">La rând</dt>
            <dd className="font-pixel tabular text-base text-ink">{stats.run}</dd>
          </div>
          <div className="inset px-2 py-1">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-dim">Bifări</dt>
            <dd className="font-pixel tabular text-base text-ink">{stats.total}</dd>
          </div>
        </dl>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {!detailed && (
          <span className="font-pixel tabular mr-2 text-lg text-ink" title="Momentum">
            {stats.momentum}
          </span>
        )}
        <button type="button" onClick={onOpen} aria-label={`Detalii: ${h.name}`} title="Detalii" className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-well hover:text-ink">
          <ScrollText size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onEdit} aria-label={`Editează: ${h.name}`} title="Editează" className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-well hover:text-ink">
          <Pencil size={16} aria-hidden="true" />
        </button>
        <DeleteButton label={`Șterge obiceiul ${h.name}`} onClick={onDelete} />
      </div>
    </li>
  );
}

export default function Habits({ state, d, today, go, ai, focus, setFocus, onAdd, onEdit, onArchive, onDelete }) {
  const [showArchived, setShowArchived] = useState(false);
  const [layout, setLayoutState] = useState(loadLayout);
  const [sortState, setSortState] = useState(loadSort);
  const { sort, desc } = sortState;
  // another sort starts in its first direction; the same one again flips it
  const pickSort = (v) => {
    const next = v === sort ? { sort, desc: !desc } : { sort: v, desc: false };
    setSortState(next);
    saveSort(next);
  };
  const setLayout = (v) => {
    setLayoutState(v);
    saveLayout(v);
  };
  const habits = state.habits || [];
  const active = habits.filter((h) => !h.archivedAt);
  const statsById = useMemo(() => Object.fromEntries(active.map((h) => [h.id, habitStats(h, state, d.timeline, today)])), [active, state, d.timeline, today]);
  const shown = useMemo(() => sortHabits(active, sort, statsById, desc), [active, sort, statsById, desc]);
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
        <LayoutSwitch value={layout} onChange={setLayout} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <Button icon={Plus} onClick={onAdd} disabled={active.length >= MAX_HABITS}>
            Adaugă obicei
          </Button>
          {active.length >= MAX_HABITS && (
            <p role="status" className="inline-flex items-center gap-2 rounded-xl bg-well px-3 py-1.5 text-xs font-semibold text-dim ring-1 ring-edge">
              <Info size={14} className="shrink-0 text-faint" aria-hidden="true" />
              Poți avea maximum {MAX_HABITS} obiceiuri active
            </p>
          )}
        </div>
        {active.length > 1 && (
          <Field label="Sortează după" htmlFor="habits-sort">
            <div className="w-56">
              <Select id="habits-sort" value={sort} onChange={pickSort} options={SORTS.map((x) => ({ value: x.value, label: x.value === sort && desc ? x.rev : x.label }))} />
            </div>
          </Field>
        )}
      </div>
      {active.length === 0 ? (
        <Panel>
          <Empty icon={ScrollText} title="Niciun obicei activ" action={<Button icon={Plus} onClick={onAdd}>Adaugă primul obicei</Button>}>
            Alege din catalog sau creează unul personalizat.
          </Empty>
        </Panel>
      ) : (
        layout === "large" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((h) => (
              <HabitCard
                key={h.id}
                h={h}
                today={today}
                code={state.log?.[today]?.[h.id] || 0}
                stats={habitStats(h, state, d.timeline, today)}
                series={d.timeline.habitSeries[h.id] || []}
                onOpen={() => setFocus(h.id)}
                onEdit={() => onEdit(h)}
                onDelete={() => onDelete(h.id)}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((h) => (
              <HabitRow
                key={h.id}
                h={h}
                today={today}
                detailed={layout === "details"}
                code={state.log?.[today]?.[h.id] || 0}
                stats={habitStats(h, state, d.timeline, today)}
                onOpen={() => setFocus(h.id)}
                onEdit={() => onEdit(h)}
                onDelete={() => onDelete(h.id)}
              />
            ))}
          </ul>
        )
      )}
      {ai?.server && (
        <button
          type="button"
          onClick={() => go?.("molt", "ai")}
          className="focus-ring flex w-full items-center gap-3 rounded-2xl bg-violet/10 p-3 text-left ring-1 ring-violet/30 transition hover:bg-violet/15"
        >
          <Sparkles size={18} className="shrink-0 text-violet-hi" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">Cere-i lui Molt un plan pentru obiceiurile tale</span>
            <span className="block text-xs font-semibold text-dim">Analizează bifările, propune schimbări și experimente. Notele și propunerile lui sunt în pagina Molt.</span>
          </span>
          <span className="shrink-0 text-xs font-extrabold text-violet-hi">Deschide →</span>
        </button>
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
