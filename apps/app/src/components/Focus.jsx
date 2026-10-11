// Focus mode: the whole screen becomes one big clock that counts up from the moment it was opened.
// Hour, minute and second hands show the time elapsed (not the time of day); the small hh:mm in the
// corner is the same elapsed time in the classic form. Hands only ever turn forward, so the
// hour/minute/second wraps do not spin them backwards.

import React, { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";
import { Button } from "./ui.jsx";

const KEY = "molted.focusStart"; // survives a reload, so a refresh does not reset the session

export function readFocusStart() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 && v <= Date.now() ? v : null;
  } catch {
    return null;
  }
}
export function saveFocusStart(ms) {
  try {
    if (ms) localStorage.setItem(KEY, String(ms));
    else localStorage.removeItem(KEY);
  } catch {
    /* the session then just does not survive a reload */
  }
}

const pad = (n) => String(n).padStart(2, "0");
const C = 200; // centre of the 400 x 400 face

function useElapsedSeconds(start) {
  const [secs, setSecs] = useState(() => Math.floor((Date.now() - start) / 1000));
  useEffect(() => {
    const tick = () => setSecs((s) => {
      const next = Math.floor((Date.now() - start) / 1000);
      return next === s ? s : next;
    });
    tick();
    const t = setInterval(tick, 200); // computed from the clock each time, so it never drifts
    return () => clearInterval(t);
  }, [start]);
  return secs;
}

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

export function FocusMode({ start, onExit }) {
  const total = useElapsedSeconds(start);
  const min = Math.floor(total / 60);
  const h = Math.floor(min / 60);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // keep the screen on while focusing, where the browser allows it
    let lock = null;
    navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lock?.release?.().catch(() => {});
    };
  }, [onExit]);

  // angles from cumulative counts, so they only grow; the CSS transition turns each step into a tick
  const secDeg = total * 6;
  const minDeg = min * 6;
  const hourDeg = min * 0.5;
  const tickEase = "transform 0.28s cubic-bezier(0.34, 1.9, 0.5, 1)"; // a small overshoot, like a mechanical tick
  const minEase = "transform 0.45s cubic-bezier(0.34, 1.7, 0.5, 1)";
  const hourEase = "transform 0.8s ease-out";

  return (
    <div className="app-bg fixed inset-0 z-[60] flex flex-col items-center justify-center" role="dialog" aria-modal="true" aria-label="Mod Focus">
      <div className="absolute right-4 top-4 flex items-center gap-3 sm:right-6 sm:top-5">
        <span className="font-pixel tabular text-xl text-dim" title="Timp trecut (ore:minute)" aria-label={`Timp trecut: ${h} ore și ${min % 60} minute`}>
          {pad(h)}:{pad(min % 60)}
        </span>
        <button type="button" onClick={onExit} className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-dim hover:bg-panel-hi hover:text-ink" aria-label="Ieși din Focus">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <svg viewBox="0 0 400 400" className="w-[min(78vmin,620px)]" role="img" aria-label="Ceas care numără timpul de când ai început Focus">
        <Face />
        <Hand deg={hourDeg} length={92} tail={14} width={9} color="rgb(var(--c-ink))" ease={hourEase} />
        <Hand deg={minDeg} length={140} tail={16} width={6} color="rgb(var(--c-body))" ease={minEase} />
        <Hand deg={secDeg} length={156} tail={34} width={2.5} color="rgb(var(--c-gold))" ease={tickEase} glow />
        <circle cx={C} cy={C} r="9" fill="rgb(var(--c-gold))" />
        <circle cx={C} cy={C} r="3.5" fill="rgb(var(--c-panel))" />
      </svg>

      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.25em] text-dim">
          <Timer size={14} aria-hidden="true" /> Focus
        </span>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Termină sesiunea
        </Button>
        <span className="text-[11px] font-semibold text-faint">sau apasă Esc</span>
      </div>
    </div>
  );
}
