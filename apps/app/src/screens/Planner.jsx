import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, CalendarX, Target, X, CalendarRange, Check, ChevronLeft, ChevronRight, Clock, GripVertical, ListTodo, Timer, Plus, Repeat } from "lucide-react";
import { Button, CheckButton, Choice, Chip, Panel, SectionTitle, Tabs } from "../components/ui.jsx";
import { Shell, useCoach } from "../components/AiCoach.jsx";
import { aiErrorCopy, dailyPlan, decomposeGoal, parseHomework } from "../lib/ai.js";
import { hasOpenTodo } from "../lib/agentActions.js";
import { iconFor } from "../components/icons.js";
import { isScheduled } from "../lib/engine.js";
import {
  RO_DAYS_SHORT,
  RO_MONTHS,
  addDays,
  dayRange,
  fmt12,
  fmtDay,
  fmtHM,
  fmtHour12,
  mondayOf,
  nowMinutes,
  parseDay,
  parseHM,
  relDay,
} from "../lib/dates.js";
import { c } from "../lib/themes.js";
import { firstOccurrence, occursOn, repeatLabel, todosByDay, viewOn } from "../lib/todos.js";
import { nextAssignments, nextExams, normalizeAssignments, normalizeExams, normalizeSession, schoolPlanner, studiedMinutes } from "../lib/schoolPlanner.js";
import { periodKey } from "../lib/goals.js";
import { tr } from "../lib/i18n.js";
import { goalTodoIndex } from "../lib/objectives.js";

// the mark on to-dos that came from a goal (Scopuri or Obiective)
function GoalMark({ g, size = 10 }) {
  if (!g) return null;
  return <Target size={size} className="shrink-0" style={{ color: g.color || c("gold") }} aria-label={tr("din scopul: {label}", { label: g.label })} />;
}

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

function TodoRow({ t, today, habits, todo, onFocusTodo, goal, onSkipDay }) {
  const h = habits.find((x) => x.id === t.habitId);
  return (
    <li
      draggable={!t.repeat}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2.5 rounded-xl bg-well px-2.5 py-2 ring-1 ring-edge"
    >
      <GripVertical size={14} className={`hidden shrink-0 text-faint sm:block ${t.repeat ? "invisible" : "cursor-grab"}`} aria-hidden="true" />
      <CheckButton size="sm" checked={t.done} onClick={() => todo.toggle(t.id, t.viewDay || today)} label={t.done ? tr("Debifează {title}", { title: t.title }) : tr("Bifează {title}", { title: t.title })} />
      <button type="button" onClick={() => todo.edit(t)} className="min-w-0 flex-1 text-left">
        <span className={`flex items-center gap-1.5 text-sm font-bold ${t.done ? "text-faint line-through" : "text-ink"}`}>
          <GoalMark g={goal} size={13} />
          <span className="truncate">{t.title}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-dim">
          {t.repeat ? (
            <span className="inline-flex items-center gap-0.5">
              <Repeat size={10} aria-hidden="true" />
              {repeatLabel(t.repeat)}
            </span>
          ) : t.date ? (
            relDay(t.date, today)
          ) : (
            tr("fără dată")
          )}
          {t.time && (
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} aria-hidden="true" />
              {fmt12(t.time)}
            </span>
          )}
          {h && <span style={{ color: h.color }}>· {h.name}</span>}
          {goal && <span className="truncate" style={{ color: goal.color || c("gold") }}>· {goal.label}</span>}
        </span>
      </button>
      {t.repeat && onSkipDay && (
        <button
          type="button"
          onClick={() => onSkipDay("todo", t.id, t.viewDay || today)}
          className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-panel-hi hover:text-rose"
          aria-label={tr("Scoate doar din ziua asta: {title}", { title: t.title })}
          title={tr("Scoate doar din ziua asta")}
        >
          <CalendarX size={14} aria-hidden="true" />
        </button>
      )}
      {t.focus && !t.done && onFocusTodo && (
        <Button size="sm" variant="violet" icon={Timer} onClick={() => onFocusTodo(t)} aria-label={tr("Începe Focus: {title}", { title: t.title })}>
          Focus
        </Button>
      )}
    </li>
  );
}

