// Focus mode: the whole screen becomes a clock that counts FOCUSED time (pauses and breaks do not count).
// Tap the clock to switch between the mechanical face and big digital hh:mm:ss. With a pomodoro setting the
// session takes its own breaks (a calm countdown screen) and waits for you to continue afterwards.
// The state machine is in src/lib/focus.js; this file is the screens.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Coffee, ListTodo, Pause, Pencil, Play, Plus, SkipForward, Sparkles, Timer, Trash2, X } from "lucide-react";
import { Button, Modal, Bar } from "./ui.jsx";
import { Select } from "./Select.jsx";
import { todosForToday } from "../lib/todos.js";
import { RULES } from "../lib/engine.js";
import { pickQuote } from "../lib/quotes.js";
import { BREAK_CHOICES, PRESETS, WORK_CHOICES, advance, continueWork, finish, fmtClock, fmtMinSec, fmtSpan, loadPrefs, newSession, pause, resume, savePrefs, view } from "../lib/focus.js";
import { tr } from "../lib/i18n.js";

const pad = (n) => String(n).padStart(2, "0");
const C = 200; // centre of the 400 x 400 face

// ------------------------------------------------------------ sound

let audio = null;
/** A soft two-note chime; browsers only allow it after the player has touched the page, which starting Focus did. */
function chime(kind) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "break" ? [660, 523] : [523, 659, 784]; // down into a break, up back to work
    notes.forEach((hz, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      const t = audio.currentTime + i * 0.22;
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.75);
    });
  } catch {
    /* no sound is fine */
  }
}

// ------------------------------------------------------------ setup

