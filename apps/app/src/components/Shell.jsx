import React, { useState } from "react";
import {
  Bell,
  CalendarDays,
  ChartLine,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Cloud,
  CloudOff,
  Egg,
  MessageSquare,
  FlaskConical,
  Flame,
  HardDrive,
  House,
  Loader2,
  ScrollText,
  Settings,
  Timer,
  Users,
} from "lucide-react";
import { Bar, LevelBadge, Ring } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { PATHS } from "../lib/catalog.js";
import { fmt12, parseHM } from "../lib/dates.js";
import { REVIVES_PER_MONTH } from "../lib/derive.js";
import { c as tc } from "../lib/themes.js";

export const NAV = [
  { id: "home", label: "Acasă", icon: House },
  { id: "habits", label: "Obiceiuri", icon: ScrollText },
  { id: "companion", label: "Molt", icon: Egg },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "plan", label: "Plan", icon: CalendarDays },
  { id: "group", label: "Grup", icon: Users },
  { id: "stats", label: "Statistici", icon: ChartLine },
  { id: "settings", label: "Setări", icon: Settings },
];

export const MOOD_LABEL = {
  sleep: "doarme",
  joy: "se bucură",
  happy: "e fericit",
  idle: "e treaz",
};

function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
        <polygon points="20,1.5 36.5,11 36.5,29 20,38.5 3.5,29 3.5,11" fill="#7a4f05" />
        <polygon points="20,5 33,12.6 33,27.4 20,35 7,27.4 7,12.6" fill="#ffc542" />
        <path d="M20 10c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-8z" fill="#ff7b47" />
        <path d="M20 19c.6 2 3 3 3 5.5a3 3 0 0 1-6 0c0-1.4.9-2.4 1.5-3.3.2.9.7 1.4 1.2 1.4 0-1.4-.2-2.4.3-3.6z" fill="#ffe08a" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="font-pixel text-xl font-bold tracking-wide text-ink">MOLTED</div>
          <div className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-gold">self-improvement RPG</div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ mode, saveStatus }) {
  if (mode === "loading") return null;
  const map = {
    cloud: { icon: Cloud, text: "Salvat în contul tău", cls: "text-mint" },
    supabase: { icon: Cloud, text: "Salvat în contul tău, sincronizat pe toate dispozitivele", cls: "text-mint" },
    local: { icon: HardDrive, text: "Salvat pe acest dispozitiv", cls: "text-sky" },
    memory: { icon: CloudOff, text: "Nu se salvează: stocare indisponibilă", cls: "text-rose" },
  };
  let m = map[mode] || map.memory;
  if (saveStatus === "saving") m = { icon: Loader2, text: "Se salvează…", cls: "text-dim anim-spin" };
  if (saveStatus === "readonly") m = { icon: CloudOff, text: "Doar vizualizare: modificările nu se salvează", cls: "text-rose" };
  if (saveStatus === "error") m = { icon: CloudOff, text: "Salvarea a eșuat. Reîncercăm la următoarea modificare.", cls: "text-rose" };
  const Icon = m.icon;
  return (
    <span title={m.text} aria-label={m.text} className="grid h-9 w-9 place-items-center">
      <Icon size={16} className={m.cls} aria-hidden="true" />
    </span>
  );
}