function TodoList({ state, today, todo, onFocusTodo, onSkipDay }) {
  const gIdx = goalTodoIndex(state);
  const [filter, setFilter] = useState("today");
  const [text, setText] = useState("");
  const raw = state.todos || [];
  const habits = state.habits || [];
  const weekEnd = addDays(mondayOf(today), 6);
  // a repeating to-do is one row, shown as its occurrence in the period the filter covers
  const span = { today: [today, today], week: [mondayOf(today), weekEnd], all: [today, addDays(today, 366)] }[filter];
  const series = span
    ? raw
        .filter((t) => t.repeat)
        .map((t) => {
          const day = firstOccurrence(t, span[0], span[1]);
          return day ? viewOn(t, day) : null;
        })
        .filter(Boolean)
    : [];
  const singles = raw.filter((t) => !t.repeat);
  const inFilter = (t) => {
    if (filter === "today") return t.date === today || (!t.done && t.date && t.date < today);
    if (filter === "week") return t.date && t.date >= mondayOf(today) && t.date <= weekEnd;
    if (filter === "nodate") return !t.date;
    return true;
  };
  const list = [...singles.filter(inFilter), ...series];
  const overdue = list.filter((t) => !t.done && t.date && t.date < today);
  const open = list.filter((t) => !t.done && !(t.date && t.date < today)).sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || (a.time || "99").localeCompare(b.time || "99"));
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || ""));
  const counts = {
    today:
      singles.filter((t) => !t.done && t.date && t.date <= today).length +
      raw.filter((t) => t.repeat && occursOn(t, today) && !viewOn(t, today).done).length,
    nodate: singles.filter((t) => !t.done && !t.date).length,
  };

  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={ListTodo} sub={tr("+5 momentum pentru fiecare to-do terminat")}>{tr("To-do")}</SectionTitle>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // an empty field opens the full card instead (date, time, duration, repeat)
          if (!text.trim()) return todo.create({ date: filter === "nodate" ? null : today });
          todo.add({ title: text.trim().slice(0, 80), date: filter === "nodate" ? null : today });
          setText("");
        }}
      >
        <input id="planner-todo" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={filter === "nodate" ? tr("Idee fără dată…") : tr("To-do pentru azi…")} aria-label={tr("To-do nou")} />
        <Button type="submit" variant="mint" icon={Plus} aria-label={tr("Adaugă")} />
      </form>
      <Button variant="ghost" size="sm" icon={CalendarPlus} className="mb-3 w-full" onClick={() => todo.create({ date: today, title: text.trim().slice(0, 80) })}>{tr("Programează: dată, oră, repetare")}</Button>
      <Tabs
        className="mb-3"
        size="sm"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "today", label: tr("Azi"), count: counts.today },
          { value: "week", label: tr("Săpt.") },
          { value: "nodate", label: tr("Fără dată"), count: counts.nodate },
          { value: "all", label: tr("Toate") },
        ]}
      />
      {overdue.length > 0 && (
        <>
          <div className="mb-1.5 mt-2 text-xs font-extrabold uppercase tracking-wider text-ember">{tr("Rămase din zilele trecute")}</div>
          <ul className="space-y-1.5">
            {overdue.map((t) => (
              <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} onFocusTodo={onFocusTodo} goal={gIdx[t.id]} onSkipDay={onSkipDay} />
            ))}
          </ul>
        </>
      )}
      {open.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {open.map((t) => (
            <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} onFocusTodo={onFocusTodo} goal={gIdx[t.id]} onSkipDay={onSkipDay} />
          ))}
        </ul>
      )}
      {!overdue.length && !open.length && <p className="py-4 text-center text-sm font-semibold text-dim">{tr("Nimic aici.")}</p>}
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-dim hover:text-ink">{tr("Gata ({length})", { length: done.length })}</summary>
          <ul className="mt-2 space-y-1.5">
            {done.slice(0, 30).map((t) => (
              <TodoRow key={t.id} t={t} today={today} habits={habits} todo={todo} onFocusTodo={onFocusTodo} goal={gIdx[t.id]} onSkipDay={onSkipDay} />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 hidden text-xs font-semibold text-faint sm:block">{tr("Trage un to-do în calendar ca să-i dai o zi și o oră.")}</p>
    </Panel>
  );
}

function WeekView({ state, today, anchor, todo, onMoveHabit, onSkipDay }) {
  const gIdx = goalTodoIndex(state);
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

  // what is dragged is either a to-do ("t…") or a habit block ("habit:<id>:<day it was dragged from>")
  const drop = (raw, day, time) => {
    if (!raw) return;
    if (raw.startsWith("habit:")) {
      const [, id, from] = raw.split(":");
      onMoveHabit?.(id, from, day, time);
    } else todo.move(raw, day, time);
  };

  const byDay = useMemo(() => todosByDay(state.todos, days[0], days[6]), [state.todos, days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <div className={`text-xs font-extrabold uppercase tracking-wider ${isToday ? "text-gold" : "text-dim"}`}>{RO_DAYS_SHORT[d.getDay()]}</div>
                <div className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-lg font-display text-lg ${isToday ? "bg-gold text-on-gold" : "text-ink"}`}>{d.getDate()}</div>
                {sched > 0 && day <= today && (
                  <div className="mx-auto mt-1 h-1 w-10 overflow-hidden rounded-full bg-edge" title={tr("{done}/{sched} obiceiuri bifate", { done, sched })}>
                    <div className="h-full bg-mint" style={{ width: `${Math.min(100, (done / sched) * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* untimed to-dos */}
        <div className="grid border-y border-edge" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <span className="py-2 pr-2 text-right text-xs font-extrabold uppercase leading-tight text-faint">{tr("fără oră")}</span>
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
                drop(e.dataTransfer.getData("text/plain"), day, null);
              }}
              className={`min-h-[42px] min-w-0 space-y-1 border-l border-edge p-1 ${over === `${day}-allday` ? "bg-gold/10" : ""}`}
            >
              {(byDay[day] || [])
                .filter((t) => !t.time)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable={!t.repeat}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={() => todo.edit(t)}
                    className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs font-bold ${t.done ? "bg-ink/5 text-faint line-through" : "bg-violet/20 text-ink ring-1 ring-violet/40"}`}
                  >
                    {t.repeat && <Repeat size={10} className="shrink-0" aria-label={tr("se repetă")} />}
                    <GoalMark g={gIdx[t.id]} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              {habits
                .filter((h) => !h.time && isScheduled(h, day))
                .map((h) => (
                  <span
                    key={h.id}
                    className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-ink"
                    style={{ background: `${h.color}26`, boxShadow: `inset 3px 0 0 ${h.color}` }}
                  >
                    {state.log?.[day]?.[h.id] ? <Check size={10} className="shrink-0" aria-hidden="true" /> : null}
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    {onSkipDay && (
                      <button type="button" onClick={() => onSkipDay("habit", h.id, day)} className="hit focus-ring shrink-0 rounded text-faint hover:text-rose" aria-label={tr("Scoate {name} doar din ziua asta", { name: h.name })}>
                        <X size={11} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
            </div>
          ))}
        </div>
        </div>
        <div>
          <div className="relative grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", height: ((END - START) / 60) * ROW }}>
            <div className="relative">
              {Array.from({ length: (END - START) / 60 }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-xs font-extrabold text-faint" style={{ top: i * ROW }}>
                  {i === 0 ? "" : fmtHour12(START + i * 60)}
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
              for (const t of byDay[day] || []) {
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
                    drop(e.dataTransfer.getData("text/plain"), day, fmtHM(minuteAt(e)));
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
                          title={tr("{name} · {fmt12} · trage-l ca să-l muți", { name: it.h.name, fmt12: fmt12(it.h.time) })}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", `habit:${it.h.id}:${day}`);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className="absolute cursor-grab overflow-hidden rounded-lg px-1.5 py-1 text-xs font-extrabold active:cursor-grabbing"
                          style={{
                            top,
                            height,
                            width,
                            left,
                            color: c("ink"),
                            background: `repeating-linear-gradient(135deg, ${it.h.color}40 0 6px, ${it.h.color}26 6px 12px)`,
                            boxShadow: `inset 3px 0 0 ${it.h.color}`,
                          }}
                        >
                          <span className="flex items-center gap-1">
                            {done ? <Check size={11} className="shrink-0" aria-hidden="true" /> : <Icon size={11} className="shrink-0" aria-hidden="true" />}
                            <span className="min-w-0 flex-1 truncate">{it.h.name}</span>
                            {onSkipDay && (
                              <button
                                type="button"
                                onClick={() => onSkipDay("habit", it.h.id, day)}
                                className="hit focus-ring shrink-0 rounded text-faint hover:text-rose"
                                aria-label={tr("Scoate {name} doar din ziua asta", { name: it.h.name })}
                                title={tr("Scoate doar din ziua asta")}
                              >
                                <X size={11} aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    }
                    const t = it.t;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        draggable={!t.repeat}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        onClick={() => todo.edit(t)}
                        className={`absolute overflow-hidden rounded-lg px-1.5 py-1 text-left text-xs font-extrabold ring-1 ${
                          t.done ? "bg-panel-lo text-faint line-through ring-edge" : "bg-violet/30 text-ink ring-violet/60 hover:bg-violet/40"
                        }`}
                        style={{ top, height, width, left }}
                      >
                        <span className="flex items-center gap-1">
                          {t.repeat && <Repeat size={10} className="shrink-0" aria-label={tr("se repetă")} />}
                          <GoalMark g={gIdx[t.id]} />
                          <span className="truncate">{t.title}</span>
                        </span>
                        {height > 34 && <span className="block text-xs font-bold text-dim">{fmt12(t.time)}</span>}
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
  const byDay = todosByDay(state.todos, days[0], days[41]);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="pb-1 text-center text-xs font-extrabold uppercase tracking-wider text-dim">
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
                day === today ? "bg-gold/10 ring-gold" : inMonth ? "bg-well ring-edge" : "bg-transparent ring-edge/40"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`font-display text-base ${inMonth ? "text-ink" : "text-faint"}`}>{d.getDate()}</span>
                {sched > 0 && day <= today && (
                  <span className={`text-xs font-black ${done >= sched ? "text-mint" : done ? "text-gold" : "text-faint"}`}>
                    {done}/{sched}
                  </span>
                )}
              </span>
              {todos.slice(0, 3).map((t) => (
                <span key={t.id} className={`truncate rounded px-1 py-0.5 text-xs font-bold ${t.done ? "text-faint line-through" : "bg-violet/20 text-ink"}`}>
                  {t.time ? `${fmt12(t.time)} ` : ""}
                  {t.title}
                </span>
              ))}
              {todos.length > 3 && <span className="text-xs font-bold text-dim">+{todos.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CONFIDENCE = { high: tr("ridicată"), medium: tr("medie"), low: tr("scăzută"), unknown: tr("necunoscută") };

const TIME_OPTIONS = [
  { value: 30, label: tr("30 min") },
  { value: 60, label: tr("1 oră") },
  { value: 120, label: tr("2 ore") },
];
const ENERGY_OPTIONS = [
  { value: "low", label: tr("Scăzută") },
  { value: "medium", label: tr("Medie") },
  { value: "high", label: tr("Ridicată") },
];

export function DailyPlanPanel({ state, today, ai, agent }) {
  const [minutes, setMinutes] = useState(60);
  const [energy, setEnergy] = useState("medium");
  const [adding, setAdding] = useState(null); // title being saved
  const [error, setError] = useState("");
  const addStep = async (step, focus = false) => {
    setAdding(step.title);
    setError("");
    try {
      await agent.propose({
        title: step.title,
        dur: step.minutes,
        date: today,
        reason: step.reason,
        focus,
        explanation: { dataUsed: step.dataUsed, confidence: step.confidence, expectedEffect: null },
      });
    } catch (e) {
      setError(aiErrorCopy(e?.code));
    } finally {
      setAdding(null);
    }
  };
  const input = useMemo(
    () => ({
      today,
      minutes,
      energy,
      habits: (state.habits || [])
        .filter((h) => !h.archivedAt)
        .map((h) => ({ name: h.name, done: !!state.log?.[today]?.[h.id], scheduled: isScheduled(h, today) })),
      todos: (state.todos || []).filter((t) => !t.done && (!t.date || t.date <= today)).slice(0, 12),
      goals: (state.goals || []).filter((g) => !g.done).slice(0, 6),
      assignments: nextAssignments(state, today).slice(0, 10),
    }),
    [state, today, minutes, energy]
  );
  const [s, run, history] = useCoach((signal) => dailyPlan(input, signal), {
    kind: "day",
    label: () => `${TIME_OPTIONS.find((o) => o.value === minutes)?.label || `${minutes} min`} · ${ENERGY_OPTIONS.find((o) => o.value === energy)?.label || energy}`,
  });
  if (!ai?.server) return null;
  return (
    <Shell
      state={s}
      run={run}
      label={tr("Construiește planul")}
      history={history}
      summary={(d) => (Array.isArray(d) ? d.map((x) => x.title).join(" · ") : "")}
      idle={tr("Aici apar 2–3 pași pentru azi, fiecare cu motivul lui.")}
      input={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-extrabold text-body">{tr("Timp")}</span>
            <Choice label={tr("Timp disponibil")} value={minutes} onChange={setMinutes} options={TIME_OPTIONS} />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-extrabold text-body">{tr("Energie")}</span>
            <Choice label={tr("Energie")} value={energy} onChange={setEnergy} options={ENERGY_OPTIONS} />
          </div>
        </div>
      }
    >
      {error && <p className="mb-2 text-xs font-bold text-rose">{error}</p>}
      <ol className="space-y-2">
        {s.data?.map((step, i) => {
          const added = hasOpenTodo(state, step.title, today);
          return (
            <li key={`${step.title}-${i}`} className="inset flex flex-wrap items-start gap-3 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet/15 font-display text-violet-hi">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-extrabold text-ink">{step.title}</p>
                  <Chip tone="dim">{step.minutes} min</Chip>
                </div>
                <p className="mt-1 text-sm font-semibold text-body">{step.reason}</p>
                <details className="mt-1 text-xs font-bold text-dim">
                  <summary className="cursor-pointer">{tr("De ce?")}</summary>
                  <p className="mt-1">{tr("Încredere {v}{v2}.", { v: CONFIDENCE[step.confidence] || CONFIDENCE.unknown, v2: step.dataUsed.length ? ` · ${step.dataUsed.join(" · ")}` : "" })}</p>
                </details>
              </div>
              <Button size="sm" variant={added ? "ghost" : "mint"} icon={added ? Check : Plus} disabled={added || adding === step.title} busy={adding === step.title} onClick={() => addStep(step, step.focus)}>
                {added ? tr("În planul de azi") : step.focus ? tr("Planifică Focus") : tr("Adaugă")}
              </Button>
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

export function HomeworkPanel({ state, today, ai, onStateChange }) {
  const [text, setText] = useState("");
  const [s, run, history] = useCoach((signal) => parseHomework(text, today, signal), { kind: "school", label: () => text.trim().slice(0, 80) });
  const [minutes, setMinutes] = useState(25);
  const [hint, setHint] = useState("");
  const go = () => {
    if (!text.trim()) return setHint(tr("Scrie mai întâi ce ai de făcut, de exemplu: „Test la mate vineri”."));
    setHint("");
    run();
  };
  const assignments = nextAssignments(state, today);
  const exams = nextExams(state, today);
  if (!ai?.server) return null;
  const add = (raw) => {
    if (raw?.type === "exam") {
      const exam = normalizeExams([raw], today)[0];
      if (!exam) return;
      onStateChange?.((current) => ({
        ...current,
        schoolPlanner: { ...schoolPlanner(current), exams: [...schoolPlanner(current).exams, { ...exam, id: `e-${Date.now()}`, done: false }] },
      }));
      return;
    }
    const parsed = normalizeAssignments([raw], today)[0];
    if (!parsed) return;
    onStateChange?.((current) => ({
      ...current,
      schoolPlanner: { ...schoolPlanner(current), assignments: [...schoolPlanner(current).assignments, { ...parsed, id: `a-${Date.now()}`, done: false }] },
    }));
  };
  // one tap: `minutes` of study today, against a subject and (optionally) an assignment
  const study = (subject, assignmentId) => {
    const session = normalizeSession({ subject, assignmentId, day: today, minutes }, today);
    if (!session) return;
    onStateChange?.((current) => ({
      ...current,
      schoolPlanner: { ...schoolPlanner(current), sessions: [...schoolPlanner(current).sessions, { ...session, id: `s-${Date.now()}` }] },
    }));
  };
  const studyBtn = (subject, assignmentId) => (
    <button type="button" className="tap focus-ring shrink-0 rounded-lg px-2 py-0.5 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink" onClick={() => study(subject, assignmentId)} aria-label={subject ? tr("Am învățat {minutes} minute la {subject}", { minutes, subject }) : tr("Am învățat {minutes} minute", { minutes })}>
      +{minutes} min
    </button>
  );
  const dayLabel = (n) => (n === 0 ? tr("azi") : n === 1 ? tr("mâine") : tr("în {n} zile", { n }));
  const studiedToday = studiedMinutes(state, today);
  const upcoming = assignments.length > 0 || exams.length > 0;
  return (
    <Shell
      state={s}
      run={go}
      label={tr("Interpretează")}
      history={history}
      summary={(d) => (Array.isArray(d) ? d.map((x) => x.title).join(" · ") : "")}
      hint={hint}
      idle={tr("Aici apar temele și examenele pe care le înțelege Molt, gata de salvat.")}
      input={<input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={tr("Test la mate vineri, proiect luni…")} aria-label={tr("Teme și examene")} />}
      always={
        upcoming && (
          <div className="mt-5 border-t border-edge/60 pt-4">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-sm font-extrabold text-ink">{tr("Ce ai de făcut")}</p>
              <span className="ml-auto text-xs font-bold text-dim">{tr("{v}o sesiune de studiu (min):", { v: studiedToday > 0 ? tr("Azi ai învățat {studiedToday} min · ", { studiedToday }) : "" })}</span>
              <Choice label={tr("Durata unei sesiuni de studiu, în minute")} value={minutes} onChange={setMinutes} options={[15, 25, 45, 60].map((m) => ({ value: m, label: `${m}` }))} />
            </div>
            <ul className="space-y-1.5">
              {exams.slice(0, 3).map((exam) => (
                <li key={exam.id || exam.title} className="flex items-center gap-2 text-sm font-bold text-body">
                  <Chip tone="gold">{tr("Examen")}</Chip>
                  <span className="min-w-0 flex-1 truncate">{exam.title}{exam.subject ? ` · ${exam.subject}` : ""}</span>
                  <span className="shrink-0 text-xs text-dim">{dayLabel(exam.daysLeft)}</span>
                  {studyBtn(exam.subject, null)}
                </li>
              ))}
              {assignments.slice(0, 5).map((assignment) => (
                <li key={assignment.id || assignment.title} className="flex items-center gap-2 text-sm font-bold text-body">
                  <span className="min-w-0 flex-1 truncate">{assignment.title}</span>
                  <span className="shrink-0 text-xs text-dim">{assignment.due}</span>
                  {studyBtn(assignment.subject, assignment.id)}
                </li>
              ))}
            </ul>
          </div>
        )
      }
    >
      {s.data?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-extrabold text-ink">{tr("Propuneri de salvat")}</p>
          {s.data.map((assignment, i) => (
            <div key={`${assignment.title}-${i}`} className="inset flex flex-wrap items-center gap-2 p-3">
              <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">{assignment.title}</span>
              {assignment.type === "exam" && <Chip tone="gold">{tr("Examen")}</Chip>}
              <span className="text-xs font-bold text-dim">{assignment.due}{assignment.type === "exam" ? "" : ` · ${assignment.estimatedMinutes || 30} min`}</span>
              <Button size="sm" variant="mint" icon={Plus} onClick={() => add(assignment)}>{tr("Adaugă")}</Button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function GoalDecomposer({ today, ai, goals }) {
  const [text, setText] = useState("");
  const [s, run, history] = useCoach((signal) => decomposeGoal(text, signal), { kind: "goal", label: () => text.trim().slice(0, 80) });
  const [skip, setSkip] = useState([]);
  const [hint, setHint] = useState("");
  if (!ai?.server) return null;
  const go = () => {
    if (!text.trim()) return setHint(tr("Scrie mai întâi un obiectiv, de exemplu: „Vreau să învăț programare”."));
    setHint("");
    setSkip([]);
    run();
  };
  const keyed = (goal) => ({ ...goal, key: periodKey(goal.period, today) });
  const save = (goal) => goals?.add({ period: goal.period, key: periodKey(goal.period, today), text: goal.text });
  const keep = (s.data || []).filter((_, i) => !skip.includes(i));
  // the typed goal becomes the parent; the steps the user kept are linked to it
  const saveSet = () => {
    goals?.addSet(keyed({ text: text.trim().slice(0, 120), period: "month" }), keep.map(keyed));
    setSkip([]);
  };
  return (
    <Shell
      state={s}
      run={go}
      label={tr("Împarte în pași")}
      history={history}
      summary={(d) => (Array.isArray(d) ? d.map((x) => x.text).join(" · ") : "")}
      hint={hint}
      idle={tr("Aici apar pașii în care Molt împarte scopul tău.")}
      input={<input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={tr("Vreau să învăț programare…")} aria-label={tr("Obiectiv de împărțit în pași")} />}
    >
      {s.data?.length > 0 && (
        <div className="space-y-2">
          {s.data.map((goal, i) =>
            skip.includes(i) ? null : (
              <div key={`${goal.text}-${i}`} className="inset flex flex-wrap items-center gap-2 p-3">
                <span className="min-w-0 flex-1 basis-48 text-sm font-extrabold text-ink">
                  {goal.text}
                  {(goal.due || goal.criteria) && <span className="block text-xs font-semibold text-dim">{[goal.due && tr("până la {due}", { due: goal.due }), goal.criteria].filter(Boolean).join(" · ")}</span>}
                </span>
                <Chip tone="violet">{goal.period === "month" ? tr("luna") : tr("săptămâna")}</Chip>
                <Button size="sm" variant="mint" onClick={() => save(goal)}>{tr("Salvează")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSkip([...skip, i])} aria-label={tr("Renunță la: {text}", { text: goal.text })}>{tr("Scoate")}</Button>
              </div>
            ),
          )}
          {keep.length > 1 && (
            <Button size="sm" variant="violet" onClick={saveSet}>{tr("Salvează tot ca obiectiv cu etape")}</Button>
          )}
        </div>
      )}
    </Shell>
  );
}

// Calendar and to-dos. The AI helpers that used to sit above it (daily plan, homework, goal in steps) live on the Molt
// page; the goals (Scopuri) are with the Obiective in the other tab of Plan.
export default function Planner({ state, today, todo, ai, go, onFocusTodo, onMoveHabit, onSkipDay }) {
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
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            size="sm"
            value={mode}
            onChange={setMode}
            items={[
              { value: "week", label: tr("Săptămână"), icon: CalendarRange },
              { value: "month", label: tr("Lună"), icon: CalendarDays },
            ]}
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim ring-1 ring-edge hover:text-ink" aria-label={tr("Înapoi")}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setAnchor(today)} className="focus-ring h-8 rounded-lg px-2.5 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink">{tr("Azi")}</button>
            <button type="button" onClick={() => shift(1)} className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim ring-1 ring-edge hover:text-ink" aria-label={tr("Înainte")}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="mb-3 font-display text-lg text-ink">{label}</div>
      {mode === "week" ? (
        <WeekView state={state} today={today} anchor={anchor} todo={todo} onMoveHabit={onMoveHabit} onSkipDay={onSkipDay} />
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
    </Panel>
  );

  return (
    <div className="space-y-5">
      <div className="lg:hidden">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "calendar", label: tr("Program"), icon: CalendarDays },
            { value: "list", label: tr("Listă"), icon: ListTodo },
          ]}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px),1fr]">
        <div className={tab === "list" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <TodoList state={state} today={today} todo={todo} onFocusTodo={onFocusTodo} onSkipDay={onSkipDay} />
        </div>
        <div className={tab === "calendar" ? "min-w-0" : "hidden min-w-0 lg:block"}>{calendar}</div>
      </div>
    </div>
  );
}
