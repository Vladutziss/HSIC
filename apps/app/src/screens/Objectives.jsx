// "Obiective": big goals with a progress bar, steps and sub-steps, an optional number to move,
// linked habits, a journal, reminders and celebrations at 25/50/75/100%.

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Archive,
  Bell,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Flag,
  Flame,
  Gift,
  Heart,
  Lightbulb,
  Mountain,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Bar, Button, CheckButton, Chip, Empty, Field, HoldToDelete, IconButton, Modal, Panel, SectionTitle, Toggle, plural } from "../components/ui.jsx";
import { DateSelect, TimeSelect } from "../components/Select.jsx";
import { DayPicker } from "../components/HabitEditor.jsx";
import { HABIT_ICONS, iconFor } from "../components/icons.js";
import { HABIT_COLORS, uid } from "../lib/catalog.js";
import { addDays, fmtDay, fmtLong, relDay } from "../lib/dates.js";
import { quoteById, pickQuote } from "../lib/quotes.js";
import {
  MARKS,
  MAX_OBJECTIVES,
  MAX_STEPS,
  MAX_SUBS,
  TEMPLATES,
  goalStreak,
  idleDays,
  nextStep,
  pace,
  pct,
  recentActivity,
  statusLabel,
} from "../lib/objectives.js";

const PACE_TONE = { done: "mint", none: "dim", ahead: "mint", ontrack: "sky", behind: "ember", late: "rose" };
const ICON_CHOICES = ["target", "rocket", "graduation", "sigma", "book", "brain", "dumbbell", "footprints", "mountain", "heart", "coins", "piggy", "briefcase", "palette", "music", "star"];
const MAX_TITLE = 80;

function GoalIcon({ o, size = 48 }) {
  const Icon = iconFor(o.icon);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl"
      style={{ width: size, height: size, background: `${o.color}26`, color: o.color, boxShadow: `inset 0 0 0 1px ${o.color}66` }}
    >
      <Icon size={Math.round(size * 0.46)} aria-hidden="true" />
    </span>
  );
}

function daysLeftLabel(p) {
  if (p.status === "late") return `depășit cu ${-p.daysLeft} ${plural(-p.daysLeft, "zi", "zile", "de zile")}`;
  if (p.daysLeft === 0) return "termen azi";
  return `${p.daysLeft} ${plural(p.daysLeft, "zi rămasă", "zile rămase", "de zile rămase")}`;
}

/** Progress bar with the 25/50/75 marks and, when there is a deadline, where today falls. */
function ProgressTrack({ o, today, big = false }) {
  const p = pace(o, today);
  const value = pct(o);
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <span className={`font-pixel tabular leading-none text-ink ${big ? "text-4xl" : "text-2xl"}`}>{value}%</span>
        <span className="text-xs font-bold text-dim">{o.doneOn ? `atins ${fmtDay(o.doneOn)}` : p.daysLeft != null ? daysLeftLabel(p) : "fără termen"}</span>
      </div>
      <div className="relative">
        <Bar value={value / 100} tone={o.doneOn ? "mint" : "gold"} height={big ? 18 : 12} label={`Progres ${o.title}`} />
        {MARKS.slice(0, 3).map((m) => (
          <span key={m} className="pointer-events-none absolute top-0 h-full w-px bg-night/50" style={{ left: `${m}%` }} aria-hidden="true" />
        ))}
        {p.timeShare != null && p.status !== "late" && (
          <span
            className="pointer-events-none absolute -top-1 h-[calc(100%+8px)] w-0.5 rounded bg-sky"
            style={{ left: `${Math.round(p.timeShare * 100)}%` }}
            title="Unde ar trebui să fii azi, după timpul scurs"
            aria-hidden="true"
          />
        )}
      </div>
      {big && p.timeShare != null && p.status !== "late" && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-dim">
          <span className="inline-block h-2.5 w-0.5 rounded bg-sky" aria-hidden="true" /> linia albastră: cât din timp a trecut ({Math.round(p.timeShare * 100)}%)
        </p>
      )}
    </div>
  );
}