function Hud({ d, state, setView, onReview, unread, mode, saveStatus, now }) {
  const { level, entry, streak, revive, scheduled, doneScheduled } = d;
  const reviewMin = parseHM(state.settings?.reviewTime || "21:00");
  const reviewed = !!state.reviews?.[d.today];
  const left = reviewMin - now;
  // same as pressing "Generează raportul": go to the card on the home screen, bring it into view
  // once it has rendered, and start the report unless today's is already written
  const openReview = () => {
    setView("home");
    onReview?.();
    setTimeout(() => {
      const card = document.getElementById("review-card");
      card?.scrollIntoView({ block: "center" });
      document.getElementById("review-run")?.focus({ preventScroll: true });
      if (reviewed) window.dispatchEvent(new Event("molted:open-review"));
    }, 60);
  };
  const reviewText = reviewed ? "Raport gata" : left > 0 ? `Raport ${fmt12(state.settings?.reviewTime)}` : "E ora raportului";
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-night/85 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-8">
        <button type="button" onClick={() => setView("home")} className="focus-ring hidden rounded-lg sm:block lg:hidden" aria-label="Acasă">
          <Logo compact />
        </button>
        <button type="button" onClick={() => setView("stats")} className="focus-ring flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left" aria-label={`Momentum nivel ${level.lvl}, ${level.name}`}>
          <LevelBadge lvl={level.lvl} size={40} />
          <div className="hidden w-48 sm:block">
            <div className="flex items-baseline justify-between gap-2 text-xs font-extrabold">
              <span className="truncate text-ink">{level.name}</span>
              <span className="tabular text-dim">
                {entry?.momentum ?? 0}
                {level.next ? ` / ${level.next.min}` : ""}
              </span>
            </div>
            <Bar value={level.progress} className="mt-1" height={12} label="Progres spre nivelul următor" />
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div
            className="flex items-center gap-1.5 rounded-xl bg-well px-2.5 py-1.5 ring-1 ring-edge"
            title={`Serie de ${streak.current} ${streak.current === 1 ? "zi" : "zile"} · ${revive.left === 1 ? "1 revive rămas" : `${revive.left} revive-uri rămase`} luna aceasta`}
          >
            <Flame size={18} className={streak.todayDone ? "anim-flicker text-ember" : "text-faint"} fill={streak.todayDone ? tc("ember") : "none"} aria-hidden="true" />
            <span className="font-pixel tabular text-lg leading-none text-ink">{streak.current}</span>
            <span className="sr-only">zile la rând</span>
            <span className="ml-1 hidden items-center gap-0.5 sm:flex" aria-label={`${revive.left} revive-uri rămase`}>
              {Array.from({ length: REVIVES_PER_MONTH }, (_, i) => (
                <FlaskConical
                  key={i}
                  size={14}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className={i < revive.left ? "text-mint" : "text-faint/60"}
                  fill={i < revive.left ? tc("mint", 0.35) : "none"}
                />
              ))}
            </span>
          </div>
          <button type="button" onClick={() => setView("home")} className="focus-ring hidden items-center gap-2 rounded-xl bg-well px-2 py-1 ring-1 ring-edge sm:flex" title="Misiunile de azi">
            <Ring value={scheduled.length ? doneScheduled / scheduled.length : 0} size={30} stroke={4}>
              <span className="text-[9px] font-black text-ink">{doneScheduled}</span>
            </Ring>
            <span className="pr-1 text-xs font-extrabold text-body">
              {doneScheduled}/{scheduled.length}
            </span>
          </button>
          <button
            type="button"
            onClick={openReview}
            className="focus-ring hidden items-center gap-1.5 rounded-xl bg-well px-2.5 py-2 text-xs font-extrabold ring-1 ring-edge transition hover:bg-panel-hi md:flex"
            title="Deschide raportul zilei"
          >
            <Clock size={14} className={reviewed ? "text-mint" : left <= 0 ? "text-gold" : "text-dim"} aria-hidden="true" />
            <span className={reviewed ? "text-mint" : left <= 0 ? "text-gold" : "text-body"}>{reviewText}</span>
          </button>
          <button type="button" onClick={() => setView("group")} className="focus-ring relative grid h-9 w-9 place-items-center rounded-xl text-dim hover:bg-panel-hi hover:text-ink" aria-label={`Remindere${unread ? `: ${unread} necitite` : ""}`}>
            <Bell size={18} aria-hidden="true" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-black text-on-rose">{unread}</span>}
          </button>
          <SaveIndicator mode={mode} saveStatus={saveStatus} />
          <button type="button" onClick={() => setView("settings")} className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-dim hover:bg-panel-hi hover:text-ink lg:hidden" aria-label="Setări">
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

const SIDE_KEY = "molted.sidebar"; // "closed" when the desktop side menu is folded to icons

export function Shell({ view, setView, onReview, onFocus, d, state, unread, mode, saveStatus, now, children }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(SIDE_KEY) === "closed";
    } catch {
      return false;
    }
  });
  const toggleSide = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(SIDE_KEY, f ? "open" : "closed");
      } catch {
        /* the choice then lasts until the page closes */
      }
      return !f;
    });
  return (
    <div className="app-bg min-h-screen text-body">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-edge bg-deep/95 pb-4 pt-5 transition-[width] duration-200 lg:flex ${folded ? "w-[76px] px-3" : "w-64 px-4"}`}>
        <button
          type="button"
          onClick={toggleSide}
          className="focus-ring absolute -right-3.5 top-7 z-10 grid h-7 w-7 place-items-center rounded-full border border-edge-hi bg-panel-hi text-dim shadow transition hover:text-ink"
          aria-label={folded ? "Deschide meniul" : "Închide meniul"}
          aria-expanded={!folded}
          title={folded ? "Deschide meniul" : "Închide meniul"}
        >
          {folded ? <ChevronsRight size={14} aria-hidden="true" /> : <ChevronsLeft size={14} aria-hidden="true" />}
        </button>
        <div className={folded ? "flex justify-center" : ""}>
          <button type="button" onClick={() => setView("home")} className="focus-ring rounded-lg text-left" aria-label="Acasă" title={folded ? "Acasă" : undefined}>
            <Logo compact={folded} />
          </button>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Navigare">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id)}
                aria-current={view === n.id ? "page" : undefined}
                aria-label={folded ? n.label : undefined}
                title={folded ? n.label : undefined}
                className={`nav-item focus-ring relative ${folded ? "justify-center px-0" : ""}`}
              >
                <Icon size={19} strokeWidth={2.25} aria-hidden="true" />
                {!folded && <span>{n.label}</span>}
                {n.id === "group" && unread > 0 && (folded ? <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose" /> : <span className="ml-auto rounded-full bg-rose px-1.5 text-[11px] font-black text-on-rose">{unread}</span>)}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onFocus}
          aria-label={folded ? "Focus" : undefined}
          title={folded ? "Focus" : undefined}
          className={`nav-item focus-ring mt-4 ring-1 ring-edge ${folded ? "justify-center px-0" : ""}`}
        >
          <Timer size={19} strokeWidth={2.25} aria-hidden="true" />
          {!folded && <span>Focus</span>}
        </button>
        <button
          type="button"
          onClick={() => setView("companion")}
          aria-label={folded ? c.name || "Oul tău" : undefined}
          title={folded ? c.name || "Oul tău" : undefined}
          className={`panel panel-violet focus-ring mt-auto flex items-center text-left transition hover:brightness-110 ${folded ? "justify-center p-1.5" : "gap-3 p-3"}`}
        >
          <span className={`pedestal grid shrink-0 place-items-center rounded-xl ${folded ? "h-12 w-12" : "h-16 w-16"}`}>
            <Sprite path={path} stage={c.stage.id} mood={c.mood} size={folded ? 48 : 64} crack={eggCrack(c.ep)} />
          </span>
          <span className={`min-w-0 ${folded ? "hidden" : ""}`}>
            <span className="block truncate font-pixel text-base text-ink">{c.name || "Oul tău"}</span>
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-violet-hi">
              {c.stage.name} · {PATHS[path]?.cls}
            </span>
            <span className="block text-xs font-semibold text-dim">{c.stage.id === "egg" ? "așteaptă bifări" : MOOD_LABEL[c.mood]}</span>
          </span>
        </button>
      </aside>

      <div className={`transition-[padding] duration-200 ${folded ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <Hud d={d} state={state} setView={setView} onReview={onReview} unread={unread} mode={mode} saveStatus={saveStatus} now={now} />
        <main className="mx-auto max-w-[1240px] px-3 pb-28 pt-5 sm:px-4 lg:px-8 lg:pb-12 lg:pt-7">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-8 border-t border-edge bg-deep/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navigare"
      >
        {NAV.filter((n) => n.id !== "settings").map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className="tabbar-item focus-ring relative flex min-w-0 flex-col items-center gap-0.5 py-2 text-[10px] font-extrabold text-dim"
            >
              <Icon size={20} strokeWidth={2.25} aria-hidden="true" />
              {n.label}
              {n.id === "group" && unread > 0 && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-rose" />}
            </button>
          );
        })}
        <button type="button" onClick={onFocus} className="focus-ring flex flex-col items-center gap-0.5 py-2 text-[10px] font-extrabold text-violet-hi">
          <Timer size={20} strokeWidth={2.25} aria-hidden="true" />
          Focus
        </button>
      </nav>
    </div>
  );
}