export function FocusSetup({ open, onStart, onClose, initial }) {
  const saved = useMemo(() => loadPrefs().setup || {}, []);
  // `initial.work` (a planned to-do's length) selects "custom", snapped to the nearest choice; the break stays from prefs
  const snap = initial?.work ? WORK_CHOICES.reduce((a, m) => (Math.abs(m - initial.work) < Math.abs(a - initial.work) ? m : a)) : null;
  const [preset, setPreset] = useState(snap ? "custom" : saved.preset || "p25");
  const [work, setWork] = useState(snap || saved.work || 25);
  const [brk, setBrk] = useState(saved.brk || 5);
  const options = [...PRESETS, { id: "custom", label: tr("Personalizat"), sub: tr("Alegi tu cât lucrezi și cât te odihnești") }];
  const pomodoro = preset === "custom" ? { work, brk } : PRESETS.find((p) => p.id === preset)?.pomodoro ?? null;
  const go = () => {
    savePrefs({ setup: { preset, work, brk } });
    onStart(pomodoro);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("Începe Focus")}
      icon={Timer}
      tone="violet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tr("Renunță")}</Button>
          <Button icon={Play} onClick={go} data-autofocus>{tr("Începe")}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-body">{tr("Cronometrul numără doar timpul în care te concentrezi. Alege dacă vrei pauze automate.")}</p>
      <p className="mb-3 rounded-xl bg-gold/10 p-2.5 text-xs font-bold text-gold-hi ring-1 ring-gold/30">{tr("Termină sesiunea (minim {focusMinMinutes} minute) și primești momentum: 1 la fiecare 2 minute, +{focusCycleBonus} pentru fiecare pomodoro terminat, maximum {focusDayCap} pe zi.", { focusMinMinutes: RULES.focusMinMinutes, focusCycleBonus: RULES.focusCycleBonus, focusDayCap: RULES.focusDayCap })}</p>
      <div role="radiogroup" aria-label={tr("Tipul sesiunii")} className="space-y-2">
        {options.map((o) => {
          const on = preset === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPreset(o.id)}
              className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition ${on ? "bg-gold/15 ring-gold" : "bg-well ring-edge hover:ring-edge-hi"}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-gold bg-gold text-on-gold" : "border-edge-hi"}`}>{on && <Check size={12} strokeWidth={4} aria-hidden="true" />}</span>
              <span className="min-w-0">
                <span className="block font-extrabold text-ink">{o.label}</span>
                <span className="block text-xs font-semibold text-dim">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      {preset === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">{tr("Lucru")}</span>
            <Select id="focus-work" value={work} onChange={setWork} options={WORK_CHOICES.map((m) => ({ value: m, label: `${m} min` }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">{tr("Pauză")}</span>
            <Select id="focus-break" value={brk} onChange={setBrk} options={BREAK_CHOICES.map((m) => ({ value: m, label: `${m} min` }))} />
          </label>
        </div>
      )}
      {pomodoro && <p className="mt-3 text-xs font-semibold text-faint">{tr("După fiecare a 4-a pauză, următoarea e de 3 ori mai lungă. După pauză, Focus așteaptă să-i dai tu Continuă.")}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ clocks

function Hand({ deg, length, tail = 0, width, color, ease, glow }) {
  return (
    <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${C}px ${C}px`, transition: ease }}>
      <line x1={C} y1={C + tail} x2={C} y2={C - length} stroke={color} strokeWidth={width} strokeLinecap="round" style={glow ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined} />
    </g>
  );
}

function Face() {
  return (
    <>
      <circle cx={C} cy={C} r="188" fill="rgb(var(--c-panel))" stroke="rgb(var(--c-edge-hi))" strokeWidth="3" />
      <circle cx={C} cy={C} r="176" fill="none" stroke="rgb(var(--c-edge))" strokeWidth="1" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        return (
          <line
            key={i}
            x1={C}
            y1={C - 170}
            x2={C}
            y2={C - (big ? 150 : 161)}
            stroke={big ? "rgb(var(--c-dim))" : "rgb(var(--c-mark))"}
            strokeWidth={big ? 3 : 1.5}
            strokeLinecap="round"
            transform={`rotate(${i * 6} ${C} ${C})`}
          />
        );
      })}
    </>
  );
}

function AnalogClock({ ms }) {
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  // angles come from cumulative counts, so they only grow; the CSS transition turns each step into a tick
  return (
    <svg viewBox="0 0 400 400" className="max-h-[calc(100dvh-17rem)] w-[min(70vmin,560px)]" aria-hidden="true">
      <Face />
      <Hand deg={min * 0.5} length={92} tail={14} width={9} color="rgb(var(--c-ink))" ease="transform 0.8s ease-out" />
      <Hand deg={min * 6} length={140} tail={16} width={6} color="rgb(var(--c-body))" ease="transform 0.45s cubic-bezier(0.34, 1.7, 0.5, 1)" />
      <Hand deg={total * 6} length={156} tail={34} width={2.5} color="rgb(var(--c-gold))" ease="transform 0.28s cubic-bezier(0.34, 1.9, 0.5, 1)" glow />
      <circle cx={C} cy={C} r="9" fill="rgb(var(--c-gold))" />
      <circle cx={C} cy={C} r="3.5" fill="rgb(var(--c-panel))" />
    </svg>
  );
}

function Digits({ value, tone }) {
  return (
    <span className="inline-flex">
      {value.split("").map((d, i) => (
        <span key={`${i}-${d}`} className={`digit-tick inline-block w-[0.62em] text-center ${tone}`}>
          {d}
        </span>
      ))}
    </span>
  );
}

function DigitalClock({ ms, dim }) {
  const t = Math.floor(ms / 1000);
  const parts = [
    { v: pad(Math.floor(t / 3600)), label: "ore", tone: "text-ink" },
    { v: pad(Math.floor((t % 3600) / 60)), label: "min", tone: "text-ink" },
    { v: pad(t % 60), label: "sec", tone: "text-gold" },
  ];
  return (
    <div className={`flex items-start gap-[1.2vmin] transition-opacity ${dim ? "opacity-60" : ""}`} aria-hidden="true">
      {parts.map((p, i) => (
        <React.Fragment key={p.label}>
          {i > 0 && <span className={`pt-[1.2vmin] text-[clamp(40px,11vmin,120px)] font-black leading-none text-dim ${dim ? "" : "colon-blink"}`}>:</span>}
          <div className="flex flex-col items-center gap-2">
            <div className="panel rounded-[2.2vmin] px-[2.4vmin] py-[1.6vmin]" style={{ boxShadow: "inset 0 -10px 24px rgb(0 0 0 / 0.08), 0 14px 34px -16px rgb(var(--c-shadow) / var(--shadow-a))" }}>
              <span className="tabular text-[clamp(56px,17vmin,190px)] font-black leading-none">
                <Digits value={p.v} tone={p.tone} />
              </span>
            </div>
            <span className="text-xs font-extrabold uppercase tracking-[0.25em] text-faint">{p.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ breaks

const TIPS = [tr("Bea un pahar cu apă."), tr("Privește pe fereastră, departe, 20 de secunde."), tr("Întinde-ți spatele și umerii."), tr("Ridică-te și fă câțiva pași."), tr("Respiră adânc de cinci ori."), tr("Lasă ochii să se odihnească de ecran.")];

function BreakScreen({ v, quoteSeed, onSkip, onEnd }) {
  const waiting = v.phase === "wait";
  const quote = pickQuote("break", null, [], quoteSeed); // one quote per break, whatever the phase
  const ratio = waiting ? 1 : v.limitMs ? 1 - v.remaining / v.limitMs : 0; // fills up as the break passes
  const R = 170;
  const circ = 2 * Math.PI * R;
  return (
    <div className="my-auto flex flex-col items-center gap-6 px-4 py-6 text-center">
      <div className="relative w-[min(48vmin,420px)]">
        <svg viewBox="0 0 400 400" className="-rotate-90" aria-hidden="true">
          <circle cx={C} cy={C} r={R} fill="rgb(var(--c-panel) / 0.6)" stroke="rgb(var(--c-edge))" strokeWidth="14" />
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="rgb(var(--c-mint))"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${ratio * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 0.3s linear", filter: "drop-shadow(0 0 10px rgb(var(--c-mint) / 0.5))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          {waiting ? (
            <>
              <span className="grid h-16 w-16 place-items-center rounded-full bg-mint text-on-mint">
                <Check size={34} strokeWidth={3.5} aria-hidden="true" />
              </span>
              <span className="text-3xl font-black text-ink">{tr("Pauza s-a terminat")}</span>
              <span className="text-sm font-semibold text-dim">{tr("Când ești gata, continui de unde ai rămas.")}</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.25em] text-mint-ink">
                <Coffee size={14} aria-hidden="true" /> {v.longBreak ? tr("Pauză lungă") : tr("Pauză")}
              </span>
              <span className="tabular text-[clamp(44px,11vmin,104px)] font-black leading-none text-ink">{fmtMinSec(v.remaining)}</span>
              <span className="max-w-[16rem] text-sm font-semibold text-dim">{TIPS[(v.cycle - 1) % TIPS.length]}</span>
            </>
          )}
        </div>
      </div>
      <figure className="anim-pop relative w-full max-w-xl rounded-3xl border border-gold/30 bg-gradient-to-b from-gold/10 to-transparent px-6 pb-5 pt-6 shadow-[0_18px_44px_-24px_rgb(var(--c-gold)/0.55)]">
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-night px-3 py-0.5 text-xs font-extrabold uppercase tracking-[0.2em] text-gold-ink ring-1 ring-gold/40">
          <Sparkles size={12} aria-hidden="true" />{" "}{tr("Ai ajuns până aici")}</span>
        <blockquote className="text-[clamp(1.2rem,3vmin,1.65rem)] font-bold italic leading-snug text-ink">
          <span className="text-gold" aria-hidden="true">„</span>
          {quote.text}
          <span className="text-gold" aria-hidden="true">”</span>
        </blockquote>
        <figcaption className="mt-3 flex flex-col items-center gap-0.5">
          <span className="h-px w-10 bg-gold/50" aria-hidden="true" />
          <span className="text-sm font-extrabold text-gold-ink">{quote.author}</span>
          <span className="text-xs font-semibold text-dim">{quote.source}</span>
        </figcaption>
        <p className="mt-3 text-xs font-bold text-dim">{tr("Ciclul {cycle} încheiat · {fmtSpan} de concentrare. Ai tot dreptul să fii mândru de tine.", { cycle: v.cycle, fmtSpan: fmtSpan(v.work / 1000) })}</p>
      </figure>
      <div className="flex flex-col items-center gap-2">
        {waiting ? (
          <Button size="lg" icon={Play} onClick={onSkip} data-autofocus>{tr("Continuă Focus")}</Button>
        ) : (
          <Button variant="ghost" size="md" icon={SkipForward} onClick={onSkip}>{tr("Sari peste pauză")}</Button>
        )}
        <button type="button" onClick={onEnd} className="focus-ring rounded-lg px-3 py-1.5 text-xs font-extrabold text-dim hover:text-ink">{tr("Termină sesiunea")}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ to-dos inside Focus

/** A small to-do box in the corner: tick, add, rename and delete without leaving Focus. Folds into a pill. */
function FocusTodos({ todos, today, actions }) {
  const [open, setOpen] = useState(() => !!loadPrefs().todosOpen);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null); // { id, title }
  const list = useMemo(() => todosForToday(todos, today).sort((a, b) => Number(a.done) - Number(b.done) || (a.time || "99").localeCompare(b.time || "99")), [todos, today]);
  const left = list.filter((t) => !t.done).length;
  const toggle = () => {
    setOpen((o) => {
      savePrefs({ todosOpen: !o });
      return !o;
    });
  };
  const save = () => {
    const title = editing?.title.trim().slice(0, 80);
    if (title) actions.rename(editing.id, title);
    setEditing(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="focus-ring fixed left-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl bg-panel-hi px-3 py-2 text-sm font-extrabold text-body ring-1 ring-edge transition hover:text-ink sm:left-6 sm:top-5"
        aria-expanded="false"
        aria-label={tr("Deschide to-do-urile{v}", { v: left ? tr(", {left} rămase", { left }) : "" })}
      >
        <ListTodo size={16} aria-hidden="true" />{" "}{tr("To-do")}{left > 0 && <span className="rounded-full bg-gold px-1.5 text-xs font-black text-on-gold">{left}</span>}
      </button>
    );
  }
  return (
    <div style={{ position: "fixed" }} className="panel left-4 top-4 z-10 flex max-h-[min(70vh,28rem)] w-[min(22rem,calc(100vw-5.5rem))] flex-col p-3 sm:left-6 sm:top-5" role="region" aria-label={tr("To-do-uri")}>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-dim">
          <ListTodo size={14} aria-hidden="true" />{" "}{tr("To-do azi {v}", { v: list.length > 0 && `· ${list.length - left}/${list.length}` })}</span>
        <button type="button" onClick={toggle} className="focus-ring ml-auto grid h-7 w-7 place-items-center rounded-lg text-dim hover:bg-panel-hi hover:text-ink" aria-label={tr("Închide to-do-urile")} aria-expanded="true">
          <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
        </button>
      </div>
      <form
        className="mb-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const title = text.trim().slice(0, 80);
          if (!title) return;
          actions.add({ title, date: today });
          setText("");
        }}
      >
        <input className="field !py-1.5 text-sm" value={text} maxLength={80} placeholder={tr("Adaugă un to-do…")} onChange={(e) => setText(e.target.value)} aria-label={tr("To-do nou")} />
        <Button type="submit" variant="mint" size="sm" icon={Plus} disabled={!text.trim()} aria-label={tr("Adaugă")} />
      </form>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {list.length === 0 && <li className="py-2 text-center text-xs font-semibold text-dim">{tr("Nimic pe lista de azi.")}</li>}
        {list.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-lg bg-well px-2 py-1.5 ring-1 ring-edge">
            <button
              type="button"
              aria-pressed={t.done}
              aria-label={t.done ? tr("Debifează {title}", { title: t.title }) : tr("Bifează {title}", { title: t.title })}
              onClick={() => actions.toggle(t.id, t.viewDay || today)}
              className={`focus-ring grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${t.done ? "border-mint bg-mint text-on-mint" : "border-edge-hi text-transparent hover:border-mint/70"}`}
            >
              <Check size={12} strokeWidth={4} aria-hidden="true" />
            </button>
            {editing?.id === t.id ? (
              <input
                className="field !py-0.5 text-sm"
                value={editing.title}
                maxLength={80}
                autoFocus
                onChange={(e) => setEditing({ id: t.id, title: e.target.value })}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(null);
                }}
                aria-label={tr("Redenumește to-do-ul")}
              />
            ) : (
              <>
                <button type="button" onClick={() => setEditing({ id: t.id, title: t.title })} className={`min-w-0 flex-1 truncate text-left text-sm font-bold ${t.done ? "text-faint line-through" : "text-ink"}`} title={tr("Apasă ca să-l modifici")}>
                  {t.title}
                </button>
                <button type="button" onClick={() => setEditing({ id: t.id, title: t.title })} className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label={tr("Modifică {title}", { title: t.title })}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => actions.remove(t.id)} className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint hover:text-rose" aria-label={tr("Șterge {title}", { title: t.title })}>
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ the screen

export function FocusMode({ session, onChange, onFinish, todos = [], today, todoActions }) {
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState(() => (loadPrefs().clock === "digital" ? "digital" : "analog"));
  const [confirming, setConfirming] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const ref = useRef(session);
  ref.current = session;

  // one timer; time always comes from the clock, so a slow tab never drifts
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      const r = advance(ref.current, t);
      if (r.session !== ref.current) onChange(r.session);
      r.events.forEach((e) => chime(e));
      setNow(t);
    };
    tick();
    const id = setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [onChange]);

  const v = view(session, now);
  const inBreak = v.phase !== "work";

  const primary = () => {
    const t = Date.now();
    if (ref.current.phase !== "work") onChange(continueWork(ref.current, t));
    else onChange(ref.current.paused ? resume(ref.current, t) : pause(ref.current, t));
  };
  const end = () => {
    const rec = finish(ref.current, Date.now());
    onFinish(rec);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; // Escape inside a field only cancels the edit
        if (!confirming) setConfirming(true); // while the dialog is open it closes itself on Escape
      }
      else if ((e.key === " " || e.code === "Space") && !confirming && !/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault();
        primary();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let lock = null; // keep the screen on while focusing, where the browser allows it
    navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lock?.release?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming]);

  const toggleMode = () => {
    const next = mode === "analog" ? "digital" : "analog";
    setMode(next);
    savePrefs({ clock: next });
  };

  const sessionMin = Math.floor(v.work / 60000);

  const details = (
    <>
      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.25em] text-dim">
        {v.paused ? <Pause size={14} aria-hidden="true" /> : <Timer size={14} aria-hidden="true" />} {v.paused ? tr("În pauză") : "Focus"}
        {session.pomodoro && tr(" · ciclul {cycle}", { cycle: v.cycle })}
      </span>
      {session.pomodoro && (
        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs font-bold text-dim">
            <span>{tr("Pauză în")}</span>
            <span className="tabular">{fmtMinSec(v.remaining)}</span>
          </div>
          <Bar value={v.limitMs ? v.inPhase / v.limitMs : 0} tone="mint" segmented={false} height={8} label={tr("Timp până la pauza următoare")} />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="lg" variant={v.paused ? "gold" : "ghost"} icon={v.paused ? Play : Pause} onClick={primary}>
          {v.paused ? tr("Continuă") : tr("Pauză")}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setConfirming(true)}>{tr("Termină")}</Button>
      </div>
      <span className="text-xs font-semibold text-faint">{tr("Spațiu = pauză · Esc = termină · atinge ceasul ca să-l schimbi")}</span>
    </>
  );

  return (
    <div
      // the clock centres in the space above the details at the bottom
      className={`app-bg fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto transition-[padding] duration-300 ${inBreak ? "" : detailsOpen ? "pb-52" : "pb-12"}`}
      role="dialog"
      aria-modal="true"
      aria-label={tr("Mod Focus")}
    >
      {todoActions && <FocusTodos todos={todos} today={today} actions={todoActions} />}
      <div className="fixed right-4 top-4 z-10 flex items-center gap-3 sm:right-6 sm:top-5">
        {(mode === "analog" || inBreak) && (
          <span className="tabular text-xl font-extrabold text-dim" title={tr("Timp de concentrare (ore:minute)")} aria-label={tr("Timp de concentrare: {floor} ore și {v} minute", { floor: Math.floor(sessionMin / 60), v: sessionMin % 60 })}>
            {pad(Math.floor(sessionMin / 60))}:{pad(sessionMin % 60)}
          </span>
        )}
        <button type="button" onClick={() => setConfirming(true)} className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-dim hover:bg-panel-hi hover:text-ink" aria-label={tr("Încheie sesiunea de Focus")}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {inBreak ? (
        <BreakScreen v={v} quoteSeed={`${session.id}-${v.cycle}`} onSkip={primary} onEnd={() => setConfirming(true)} />
      ) : (
        <>
          <button
            type="button"
            onClick={toggleMode}
            className={`focus-ring rounded-[2rem] p-2 transition ${v.paused ? "opacity-60" : ""}`}
            aria-label={tr("Ceas de Focus: {fmtClock}. Apasă ca să schimbi între ceasul mecanic și cel digital.", { fmtClock: fmtClock(v.work) })}
            title={tr("Apasă ca să schimbi ceasul")}
          >
            {/* a new key replays the pop-in each time the clock is switched */}
            <div key={mode} className="anim-pop">
              {mode === "analog" ? <AnalogClock ms={v.work} /> : <DigitalClock ms={v.work} dim={v.paused} />}
            </div>
          </button>

          {/* the details sit at the very bottom for both clocks, so switching the clock never moves them;
              the arrow folds them away and they stay folded when the clock is switched */}
          <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col items-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              aria-controls="focus-details"
              aria-label={detailsOpen ? tr("Ascunde detaliile") : tr("Arată detaliile")}
              title={detailsOpen ? tr("Ascunde detaliile") : tr("Arată detaliile")}
              className="focus-ring grid h-9 w-12 place-items-center rounded-xl text-dim transition hover:bg-panel-hi hover:text-ink"
            >
              <ChevronDown size={20} className={`transition-transform duration-300 ${detailsOpen ? "" : "rotate-180"}`} aria-hidden="true" />
            </button>
            <div id="focus-details" className={`grid w-full transition-[grid-template-rows] duration-300 ${detailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={detailsOpen ? undefined : ""}>
              <div className="min-h-0 overflow-hidden">
                <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 px-4 pb-2 pt-1">{details}</div>
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={tr("Încheii sesiunea?")}
        icon={Timer}
        tone="violet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>{tr("Continuă Focus")}</Button>
            <Button icon={Check} onClick={end} data-autofocus>
              {v.work >= 60000 ? tr("Termină și salvează") : tr("Termină")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-body">
          {v.work >= 60000
            ? tr("{fmtSpan} de concentrare se salvează în statistici.", { fmtSpan: fmtSpan(v.work / 1000) })
            : tr("Sesiunea are sub un minut, așa că nu se salvează în statistici.")}
        </p>
      </Modal>
    </div>
  );
}

export { newSession };