function ActivityStrip({ o, today }) {
  const days = recentActivity(o, today, 14);
  return (
    <div className="flex items-end gap-1" aria-label="Activitate în ultimele 14 zile">
      {days.map(({ day, count }) => (
        <span
          key={day}
          title={`${fmtDay(day)}: ${count ? `${count} ${plural(count, "pas", "pași", "de pași")}` : "nimic"}`}
          className={`h-4 flex-1 rounded-sm ${count >= 3 ? "bg-gold" : count === 2 ? "bg-gold/70" : count === 1 ? "bg-gold/40" : "bg-well ring-1 ring-edge"}`}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------ list

function GoalCard({ o, today, onOpen, onStep, onSub }) {
  const n = nextStep(o);
  const p = pace(o, today);
  const streak = goalStreak(o, today);
  const idle = idleDays(o, today);
  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <GoalIcon o={o} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold leading-tight text-ink">{o.title}</h3>
          {o.why && <p className="mt-0.5 line-clamp-2 text-sm font-semibold italic text-dim">„{o.why}”</p>}
        </div>
      </div>
      <ProgressTrack o={o} today={today} />
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={PACE_TONE[p.status]} icon={TrendingUp}>
          {statusLabel[p.status]}
        </Chip>
        {streak > 1 && (
          <Chip tone="ember" icon={Flame}>
            {streak} zile la rând
          </Chip>
        )}
        {!o.doneOn && idle >= 4 && <Chip tone="rose">neatins de {idle} zile</Chip>}
        {o.reminder?.on && <Chip icon={Bell}>{o.reminder.time}</Chip>}
      </div>
      {n && !o.doneOn && (
        <div className="inset flex items-center gap-3 p-3">
          <CheckButton
            size="sm"
            checked={false}
            label={`Bifează: ${n.sub ? n.sub.title : n.step.title}`}
            onClick={() => (n.sub ? onSub(o.id, n.step.id, n.sub.id) : onStep(o.id, n.step.id))}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gold-hi">Următorul pas</div>
            <div className="truncate text-sm font-bold text-ink">{n.sub ? `${n.step.title} → ${n.sub.title}` : n.step.title}</div>
          </div>
        </div>
      )}
      <Button className="mt-auto" variant="ghost" size="sm" onClick={onOpen}>
        Deschide obiectivul
      </Button>
    </Panel>
  );
}

// ------------------------------------------------------------ editor

const blank = (today, state) => ({
  id: uid("g"),
  title: "",
  why: "",
  reward: "",
  icon: "target",
  color: HABIT_COLORS[(state.objectives || []).length % HABIT_COLORS.length],
  start: today,
  deadline: null,
  doneOn: null,
  archived: false,
  habitIds: [],
  metric: null,
  steps: [],
  reminder: { on: true, days: [1, 3, 5], time: "18:00" },
  log: [],
  seenMarks: [],
  isNew: true,
});

function fromTemplate(t, today, state) {
  return {
    ...blank(today, state),
    title: t.title,
    why: t.why,
    icon: t.icon,
    metric: t.metric ? { ...t.metric, value: t.metric.start } : null,
    steps: t.steps.map((title) => ({ id: uid("s"), title, done: false, doneOn: null, date: null, todoId: null, subs: [] })),
  };
}

export function ObjectiveEditor({ initial, state, onSave, onClose }) {
  const [o, setO] = useState(initial);
  const [stepsText, setStepsText] = useState("");
  const [hasMetric, setHasMetric] = useState(!!initial.metric);
  const set = (patch) => setO((x) => ({ ...x, ...patch }));
  const habits = (state.habits || []).filter((h) => !h.archived);
  const valid = o.title.trim().length > 0 && (!hasMetric || (o.metric && o.metric.target !== "" && o.metric.target != null && Number(o.metric.target) !== Number(o.metric.start || 0)));

  function save() {
    if (!valid) return;
    const extra = initial.isNew
      ? stepsText
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, MAX_STEPS)
          .map((title) => ({ id: uid("s"), title: title.slice(0, MAX_TITLE), done: false, doneOn: null, date: null, todoId: null, subs: [] }))
      : [];
    const metric = hasMetric
      ? { unit: (o.metric.unit || "").slice(0, 16), start: Number(o.metric.start) || 0, target: Number(o.metric.target), value: o.metric.value == null || o.metric.value === "" ? Number(o.metric.start) || 0 : Number(o.metric.value) }
      : null;
    const { isNew, ...rest } = o;
    onSave({ ...rest, title: o.title.trim().slice(0, MAX_TITLE), why: o.why.trim().slice(0, 240), reward: o.reward.trim().slice(0, 120), metric, steps: [...(o.steps || []), ...extra] }, !!isNew);
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={initial.isNew ? "Obiectiv nou" : "Editează obiectivul"}
      icon={Target}
      tone="gold"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={save} disabled={!valid} icon={CheckCircle2}>
            Salvează
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <Field label="Ce vrei să atingi?" htmlFor="ob-title">
            <input id="ob-title" data-autofocus className="field" maxLength={MAX_TITLE} value={o.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex. Intru în lotul de AI" />
          </Field>
          <Field label="De ce contează pentru tine?" hint="Ți-l arătăm când motivația scade. Scrie-l pentru tine din viitor." htmlFor="ob-why">
            <textarea id="ob-why" className="field min-h-[76px]" maxLength={240} value={o.why} onChange={(e) => set({ why: e.target.value })} placeholder="ex. Vreau să știu că pot concura cu cei mai buni." />
          </Field>
          <Field label="Cum te răsplătești când îl atingi?" htmlFor="ob-reward">
            <input id="ob-reward" className="field" maxLength={120} value={o.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="ex. Un weekend la munte" />
          </Field>
          <Field label="Termen" hint="Opțional. Cu termen vezi dacă ești în grafic." htmlFor="ob-deadline">
            <DateSelect id="ob-deadline" value={o.deadline} onChange={(v) => set({ deadline: v })} placeholder="Fără termen" />
          </Field>
          {initial.isNew && (
            <Field label="Primii pași" hint="Câte unul pe rând. Poți adăuga sub-pași după." htmlFor="ob-steps">
              <textarea
                id="ob-steps"
                className="field min-h-[110px]"
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder={"Strâng subiectele din ultimii ani\nO problemă grea pe zi\nSimulare duminica"}
              />
            </Field>
          )}
        </div>

        <div className="space-y-4">
          <Field label="Iconiță și culoare">
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.filter((k) => HABIT_ICONS[k]).map((k) => {
                const Icon = iconFor(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={k}
                    aria-pressed={o.icon === k}
                    onClick={() => set({ icon: k })}
                    className={`focus-ring grid h-9 w-9 place-items-center rounded-lg ring-1 transition ${o.icon === k ? "bg-gold/15 text-gold-hi ring-gold" : "bg-well text-dim ring-edge hover:text-ink"}`}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {HABIT_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  aria-label={`Culoarea ${col}`}
                  aria-pressed={o.color === col}
                  onClick={() => set({ color: col })}
                  className={`focus-ring h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-panel transition ${o.color === col ? "ring-ink" : "ring-transparent"}`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </Field>

          <div className="inset space-y-3 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-ink">Un număr de urmărit</div>
                <div className="text-xs font-semibold text-dim">kg, pagini, lei, km… progresul ține cont și de el</div>
              </div>
              <Toggle
                checked={hasMetric}
                label="Număr de urmărit"
                onChange={(v) => {
                  setHasMetric(v);
                  if (v && !o.metric) set({ metric: { unit: "", start: 0, target: "", value: 0 } });
                }}
              />
            </div>
            {hasMetric && o.metric && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Pornești de la" htmlFor="ob-ms">
                  <input id="ob-ms" type="number" className="field" value={o.metric.start} onChange={(e) => set({ metric: { ...o.metric, start: e.target.value } })} />
                </Field>
                <Field label="Ținta" htmlFor="ob-mt">
                  <input id="ob-mt" type="number" className="field" value={o.metric.target} onChange={(e) => set({ metric: { ...o.metric, target: e.target.value } })} />
                </Field>
                <Field label="Unitate" htmlFor="ob-mu">
                  <input id="ob-mu" className="field" maxLength={16} value={o.metric.unit} onChange={(e) => set({ metric: { ...o.metric, unit: e.target.value } })} placeholder="km" />
                </Field>
              </div>
            )}
          </div>

          {habits.length > 0 && (
            <Field label="Obiceiuri care te duc acolo">
              <div className="flex flex-wrap gap-1.5">
                {habits.map((h) => {
                  const on = (o.habitIds || []).includes(h.id);
                  const Icon = iconFor(h.icon);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ habitIds: on ? o.habitIds.filter((x) => x !== h.id) : [...(o.habitIds || []), h.id] })}
                      className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 transition ${on ? "bg-mint/15 text-mint ring-mint/50" : "bg-well text-dim ring-edge hover:text-ink"}`}
                    >
                      <Icon size={13} aria-hidden="true" /> {h.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <div className="inset space-y-3 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-ink">Reminder</div>
                <div className="text-xs font-semibold text-dim">Apare în aplicație în zilele alese, dacă n-ai avansat încă</div>
              </div>
              <Toggle checked={!!o.reminder?.on} label="Reminder" onChange={(v) => set({ reminder: { ...o.reminder, on: v } })} />
            </div>
            {o.reminder?.on && (
              <>
                <DayPicker idPrefix="ob-rem" value={o.reminder.days || []} onChange={(days) => set({ reminder: { ...o.reminder, days } })} />
                <TimeSelect id="ob-rem-time" clearable={false} value={o.reminder.time} onChange={(time) => set({ reminder: { ...o.reminder, time: time || "18:00" } })} />
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ celebration

export function Celebration({ data, state, onClose }) {
  if (!data) return null;
  const { o, mark } = data;
  const q = quoteById(data.quoteId) || pickQuote("levelup", state.profile?.path, [], o.id + mark);
  const done = mark === 100;
  return (
    <Modal open onClose={onClose} tone="gold">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="anim-pop grid h-20 w-20 place-items-center rounded-3xl bg-gold/15 text-gold ring-2 ring-gold/50">
          {done ? <Trophy size={40} aria-hidden="true" /> : <Mountain size={40} aria-hidden="true" />}
        </span>
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest text-gold-hi">{done ? "Obiectiv atins" : `${mark}% din drum`}</div>
          <h2 className="mt-1 font-pixel text-2xl text-ink">{o.title}</h2>
        </div>
        <p className="max-w-sm text-sm font-semibold text-body">
          {done
            ? "Ai dus-o până la capăt. Asta e ceva ce puțini fac."
            : mark >= 75
              ? "Ultima porțiune. Acum se vede linia de sosire."
              : mark >= 50
                ? "Jumătate. De aici, fiecare pas te duce mai aproape de final decât de start."
                : "Primul sfert e cel mai greu: ai trecut de el."}
        </p>
        {done && o.reward && (
          <div className="inset flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-ink">
            <Gift size={16} className="text-gold" aria-hidden="true" /> Recompensa ta: {o.reward}
          </div>
        )}
        {q && (
          <figure className="max-w-md border-l-2 border-gold/60 pl-3 text-left">
            <blockquote className="text-sm font-semibold italic text-body">„{q.text}”</blockquote>
            <figcaption className="mt-1 text-xs font-bold text-dim">
              {q.author}
              {q.source ? `, ${q.source}` : ""}
            </figcaption>
          </figure>
        )}
        <Button onClick={onClose} icon={Sparkles}>
          Mai departe
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ detail

function StepRow({ o, s, i, count, today, act }) {
  const [open, setOpen] = useState((s.subs || []).length > 0 && !s.done);
  const [sub, setSub] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const subs = s.subs || [];
  const doneSubs = subs.filter((x) => x.done).length;
  const addSub = (e) => {
    e.preventDefault();
    const t = sub.trim();
    if (!t || subs.length >= MAX_SUBS) return;
    act.addSub(o.id, s.id, t.slice(0, MAX_TITLE));
    setSub("");
  };
  return (
    <li className={`rounded-xl ring-1 ${s.done ? "bg-mint/5 ring-mint/25" : "bg-well/60 ring-edge"}`}>
      <div className="flex items-center gap-3 p-2.5">
        <CheckButton size="sm" checked={!!s.done} label={`${s.done ? "Debifează" : "Bifează"}: ${s.title}`} onClick={() => act.toggleStep(o.id, s.id)} />
        <button type="button" className="focus-ring min-w-0 flex-1 rounded text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={`block text-sm font-bold ${s.done ? "text-dim line-through" : "text-ink"}`}>{s.title}</span>
          <span className="flex flex-wrap gap-x-2 text-[11px] font-bold text-dim">
            {subs.length > 0 && <span>{doneSubs}/{subs.length} sub-pași</span>}
            {s.date && <span>în plan: {relDay(s.date, today)}</span>}
            {s.done && s.doneOn && <span>gata {fmtDay(s.doneOn)}</span>}
          </span>
        </button>
        {subs.length > 0 && (
          <span className="hidden w-16 sm:block">
            <Bar value={doneSubs / subs.length} tone="mint" segmented={false} height={6} label="Sub-pași" />
          </span>
        )}
        <IconButton icon={ChevronDown} label={open ? "Ascunde sub-pașii" : "Arată sub-pașii"} className={`transition-transform ${open ? "rotate-180" : ""}`} onClick={() => setOpen((v) => !v)} />
      </div>
      {open && (
        <div className="space-y-2 border-t border-edge px-3 pb-3 pt-2 sm:pl-12">
          {subs.length > 0 && (
            <ul className="space-y-1.5">
              {subs.map((x) => (
                <li key={x.id} className="group flex items-center gap-2">
                  <CheckButton size="sm" checked={!!x.done} label={`${x.done ? "Debifează" : "Bifează"}: ${x.title}`} onClick={() => act.toggleSub(o.id, s.id, x.id)} />
                  <span className={`min-w-0 flex-1 text-sm font-semibold ${x.done ? "text-dim line-through" : "text-body"}`}>{x.title}</span>
                  <IconButton icon={Trash2} size={14} label={`Șterge ${x.title}`} className="opacity-60 hover:opacity-100" onClick={() => act.removeSub(o.id, s.id, x.id)} />
                </li>
              ))}
            </ul>
          )}
          {subs.length < MAX_SUBS && (
            <form onSubmit={addSub} className="flex gap-2">
              <input className="field h-9 flex-1 py-1 text-sm" value={sub} maxLength={MAX_TITLE} onChange={(e) => setSub(e.target.value)} placeholder="Adaugă un sub-pas" aria-label="Sub-pas nou" />
              <Button size="sm" variant="ghost" icon={Plus} type="submit" disabled={!sub.trim()}>
                Adaugă
              </Button>
            </form>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {scheduling ? (
              <div className="flex items-center gap-2">
                <DateSelect
                  id={`sch-${s.id}`}
                  value={s.date}
                  onChange={(d) => {
                    act.schedule(o.id, s.id, d);
                    setScheduling(false);
                  }}
                  placeholder="Alege ziua"
                />
                <Button size="sm" variant="ghost" onClick={() => setScheduling(false)}>
                  Renunță
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" icon={CalendarPlus} onClick={() => setScheduling(true)}>
                {s.date ? "Mută în plan" : "Pune în plan"}
              </Button>
            )}
            <IconButton icon={ArrowUp} label="Mută mai sus" disabled={i === 0} onClick={() => act.moveStep(o.id, s.id, -1)} />
            <IconButton icon={ArrowDown} label="Mută mai jos" disabled={i === count - 1} onClick={() => act.moveStep(o.id, s.id, 1)} />
            <IconButton icon={Trash2} label={`Șterge pasul ${s.title}`} onClick={() => act.removeStep(o.id, s.id)} />
          </div>
        </div>
      )}
    </li>
  );
}

function MetricPanel({ o, act }) {
  const m = o.metric;
  const [v, setV] = useState("");
  if (!m) return null;
  const submit = (e) => {
    e.preventDefault();
    if (v === "" || Number.isNaN(Number(v))) return;
    act.setMetric(o.id, Number(v));
    setV("");
  };
  const history = (o.log || []).filter((e) => e.kind === "metric").slice(-6);
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={TrendingUp} tone="sky" sub={`de la ${m.start} la ${m.target} ${m.unit}`}>
        Numărul tău
      </SectionTitle>
      <div className="flex items-end gap-2">
        <span className="font-pixel tabular text-4xl leading-none text-ink">{m.value ?? m.start}</span>
        <span className="pb-1 text-sm font-bold text-dim">
          / {m.target} {m.unit}
        </span>
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input type="number" step="any" className="field flex-1" value={v} onChange={(e) => setV(e.target.value)} placeholder="Valoarea de azi" aria-label="Valoare nouă" />
        <Button type="submit" variant="violet" disabled={v === ""}>
          Salvează
        </Button>
      </form>
      {history.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs font-bold text-dim">
          {history.reverse().map((e) => (
            <li key={e.id} className="flex justify-between">
              <span>{fmtDay(e.day)}</span>
              <span className="text-body">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Journal({ o, today, act }) {
  const [text, setText] = useState("");
  const notes = (o.log || []).filter((e) => e.kind === "note" || e.kind === "done").slice(-20).reverse();
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    act.addNote(o.id, t.slice(0, 280));
    setText("");
  };
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={NotebookPen} tone="violet" sub="Ce ai învățat, ce te-a blocat, ce urmează">
        Jurnal
      </SectionTitle>
      <form onSubmit={submit} className="space-y-2">
        <textarea className="field min-h-[70px]" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="Azi am…" aria-label="Notă nouă" />
        <Button size="sm" variant="violet" type="submit" disabled={!text.trim()} icon={Plus}>
          Adaugă nota
        </Button>
      </form>
      {notes.length > 0 ? (
        <ol className="mt-4 space-y-2.5">
          {notes.map((e) => (
            <li key={e.id} className="border-l-2 border-violet/50 pl-3">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-dim">{relDay(e.day, today)}</div>
              <p className="text-sm font-semibold text-body">{e.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs font-semibold text-dim">Notele contează și ele: o zi cu o notă nu e o zi pierdută.</p>
      )}
    </Panel>
  );
}

function Detail({ o, state, d, today, act, onBack, onEdit, go }) {
  const [step, setStep] = useState("");
  const p = pace(o, today);
  const streak = goalStreak(o, today);
  const steps = o.steps || [];
  const doneSteps = steps.filter((s) => s.done).length;
  const habits = (state.habits || []).filter((h) => (o.habitIds || []).includes(h.id));
  const addStep = (e) => {
    e.preventDefault();
    const t = step.trim();
    if (!t || steps.length >= MAX_STEPS) return;
    act.addStep(o.id, t.slice(0, MAX_TITLE));
    setStep("");
  };
  const week = useMemo(() => {
    const out = {};
    for (const h of habits) {
      let n = 0;
      for (let i = 0; i < 7; i++) {
        const key = addDays(today, -i);
        if (state.log?.[key]?.[h.id]) n++;
      }
      out[h.id] = n;
    }
    return out;
  }, [habits, state.log, today]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Toate obiectivele
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
            Editează
          </Button>
          {o.doneOn ? (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => act.reopen(o.id)}>
              Redeschide
            </Button>
          ) : (
            <Button variant="mint" size="sm" icon={Trophy} onClick={() => act.finish(o.id)}>
              Marchează atins
            </Button>
          )}
        </div>
      </div>

      <Panel tone="gold" corners className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <GoalIcon o={o} size={64} />
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-gold-hi">Obiectiv{o.deadline ? ` · până ${fmtLong(o.deadline)}` : ""}</div>
              <h1 className="font-pixel text-3xl leading-tight text-ink">{o.title}</h1>
              {o.why && (
                <p className="mt-2 flex gap-2 text-sm font-semibold text-body">
                  <Heart size={16} className="mt-0.5 shrink-0 text-rose" aria-hidden="true" />
                  <span className="italic">„{o.why}”</span>
                </p>
              )}
              {o.reward && (
                <p className="mt-1.5 flex gap-2 text-sm font-semibold text-body">
                  <Gift size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                  <span>La final: {o.reward}</span>
                </p>
              )}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2 text-center md:w-72">
            <div className="inset px-2 py-2">
              <div className="font-pixel text-xl text-ink">
                {doneSteps}/{steps.length}
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">pași</div>
            </div>
            <div className="inset px-2 py-2">
              <div className="font-pixel text-xl text-ink">{streak}</div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">zile la rând</div>
            </div>
            <div className="inset px-2 py-2">
              <div className={`font-pixel text-xl ${PACE_TONE[p.status] === "rose" ? "text-rose" : "text-ink"}`}>{p.daysLeft == null ? "–" : Math.abs(p.daysLeft)}</div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">{p.status === "late" ? "zile peste" : "zile rămase"}</div>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <ProgressTrack o={o} today={today} big />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone={PACE_TONE[p.status]} icon={TrendingUp}>
            {statusLabel[p.status]}
          </Chip>
          {MARKS.map((m) => (
            <Chip key={m} tone={pct(o) >= m ? "gold" : "dim"} icon={Flag}>
              {m}%
            </Chip>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-dim">Ultimele 14 zile</div>
          <ActivityStrip o={o} today={today} />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-7">
          <Panel className="p-4 sm:p-5">
            <SectionTitle icon={Flag} sub="Bifează pașii mici; fiecare bifă aduce momentum ca un to-do (+5)">
              Pașii
            </SectionTitle>
            {steps.length > 0 ? (
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <StepRow key={s.id} o={o} s={s} i={i} count={steps.length} today={today} act={act} />
                ))}
              </ol>
            ) : (
              <p className="inset p-4 text-center text-sm font-semibold text-dim">Împarte obiectivul în pași mici, de o zi sau două fiecare.</p>
            )}
            {steps.length < MAX_STEPS && (
              <form onSubmit={addStep} className="mt-3 flex gap-2">
                <input className="field flex-1" value={step} maxLength={MAX_TITLE} onChange={(e) => setStep(e.target.value)} placeholder="Pas nou" aria-label="Pas nou" />
                <Button type="submit" icon={Plus} disabled={!step.trim()}>
                  Adaugă
                </Button>
              </form>
            )}
          </Panel>
          <Journal o={o} today={today} act={act} />
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-5">
          <MetricPanel o={o} act={act} />
          <Panel className="p-4 sm:p-5">
            <SectionTitle icon={Sparkles} tone="mint" sub="Obiceiurile care te duc spre obiectiv">
              Obiceiuri legate
            </SectionTitle>
            {habits.length ? (
              <ul className="space-y-2">
                {habits.map((h) => {
                  const Icon = iconFor(h.icon);
                  return (
                    <li key={h.id}>
                      <button type="button" onClick={() => go("habits", h.id)} className="focus-ring flex w-full items-center gap-3 rounded-xl bg-well/60 p-2.5 text-left ring-1 ring-edge hover:ring-edge-hi">
                        <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${h.color}26`, color: h.color }}>
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{h.name}</span>
                        <span className="text-xs font-extrabold text-dim">{week[h.id]}/7 zile</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm font-semibold text-dim">Leagă obiceiuri din „Editează”: un obiectiv mare se atinge prin ce faci zilnic.</p>
            )}
          </Panel>
          <Panel className="p-4 sm:p-5">
            <SectionTitle icon={o.reminder?.on ? BellRing : Bell} tone="ember">
              Reminder
            </SectionTitle>
            {o.reminder?.on ? (
              <p className="text-sm font-semibold text-body">
                {["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"].filter((_, i) => o.reminder.days.includes(i)).join(", ") || "Nicio zi aleasă"} la {o.reminder.time}. Apare pe Acasă dacă n-ai avansat încă în ziua aceea.
              </p>
            ) : (
              <p className="text-sm font-semibold text-dim">Oprit. Te anunțăm totuși dacă obiectivul stă pe loc 4 zile.</p>
            )}
            <Button className="mt-3" size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
              Schimbă
            </Button>
          </Panel>
          <Panel className="flex items-center justify-between gap-3 p-4">
            <Button size="sm" variant="ghost" icon={Archive} onClick={() => act.archive(o.id, !o.archived)}>
              {o.archived ? "Scoate din arhivă" : "Arhivează"}
            </Button>
            <HoldToDelete label="Ține apăsat ca să ștergi obiectivul" onConfirm={() => act.remove(o.id)} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ screen

export default function Objectives({ state, d, today, go, focus, setFocus, act, onCreate, onEdit }) {
  const [showArchive, setShowArchive] = useState(false);
  const all = state.objectives || [];
  const open = all.find((o) => o.id === focus);
  if (open) return <Detail o={open} state={state} d={d} today={today} act={act} go={go} onBack={() => setFocus(null)} onEdit={() => onEdit(open)} />;

  const active = all.filter((o) => !o.archived && !o.doneOn);
  const done = all.filter((o) => !o.archived && o.doneOn);
  const archived = all.filter((o) => o.archived);
  const full = active.length >= MAX_OBJECTIVES;
  const avg = active.length ? Math.round(active.reduce((a, o) => a + pct(o), 0) / active.length) : 0;
  const stepsThisWeek = all.reduce((a, o) => a + recentActivity(o, today, 7).reduce((x, y) => x + y.count, 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-ink">Obiective</h1>
          <p className="text-sm font-semibold text-dim">Ținte mari, împărțite în pași mici. Fiecare pas bifat aduce momentum.</p>
        </div>
        <Button icon={Plus} disabled={full} onClick={() => onCreate()} title={full ? `Maxim ${MAX_OBJECTIVES} obiective active` : undefined}>
          Obiectiv nou
        </Button>
      </div>

      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Panel className="p-3 text-center">
            <div className="font-pixel text-2xl text-ink">{active.length}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">active</div>
          </Panel>
          <Panel className="p-3 text-center">
            <div className="font-pixel text-2xl text-ink">{avg}%</div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">progres mediu</div>
          </Panel>
          <Panel className="p-3 text-center">
            <div className="font-pixel text-2xl text-ink">{stepsThisWeek}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">mișcări în 7 zile</div>
          </Panel>
        </div>
      )}

      {active.length === 0 ? (
        <Panel className="p-5 sm:p-6">
          <Empty icon={Target} title="Ce vrei să atingi în lunile următoare?">
            Un obiectiv bun are un „de ce”, un termen și pași mici. Pornește de la zero sau de la o idee:
          </Empty>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Icon = iconFor(t.icon);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onCreate(t)}
                  className="focus-ring flex items-start gap-3 rounded-xl bg-well/60 p-3 text-left ring-1 ring-edge transition hover:ring-gold/60"
                >
                  <Icon size={20} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-extrabold text-ink">{t.title}</span>
                    <span className="block text-xs font-semibold text-dim">{t.steps.length} pași propuși</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-center">
            <Button icon={Plus} onClick={() => onCreate()}>
              Obiectiv de la zero
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((o) => (
            <GoalCard key={o.id} o={o} today={today} onOpen={() => setFocus(o.id)} onStep={act.toggleStep} onSub={act.toggleSub} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionTitle icon={Trophy} tone="mint" sub="Dovada că poți">
            Atinse
          </SectionTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {done.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setFocus(o.id)} className="focus-ring flex w-full items-center gap-3 rounded-xl bg-mint/5 p-2.5 text-left ring-1 ring-mint/25 hover:ring-mint/60">
                  <GoalIcon o={o} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{o.title}</span>
                  <span className="text-xs font-extrabold text-mint">{fmtDay(o.doneOn)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {archived.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" icon={Archive} onClick={() => setShowArchive((v) => !v)}>
            Arhivă ({archived.length})
          </Button>
          {showArchive && (
            <ul className="mt-2 space-y-1.5">
              {archived.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setFocus(o.id)} className="focus-ring flex w-full items-center gap-3 rounded-xl bg-well/60 p-2 text-left ring-1 ring-edge">
                    <GoalIcon o={o} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-dim">{o.title}</span>
                    <span className="text-xs font-bold text-dim">{pct(o)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs font-semibold text-dim">
        <Lightbulb size={14} className="shrink-0 text-gold" aria-hidden="true" />
        Sfat: pune pașii în plan (calendar). Când bifezi to-do-ul, se bifează și pasul.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ dashboard card

export function ObjectivesMini({ state, today, reminders, go, act }) {
  const active = (state.objectives || []).filter((o) => !o.archived && !o.doneOn);
  if (!active.length) {
    return (
      <Panel className="p-4">
        <SectionTitle icon={Target} tone="sky">
          Obiective
        </SectionTitle>
        <p className="text-sm font-semibold text-dim">Ai un obiectiv mare? Împarte-l în pași și urmărește-ți progresul.</p>
        <Button className="mt-3" size="sm" variant="ghost" icon={Plus} onClick={() => go("goals")}>
          Primul obiectiv
        </Button>
      </Panel>
    );
  }
  const due = new Set(reminders.map((r) => r.o.id));
  const list = [...active].sort((a, b) => (due.has(b.id) ? 1 : 0) - (due.has(a.id) ? 1 : 0)).slice(0, 3);
  return (
    <Panel className="p-4">
      <SectionTitle
        icon={Target}
        tone="sky"
        sub={reminders.length ? `${reminders.length} ${plural(reminders.length, "reminder", "remindere", "de remindere")} azi` : "Pașii următori"}
        action={
          <Button size="sm" variant="ghost" onClick={() => go("goals")}>
            Toate
          </Button>
        }
      >
        Obiective
      </SectionTitle>
      <ul className="space-y-3">
        {list.map((o) => {
          const n = nextStep(o);
          const r = reminders.find((x) => x.o.id === o.id);
          return (
            <li key={o.id} className={`rounded-xl p-2.5 ring-1 ${r ? "bg-ember/10 ring-ember/40" : "bg-well/60 ring-edge"}`}>
              <button type="button" onClick={() => go("goals", o.id)} className="focus-ring block w-full rounded text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-extrabold text-ink">{o.title}</span>
                  <span className="font-pixel text-sm text-gold-hi">{pct(o)}%</span>
                </div>
                <Bar className="mt-1.5" value={pct(o) / 100} height={8} label={`Progres ${o.title}`} />
              </button>
              {r && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-ember">
                  <BellRing size={13} aria-hidden="true" />
                  {r.reason === "idle" ? `Stă pe loc de ${r.idle} zile. Un pas mic azi?` : "E ziua lui. Fă un pas, cât de mic."}
                </p>
              )}
              {n && (
                <div className="mt-2 flex items-center gap-2">
                  <CheckButton size="sm" checked={false} label={`Bifează: ${n.sub ? n.sub.title : n.step.title}`} onClick={() => (n.sub ? act.toggleSub(o.id, n.step.id, n.sub.id) : act.toggleStep(o.id, n.step.id))} />
                  <span className="min-w-0 truncate text-xs font-bold text-body">{n.sub ? n.sub.title : n.step.title}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export { blank as blankObjective, fromTemplate as objectiveFromTemplate };
