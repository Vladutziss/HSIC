import React from "react";
import {
  CalendarDays,
  ChartLine,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  CloudOff,
  Egg,
  Flame,
  HardDrive,
  House,
  Loader2,
  Moon,
  Sparkles,
  Timer,
  User,
} from "lucide-react";
import { Bar, LevelBadge } from "./ui.jsx";
import { useAiJobs } from "./AiCoach.jsx";
import { parseHM } from "../lib/dates.js";
import { c as tc } from "../lib/themes.js";
import { usePref } from "../lib/prefs.js";
import { tr } from "../lib/i18n.js";

// Five places. `also`: other views that belong to the same place (Obiective and Obiceiuri are parts of Plan, Grup is
// part of Tu). `ai`: the place where the AI features live, drawn to stand out.
export const NAV = [
  { id: "home", label: tr("Acasă"), icon: House },
  { id: "plan", label: tr("Plan"), icon: CalendarDays, also: ["goals", "habits"] },
  { id: "molt", label: tr("Molt"), icon: Egg, ai: true },
  { id: "stats", label: tr("Progres"), icon: ChartLine },
  { id: "settings", label: tr("Tu"), icon: User, also: ["group"] },
];
const isHere = (n, view) => view === n.id || !!n.also?.includes(view);

// the gradient behind the AI entry follows the finger or the mouse when it is pressed (the CSS reads --x and --y)
const aim = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
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
  // saved is the normal state and needs no icon: it appears while saving and when something is wrong
  const problem = saveStatus === "saving" || saveStatus === "readonly" || saveStatus === "error" || mode === "memory";
  if (!problem) return null;
  const map = {
    cloud: { icon: Cloud, text: tr("Salvat în contul tău"), cls: "text-mint" },
    supabase: { icon: Cloud, text: tr("Salvat în contul tău, sincronizat pe toate dispozitivele"), cls: "text-mint" },
    local: { icon: HardDrive, text: tr("Salvat pe acest dispozitiv"), cls: "text-sky" },
    memory: { icon: CloudOff, text: tr("Nu se salvează: stocare indisponibilă"), cls: "text-rose" },
  };
  let m = map[mode] || map.memory;
  if (saveStatus === "saving") m = { icon: Loader2, text: tr("Se salvează…"), cls: "text-dim anim-spin" };
  if (saveStatus === "readonly") m = { icon: CloudOff, text: tr("Doar vizualizare: modificările nu se salvează"), cls: "text-rose" };
  if (saveStatus === "error") m = { icon: CloudOff, text: tr("Salvarea a eșuat. Reîncercăm la următoarea modificare."), cls: "text-rose" };
  const Icon = m.icon;
  return (
    <span title={m.text} aria-label={m.text} className="grid h-9 w-9 place-items-center">
      <Icon size={16} className={m.cls} aria-hidden="true" />
    </span>
  );
}

function Hud({ d, setView, mode, saveStatus }) {
  const { level, entry, streak } = d;
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-night/85 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-8">
        <button type="button" onClick={() => setView("home")} className="focus-ring hidden rounded-lg sm:block lg:hidden" aria-label={tr("Acasă")}>
          <Logo compact />
        </button>
        <button type="button" onClick={() => setView("stats")} className="focus-ring flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left" aria-label={tr("Momentum nivel {lvl}, {name}", { lvl: level.lvl, name: level.name })}>
          <LevelBadge lvl={level.lvl} size={36} />
          <div className="hidden w-40 sm:block">
            <div className="flex items-baseline justify-between gap-2 text-xs font-extrabold">
              <span className="truncate text-ink">{level.name}</span>
              <span className="tabular text-dim">
                {entry?.momentum ?? 0}
                {level.next ? ` / ${level.next.min}` : ""}
              </span>
            </div>
            <Bar value={level.progress} className="mt-1" height={10} label={tr("Progres spre nivelul următor")} />
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="flex items-center gap-1.5 px-1.5" title={tr("Serie de {current} {v}", { current: streak.current, v: streak.current === 1 ? tr("zi") : tr("zile") })}>
            <Flame size={18} className={streak.todayDone ? "anim-flicker text-ember" : "text-faint"} fill={streak.todayDone ? tc("ember") : "none"} aria-hidden="true" />
            <span className="font-pixel tabular text-lg leading-none text-ink">{streak.current}</span>
            <span className="sr-only">{tr("zile la rând")}</span>
          </span>
          <SaveIndicator mode={mode} saveStatus={saveStatus} />
        </div>
      </div>
    </header>
  );
}

