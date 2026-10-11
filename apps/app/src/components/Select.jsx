// Themed replacements for <select>, <input type="time"> and <input type="date">.
// The browser's own pop-ups ignore the app's colours, so these draw their own.
// The menu is portalled to <body> with fixed positioning, so modals with overflow don't clip it.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { RO_DAYS_MIN, RO_DAYS_SHORT, RO_MONTHS, addDays, dayKey, fmt12, fmtDay, fmtLong, mondayOf, parseDay, parseHM, todayKey } from "../lib/dates.js";

const pad = (n) => String(n).padStart(2, "0");

function usePopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchor = useRef(null);
  const menu = useRef(null);

  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const h = menu.current?.offsetHeight || 0;
    const below = window.innerHeight - r.bottom;
    const up = h && below < h + 12 && r.top > below;
    setPos({ left: r.left, width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onDown = (e) => {
      if (!anchor.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) anchor.current?.focus();
  }, []);

  return { open, setOpen, close, pos, anchor, menu };
}

function Menu({ pop, minWidth = 0, className = "", children, ...rest }) {
  if (!pop.open) return null;
  const { left, width, top, bottom } = pop.pos || {};
  const w = Math.max(width || 0, minWidth);
  const x = Math.max(8, Math.min(left || 0, window.innerWidth - w - 8));
  return createPortal(
    <div
      ref={pop.menu}
      className={`panel anim-slide z-[80] p-1.5 ${className}`}
      style={{ position: "fixed", left: x, width: w, top, bottom, visibility: pop.pos ? "visible" : "hidden" }}
      onKeyDown={(e) => {
        // preventDefault tells the modal underneath that this Escape is taken
        if (e.key === "Escape") {
          e.preventDefault();
          pop.close();
        }
        if (e.key === "Tab") pop.close(false);
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body
  );
}

function Trigger({ pop, id, disabled, icon: Icon, placeholder, children, className = "" }) {
  return (
    <button
      ref={pop.anchor}
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={pop.open}
      onClick={() => pop.setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          pop.setOpen(true);
        }
        if (e.key === "Escape" && pop.open) {
          e.preventDefault();
          pop.close();
        }
      }}
      className={`field flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${pop.open ? "border-gold-ink" : ""} ${className}`}
    >
      {Icon && <Icon size={16} className="shrink-0 text-dim" aria-hidden="true" />}
      <span className={`min-w-0 flex-1 truncate ${children == null ? "text-faint" : ""}`}>{children ?? placeholder}</span>
      <ChevronDown size={16} className={`shrink-0 text-dim transition ${pop.open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

const optionCls = (on) =>
  `focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold outline-none transition ${
    on ? "bg-gold text-on-gold" : "text-body hover:bg-violet/10 hover:text-ink focus:bg-violet/10 focus:text-ink"
  }`;

/** Moves focus between the [data-opt] buttons of a menu with the arrow keys. */
function arrowNav(e, cols = 1) {
  const step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: cols > 1 ? 1 : 0, ArrowLeft: cols > 1 ? -1 : 0 }[e.key];
  const list = [...e.currentTarget.querySelectorAll("[data-opt]:not(:disabled)")];
  const i = list.indexOf(document.activeElement);
  let next = null;
  if (step) next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + step))];
  if (e.key === "Home") next = list[0];
  if (e.key === "End") next = list[list.length - 1];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

/** focuses the selected option (or the first) when a menu opens */
function useFocusOnOpen(pop, selector = '[aria-selected="true"]') {
  useEffect(() => {
    if (!pop.open) return;
    const t = requestAnimationFrame(() => {
      const m = pop.menu.current;
      const el = m?.querySelector(selector) || m?.querySelector("[data-opt]");
      el?.focus();
      el?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(t);
  }, [pop.open]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ------------------------------------------------------------ Select

/** options: [{ value, label }] */
export function Select({ id, value, onChange, options, disabled, placeholder = "Alege…", className = "" }) {
  const pop = usePopover();
  useFocusOnOpen(pop);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Trigger pop={pop} id={id} disabled={disabled} placeholder={placeholder} className={className}>
        {current?.label}
      </Trigger>
      <Menu pop={pop} role="listbox" aria-labelledby={id} className="max-h-72 overflow-y-auto" onKeyDownCapture={arrowNav}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={on}
              data-opt
              className={optionCls(on)}
              onClick={() => {
                onChange(o.value);
                pop.close();
              }}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {on && <Check size={15} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </Menu>
    </>
  );
}

// ------------------------------------------------------------ TimeSelect

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/** value: "HH:MM" (24-hour, as stored) or null. Picked as hour 1-12, minute (5-minute steps) and AM/PM. */
export function TimeSelect({ id, value, onChange, disabled, clearable = true, placeholder = "--:-- --" }) {
  const pop = usePopover();
  useFocusOnOpen(pop);
  const min = value ? parseHM(value) : null;
  const h24 = min == null ? null : Math.floor(min / 60) % 24;
  const sel = { h: h24 == null ? null : String(h24 % 12 || 12), m: min == null ? null : pad(min % 60), pm: h24 == null ? null : h24 >= 12 };
  // an empty field starts from 9:00 AM; each pick changes one part and keeps the others
  const pick = (part) => {
    const h = Number(part.h ?? sel.h ?? 9);
    const pm = part.pm ?? sel.pm ?? false;
    onChange(`${pad((h % 12) + (pm ? 12 : 0))}:${part.m ?? sel.m ?? "00"}`);
  };
  // bring the selected hour and minute into view, not just the focused cell
  useEffect(() => {
    if (!pop.open) return undefined;
    const t = requestAnimationFrame(() => pop.menu.current?.querySelectorAll('[role="option"][aria-selected="true"]').forEach((el) => el.scrollIntoView({ block: "center" })));
    return () => cancelAnimationFrame(t);
  }, [pop.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const col = (items, selected, onPick, label, extra = "") => (
    <div role="listbox" aria-label={label} className={`no-scrollbar max-h-56 flex-1 overflow-y-auto ${extra}`} onKeyDownCapture={arrowNav}>
      {items.map((x) => (
        <button key={x} type="button" role="option" aria-selected={x === selected} data-opt className={`${optionCls(x === selected)} justify-center tabular`} onClick={() => onPick(x)}>
          {x}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <Trigger pop={pop} id={id} disabled={disabled} icon={Clock} placeholder={placeholder}>
        {value ? fmt12(value) : null}
      </Trigger>
      <Menu pop={pop} minWidth={236} aria-label="Alege ora">
        <div className="mb-1 grid grid-cols-3 px-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-dim">
          <span>Ora</span>
          <span>Minut</span>
          <span>AM / PM</span>
        </div>
        <div className="flex gap-1.5">
          {col(HOURS, sel.h, (x) => pick({ h: x }), "Ora")}
          {col(MINUTES, sel.m, (x) => pick({ m: x }), "Minut")}
          {col(["AM", "PM"], sel.pm == null ? null : sel.pm ? "PM" : "AM", (x) => pick({ pm: x === "PM" }), "AM sau PM", "!max-h-none")}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <button type="button" className="focus-ring flex-1 rounded-lg bg-gold py-1.5 text-xs font-extrabold text-on-gold" onClick={() => pop.close()}>
            Gata
          </button>
          {clearable && value && (
            <button
              type="button"
              className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-extrabold text-dim hover:bg-violet/10 hover:text-ink"
              onClick={() => {
                onChange(null);
                pop.close();
              }}
            >
              <X size={13} aria-hidden="true" /> Fără oră
            </button>
          )}
        </div>
      </Menu>
    </>
  );
}

// ------------------------------------------------------------ DateSelect

/** value: "YYYY-MM-DD" or null. A month grid starting on Monday. */
export function DateSelect({ id, value, onChange, disabled, clearable = true, placeholder = "Fără dată" }) {
  const pop = usePopover();
  const today = todayKey();
  const [month, setMonth] = useState((value || today).slice(0, 7));
  useEffect(() => {
    if (pop.open) setMonth((value || today).slice(0, 7));
  }, [pop.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusOnOpen(pop, '[aria-selected="true"], [data-today]');

  const first = `${month}-01`;
  const start = mondayOf(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shift = (n) => {
    const d = parseDay(first);
    d.setMonth(d.getMonth() + n);
    setMonth(dayKey(d).slice(0, 7));
  };
  const [y, mo] = month.split("-").map(Number);
  const choose = (k) => {
    onChange(k);
    pop.close();
  };

  return (
    <>
      <Trigger pop={pop} id={id} disabled={disabled} icon={CalendarDays} placeholder={placeholder}>
        {value ? `${RO_DAYS_SHORT[parseDay(value).getDay()]}, ${fmtDay(value)}` : null}
      </Trigger>
      <Menu pop={pop} minWidth={272} aria-label="Alege ziua" className="p-2.5">
        <div className="mb-2 flex items-center gap-1">
          <button type="button" aria-label="Luna trecută" className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-violet/10 hover:text-ink" onClick={() => shift(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <div className="flex-1 text-center font-pixel text-base capitalize text-ink">
            {RO_MONTHS[mo - 1]} {y}
          </div>
          <button type="button" aria-label="Luna viitoare" className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-violet/10 hover:text-ink" onClick={() => shift(1)}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-extrabold uppercase text-dim">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <span key={d} className="py-1">
              {RO_DAYS_MIN[d]}
            </span>
          ))}
        </div>
        <div role="grid" className="grid grid-cols-7 gap-0.5" onKeyDownCapture={(e) => arrowNav(e, 7)}>
          {days.map((k) => {
            const on = k === value;
            const isToday = k === today;
            const out = k.slice(0, 7) !== month;
            return (
              <button
                key={k}
                type="button"
                data-opt
                data-today={isToday || undefined}
                aria-selected={on}
                aria-label={fmtLong(k)}
                onClick={() => choose(k)}
                className={`focus-ring tabular grid h-9 place-items-center rounded-lg text-sm font-bold outline-none transition ${
                  on
                    ? "bg-gold text-on-gold shadow-key-gold-sm"
                    : `${out ? "text-faint" : "text-body"} hover:bg-violet/10 hover:text-ink focus:bg-violet/10 ${isToday ? "ring-1 ring-gold-ink" : ""}`
                }`}
              >
                {Number(k.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5 border-t border-edge pt-2">
          <button type="button" className="focus-ring flex-1 rounded-lg py-1.5 text-xs font-extrabold text-gold hover:bg-gold/10" onClick={() => choose(today)}>
            Azi
          </button>
          {clearable && value && (
            <button
              type="button"
              className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-extrabold text-dim hover:bg-violet/10 hover:text-ink"
              onClick={() => choose(null)}
            >
              <X size={13} aria-hidden="true" /> Fără dată
            </button>
          )}
        </div>
      </Menu>
    </>
  );
}
