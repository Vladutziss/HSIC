import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock, GripVertical, ListTodo, Plus } from "lucide-react";
import { Button, CheckButton, Chip, Panel, SectionTitle, Tabs } from "../components/ui.jsx";
import { iconFor } from "../components/icons.js";
import { isScheduled } from "../lib/engine.js";
import {
  RO_DAYS_SHORT,
  RO_MONTHS,
  addDays,
  dayRange,
  fmtDay,
  fmtHM,
  mondayOf,
  nowMinutes,
  parseDay,
  parseHM,
  relDay,
} from "../lib/dates.js";

const START = 6 * 60;
const END = 24 * 60;
const ROW = 48; // pixels per hour
const HABIT_MIN = { 1: 20, 2: 30, 3: 60 };
const yOf = (min) => ((min - START) / 60) * ROW;

// Places overlapping blocks side by side.
function layout(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(it.end);
      } else lanes[lane] = it.end;
      it.lane = lane;
    }
    for (const it of cluster) out.push({ ...it, lanes: lanes.length });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

function TodoRow({ t, today, habits, todo }) {
  const h = habits.find((x) => x.id === t.habitId);
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2.5 rounded-xl bg-[#120f29] px-2.5 py-2 ring-1 ring-edge"
    >
      <GripVertical size={14} className="hidden shrink-0 cursor-grab text-faint sm:block" aria-hidden="true" />
      <CheckButton size="sm" checked={t.done} onClick={() => todo.toggle(t.id)} label={t.done ? `Debifează ${t.title}` : `Bifează ${t.title}`} />
      <button type="button" onClick={() => todo.edit(t)} className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm font-bold ${t.done ? "text-faint line-through" : "text-ink"}`}>{t.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-dim">
          {t.date ? relDay(t.date, today) : "fără dată"}
          {t.time && (
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} aria-hidden="true" />
              {t.time}
            </span>
          )}
          {h && <span style={{ color: h.color }}>· {h.name}</span>}
        </span>
      </button>
    </li>
  );
}

function TodoList({ state, today, todo }) {
  const [filter, setFilter] = useState("today");
  const [text, setText] = useState("");
  const all = state.todos || [];
  const habits = state.habits || [];
  const weekEnd = addDays(mondayOf(today), 6);
  const inFilter = (t) => {
    if (filter === "today") return t.date === today || (!t.done && t.date && t.date < today);
    if (filter === "week") return t.date && t.date >= mondayOf(today) && t.date <= weekEnd;
    if (filter === "nodate") return !t.date;
    return true;
  };
  const list = all.filter(inFilter);
  const overdue = list.filter((t) => !t.done && t.date && t.date < today);
  const open = list.filter((t) => !t.done && !(t.date && t.date < today)).sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || (a.time || "99").localeCompare(b.time || "99"));
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || ""));
  const counts = {
    today: all.filter((t) => !t.done && (t.date === today || (t.date && t.date < today))).length,
    nodate: all.filter((t) => !t.done && !t.date).length,
  };

  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={ListTodo} tone="mint" sub="+5 momentum pentru fiecare to-do terminat">
        To-do
      </SectionTitle>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          todo.add({ title: text.trim().slice(0, 80), date: filter === "nodate" ? null : today });
          setText("");
        }}
      >
        <input id="planner-todo" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={filter === "nodate" ? "Idee fără dată…" : "To-do pentru azi…"} aria-label="To-do nou" />
        <Button type="submit" variant="mint" icon={Plus} aria-label="Adaugă" />
      </form>
      <button type="button" className="mb-3 text-xs font-bold text-dim underline hover:text-ink" onClick={() => todo.create({ date: today })}>
        Cu dată, oră și durată…
      </button>
      <Tabs
        className="mb-3"
        size="sm"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "today", label: "Azi", count: counts.today },
          { value: "week", label: "Săpt." },
          { value: "nodate", label: "Fără dată", count: counts.nodate },
          { value: "all", label: "Toate" },
        ]}
      />
      {overdue.length > 0 && (
        <>
          <div className="mb-1.5 mt-2 text-[11px] font-extrabold uppercase tracking-wider text-ember">Rămase din zilele trecute</div>
          <ul className="space-y-1.5">
            {overdue.map((t) => (
              <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} />
            ))}
          </ul>
        </>
      )}
      {open.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {open.map((t) => (
            <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} />
          ))}
        </ul>
      )}
      {!overdue.length && !open.length && <p className="py-4 text-center text-sm font-semibold text-dim">Nimic aici.</p>}
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-extrabold uppercase tracking-wider text-dim hover:text-ink">Gata ({done.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {done.slice(0, 30).map((t) => (
              <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 hidden text-[11px] font-semibold text-faint sm:block">Trage un to-do în calendar ca să-i dai o zi și o oră.</p>
    </Panel>
  );
}

function WeekView({ state, today, anchor, todo }) {
  const days = dayRange(mondayOf(anchor), addDays(mondayOf(anchor), 6));
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const scroller = useRef(null);
  const [over, setOver] = useState(null);
  const now = nowMinutes();

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, yOf(Math.max(START, Math.min(now - 60, 17 * 60))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const minuteAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(START, Math.min(END - 30, START + Math.floor(y / (ROW / 2)) * 30));
  };

  const todosByDay = useMemo(() => {
    const m = {};
    for (const t of state.todos || []) if (t.date) (m[t.date] ||= []).push(t);
    return m;
  }, [state.todos]);

  return (
    <div ref={scroller} className="max-h-[620px] overflow-auto rounded-xl ring-1 ring-edge">
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-20 bg-panel">
        <div className="grid pt-2" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <span />
          {days.map((day) => {
            const d = parseDay(day);
            const isToday = day === today;
            const done = Object.keys(state.log?.[day] || {}).length;
            const sched = habits.filter((h) => isScheduled(h, day)).length;
            return (
              <div key={day} className="px-1 pb-2 text-center">
                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${isToday ? "text-gold" : "text-dim"}`}>{RO_DAYS_SHORT[d.getDay()]}</div>
                <div className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-lg font-pixel text-lg ${isToday ? "bg-gold text-[#2a1b00]" : "text-ink"}`}>{d.getDate()}</div>
                {sched > 0 && day <= today && (
                  <div className="mx-auto mt-1 h-1 w-10 overflow-hidden rounded-full bg-edge" title={`${done}/${sched} obiceiuri bifate`}>
                    <div className="h-full bg-mint" style={{ width: `${Math.min(100, (done / sched) * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* untimed to-dos */}
        <div className="grid border-y border-edge" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <span className="py-2 pr-2 text-right text-[10px] font-extrabold uppercase leading-tight text-faint">fără oră</span>
          {days.map((day) => (
            <div
              key={day}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(`${day}-allday`);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) todo.move(id, day, null);
              }}
              className={`min-h-[42px] min-w-0 space-y-1 border-l border-edge p-1 ${over === `${day}-allday` ? "bg-gold/10" : ""}`}
            >
              {(todosByDay[day] || [])
                .filter((t) => !t.time)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={() => todo.edit(t)}
                    className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-bold ${t.done ? "bg-white/5 text-faint line-through" : "bg-violet/20 text-ink ring-1 ring-violet/40"}`}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
        </div>
        <div>
          <div className="relative grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", height: ((END - START) / 60) * ROW }}>
            <div className="relative">
              {Array.from({ length: (END - START) / 60 }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] font-extrabold text-faint" style={{ top: i * ROW }}>
                  {i === 0 ? "" : fmtHM(START + i * 60)}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const items = [];
              for (const h of habits) {
                if (!h.time || !isScheduled(h, day)) continue;
                const s = parseHM(h.time);
                items.push({ kind: "habit", id: `h-${h.id}`, h, start: s, end: Math.min(END, s + (HABIT_MIN[h.diff] || 30)) });
              }
              for (const t of todosByDay[day] || []) {
                if (!t.time) continue;
                const s = parseHM(t.time);
                items.push({ kind: "todo", id: t.id, t, start: s, end: Math.min(END, s + (t.dur || 30)) });
              }
              const placed = layout(items.filter((i) => i.end > START));
              return (
                <div
                  key={day}
                  role="presentation"
                  className={`relative min-w-0 border-l border-edge ${day === today ? "bg-gold/[0.04]" : ""} ${over === day ? "bg-gold/10" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(day);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) todo.move(id, day, fmtHM(minuteAt(e)));
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) todo.create({ date: day, time: fmtHM(minuteAt(e)) });
                  }}
                >
                  {Array.from({ length: (END - START) / 60 }, (_, i) => (
                    <span key={i} className="pointer-events-none absolute inset-x-0 border-t border-edge/60" style={{ top: i * ROW }} />
                  ))}
                  {placed.map((it) => {
                    const top = yOf(Math.max(START, it.start));
                    const height = Math.max(22, yOf(it.end) - top - 2);
                    const width = `calc(${100 / it.lanes}% - 4px)`;
                    const left = `calc(${(100 / it.lanes) * it.lane}% + 2px)`;
                    if (it.kind === "habit") {
                      const Icon = iconFor(it.h.icon);
                      const done = !!state.log?.[day]?.[it.h.id];
                      return (
                        <div
                          key={it.id}
                          title={`${it.h.name} · ${it.h.time}`}
                          className="pointer-events-none absolute overflow-hidden rounded-lg px-1.5 py-1 text-[11px] font-extrabold"
                          style={{
                            top,
                            height,
                            width,
                            left,
                            color: "#f3efff",
                            background: `repeating-linear-gradient(135deg, ${it.h.color}40 0 6px, ${it.h.color}26 6px 12px)`,
                            boxShadow: `inset 3px 0 0 ${it.h.color}`,
                          }}
                        >
                          <span className="flex items-center gap-1 truncate">
                            {done ? <Check size={11} aria-hidden="true" /> : <Icon size={11} aria-hidden="true" />}
                            {it.h.name}
                          </span>
                        </div>
                      );
                    }
                    const t = it.t;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        onClick={() => todo.edit(t)}
                        className={`absolute overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] font-extrabold ring-1 ${
                          t.done ? "bg-[#1d1840] text-faint line-through ring-edge" : "bg-violet/30 text-ink ring-violet/60 hover:bg-violet/40"
                        }`}
                        style={{ top, height, width, left }}
                      >
                        <span className="block truncate">{t.title}</span>
                        {height > 34 && <span className="block text-[10px] font-bold text-dim">{t.time}</span>}
                      </button>
                    );
                  })}
                  {day === today && now >= START && now < END && (
                    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: yOf(now) }}>
                      <div className="relative h-0.5 bg-rose">
                        <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthView({ state, today, anchor, onPick }) {
  const first = anchor.slice(0, 8) + "01";
  const start = mondayOf(first);
  const month = parseDay(first).getMonth();
  const days = dayRange(start, addDays(start, 41));
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const byDay = {};
  for (const t of state.todos || []) if (t.date) (byDay[t.date] ||= []).push(t);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-dim">
            {RO_DAYS_SHORT[w]}
          </div>
        ))}
        {days.map((day) => {
          const d = parseDay(day);
          const inMonth = d.getMonth() === month;
          const todos = (byDay[day] || []).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
          const done = Object.keys(state.log?.[day] || {}).length;
          const sched = habits.filter((h) => isScheduled(h, day)).length;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              className={`focus-ring flex min-h-[92px] flex-col gap-1 rounded-xl p-1.5 text-left ring-1 transition hover:ring-gold/60 ${
                day === today ? "bg-gold/10 ring-gold" : inMonth ? "bg-[#120f29] ring-edge" : "bg-transparent ring-edge/40"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`font-pixel text-base ${inMonth ? "text-ink" : "text-faint"}`}>{d.getDate()}</span>
                {sched > 0 && day <= today && (
                  <span className={`text-[10px] font-black ${done >= sched ? "text-mint" : done ? "text-gold" : "text-faint"}`}>
                    {done}/{sched}
                  </span>
                )}
              </span>
              {todos.slice(0, 3).map((t) => (
                <span key={t.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-bold ${t.done ? "text-faint line-through" : "bg-violet/20 text-ink"}`}>
                  {t.time ? `${t.time} ` : ""}
                  {t.title}
                </span>
              ))}
              {todos.length > 3 && <span className="text-[10px] font-bold text-dim">+{todos.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Planner({ state, today, todo }) {
  const [anchor, setAnchor] = useState(today);
  const [mode, setMode] = useState("week");
  const [tab, setTab] = useState("calendar");
  const monday = mondayOf(anchor);
  const sunday = addDays(monday, 6);
  const m = parseDay(anchor);
  const label =
    mode === "week"
      ? `${fmtDay(monday)} – ${fmtDay(sunday)} ${parseDay(sunday).getFullYear()}`
      : `${RO_MONTHS[m.getMonth()]} ${m.getFullYear()}`;
  const shift = (n) => {
    if (mode === "week") setAnchor(addDays(anchor, 7 * n));
    else {
      const d = parseDay(anchor.slice(0, 8) + "01");
      d.setMonth(d.getMonth() + n);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    }
  };

  const calendar = (
    <Panel className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SectionTitle icon={CalendarDays} tone="gold" className="mb-0" sub="Obiceiurile cu oră apar automat">
          Calendar
        </SectionTitle>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs
            size="sm"
            value={mode}
            onChange={setMode}
            items={[
              { value: "week", label: "Săptămână", icon: CalendarRange },
              { value: "month", label: "Lună", icon: CalendarDays },
            ]}
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim ring-1 ring-edge hover:text-ink" aria-label="Înapoi">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setAnchor(today)} className="focus-ring h-8 rounded-lg px-2.5 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink">
              Azi
            </button>
            <button type="button" onClick={() => shift(1)} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim ring-1 ring-edge hover:text-ink" aria-label="Înainte">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="mb-3 font-pixel text-lg text-ink">{label}</div>
      {mode === "week" ? (
        <WeekView state={state} today={today} anchor={anchor} todo={todo} />
      ) : (
        <MonthView
          state={state}
          today={today}
          anchor={anchor}
          onPick={(day) => {
            setAnchor(day);
            setMode("week");
          }}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-bold text-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-violet/40 ring-1 ring-violet/60" /> to-do
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ background: "repeating-linear-gradient(135deg,#ffc54266 0 3px,#ffc54233 3px 6px)" }} /> obicei programat
        </span>
        <span>Apasă pe un loc liber ca să adaugi un to-do la ora aceea.</span>
      </div>
    </Panel>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-ink">Planificator</h1>
          <p className="text-sm font-semibold text-dim">To-do-uri și programul tău, lângă obiceiurile de fiecare zi.</p>
        </div>
        <div className="lg:hidden">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "calendar", label: "Calendar", icon: CalendarDays },
              { value: "list", label: "Listă", icon: ListTodo },
            ]}
          />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px),1fr]">
        <div className={tab === "list" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <TodoList state={state} today={today} todo={todo} />
        </div>
        <div className={tab === "calendar" ? "min-w-0" : "hidden min-w-0 lg:block"}>{calendar}</div>
      </div>
    </div>
  );
}