export function Shell({ view, setView, onFocus, d, state, unread, goalsDue = 0, mode, saveStatus, now, children }) {
  const jobs = useAiJobs(); // Molt is thinking / has an answer waiting (shown on its menu item)
  const aiThinking = jobs.busy.length > 0;
  const aiWaiting = !aiThinking && jobs.ready.length > 0;
  // the evening report is waiting: its time has come and today's is not written yet (Acasă shows a badge, like Grup)
  const reviewDue = now >= parseHM(state.settings?.reviewTime || "21:00") && !state.reviews?.[d.today];
  // the Acasă badge comes from the "Raportul zilei" card: opening Acasă while it is due takes you to that card and
  // makes it flash once, so the badge and the card read as one thing
  const openNav = (id) => {
    setView(id);
    if (id !== "home" || !reviewDue) return;
    setTimeout(() => {
      const card = document.getElementById("review-card");
      if (!card) return;
      card.scrollIntoView({ block: "center" });
      card.classList.remove("review-ping");
      void card.offsetWidth; // restart the animation when it was already played
      card.classList.add("review-ping");
      setTimeout(() => card.classList.remove("review-ping"), 2600);
    }, 60);
  };
  // folded or not is the player's choice, kept with the account (see lib/prefs.js)
  const [side, setSide] = usePref("sidebar", "open");
  const folded = side === "closed";
  const toggleSide = () => setSide(folded ? "open" : "closed");
  return (
    <div className="app-bg min-h-screen text-body">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-edge bg-deep/95 pb-4 pt-5 transition-[width] duration-200 lg:flex ${folded ? "w-[76px] px-3" : "w-64 px-4"}`}>
        <button
          type="button"
          onClick={toggleSide}
          className="focus-ring absolute -right-3.5 top-7 z-10 grid h-7 w-7 place-items-center rounded-full border border-edge-hi bg-panel-hi text-dim shadow transition hover:text-ink"
          aria-label={folded ? tr("Deschide meniul") : tr("Închide meniul")}
          aria-expanded={!folded}
          title={folded ? tr("Deschide meniul") : tr("Închide meniul")}
        >
          {folded ? <ChevronsRight size={14} aria-hidden="true" /> : <ChevronsLeft size={14} aria-hidden="true" />}
        </button>
        <div className={folded ? "flex justify-center" : ""}>
          <button type="button" onClick={() => setView("home")} className="focus-ring rounded-lg text-left" aria-label={tr("Acasă")} title={folded ? tr("Acasă") : undefined}>
            <Logo compact={folded} />
          </button>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label={tr("Navigare")}>
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openNav(n.id)}
                aria-current={isHere(n, view) ? "page" : undefined}
                aria-label={folded ? n.label : undefined}
                title={folded ? n.label : undefined}
                onPointerDown={n.ai ? aim : undefined}
                className={`nav-item focus-ring relative ${folded ? "justify-center px-0" : ""} ${n.ai ? "nav-ai" : ""}`}
              >
                <Icon size={19} strokeWidth={2.25} aria-hidden="true" />
                {!folded && <span>{n.label}</span>}
                {n.ai && !folded && (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-violet/30 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-violet-hi">
                    <Sparkles size={10} strokeWidth={3} aria-hidden="true" />{" "}{tr("AI")}</span>
                )}
                {n.id === "molt" && aiThinking && <Loader2 size={14} className="anim-spin text-violet-hi" role="img" aria-label={tr("Molt se gândește…")} />}
                {n.id === "molt" && aiWaiting && <span className="h-2.5 w-2.5 rounded-full bg-mint" role="img" aria-label={tr("Molt are un răspuns pentru tine")} title={tr("Molt are un răspuns pentru tine")} />}
                {n.id === "plan" && goalsDue > 0 && (folded ? <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-ember" /> : <span className="ml-auto rounded-full bg-ember px-1.5 text-[11px] font-black text-night">{goalsDue}</span>)}
                {n.id === "home" && reviewDue && (folded ? <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose" /> : <span className="ml-auto grid h-5 w-5 place-items-center rounded-full bg-rose text-on-rose" title={tr("Raportul zilei te așteaptă")} role="img" aria-label={tr("Raportul zilei te așteaptă")}><Moon size={11} strokeWidth={3} aria-hidden="true" /></span>)}
                {n.id === "settings" && unread > 0 && (folded ? <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose" /> : <span className="ml-auto rounded-full bg-rose px-1.5 text-[11px] font-black text-on-rose">{unread}</span>)}
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
      </aside>

      <div className={`transition-[padding] duration-200 ${folded ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <Hud d={d} setView={setView} mode={mode} saveStatus={saveStatus} />
        <main className="mx-auto max-w-[1240px] px-3 pb-28 pt-5 sm:px-4 lg:px-8 lg:pb-12 lg:pt-7">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-edge bg-deep/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label={tr("Navigare")}
      >
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => openNav(n.id)}
              aria-current={isHere(n, view) ? "page" : undefined}
              onPointerDown={n.ai ? aim : undefined}
              className={`tabbar-item focus-ring relative flex min-w-0 flex-col items-center gap-0.5 py-2 text-[10px] font-extrabold ${n.ai ? "nav-ai mx-0.5 my-1 rounded-xl text-violet-hi" : "text-dim"}`}
            >
              <Icon size={20} strokeWidth={2.25} aria-hidden="true" />
              <span className="max-w-full truncate px-0.5">{n.short || n.label}</span>
              {n.id === "molt" && (aiThinking || aiWaiting) && <span className={`absolute right-[22%] top-1 h-2 w-2 rounded-full ${aiThinking ? "animate-pulse bg-violet-hi" : "bg-mint"}`} aria-label={aiThinking ? tr("Molt se gândește…") : tr("Molt are un răspuns pentru tine")} />}
              {n.id === "plan" && goalsDue > 0 && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-ember" />}
              {n.id === "home" && reviewDue && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-rose" aria-label={tr("Raportul zilei te așteaptă")} />}
              {n.id === "settings" && unread > 0 && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-rose" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
