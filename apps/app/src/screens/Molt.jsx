// Molt: the player's own character, and the place where every AI feature lives. The character is the assistant: it knows
// the habits, to-dos, goals and notes, talks (Chat), makes plans and analyses, keeps what it was told (Ce știe Molt) and
// grows (Evoluție).
//
// One screen, no long scroll: Molt and the list of what it can do sit on the left, and the chosen ability opens in a
// single workbench on the right, styled as Molt speaking (its tail points at the character). Inside it the question,
// the action button and the answer are one block, so nothing needs hunting for.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, CalendarCheck, CalendarRange, Check, Egg, History, Lock, MessageSquare, NotebookPen, Pencil, Shirt, Sparkles, Target, Wand2 } from "lucide-react";
import { Bar, Button, Chip, Panel } from "../components/ui.jsx";
import { Sprite, eggCrack } from "../components/Sprite.jsx";
import { moodLine } from "../components/Cards.jsx";
import { AgentLog } from "../components/AgentLog.jsx";
import { ExperimentsPanel, NotesPanel, PlanPanel } from "../components/CoachAgent.jsx";
import { InsightsPanel, ReflectionPanel } from "../components/AiCoach.jsx";
import { DailyPlanPanel, GoalDecomposer, HomeworkPanel } from "./Planner.jsx";
import { pendingConfirm } from "../lib/agentActions.js";
import { PATHS } from "../lib/catalog.js";
import Chat from "./Chat.jsx";
import Companion from "./Companion.jsx";
import Wardrobe from "./Wardrobe.jsx";

// `group` heads a run of abilities in the list; `say` is the line Molt speaks at the top of the workbench.
// `ai`: needs the server (signed-in). The order here is the order in the list.
const SKILLS = [
  { id: "chat", label: "Vorbește", icon: MessageSquare, ai: true, title: (n) => `Vorbește cu ${n}`, say: "Întreabă-mă orice despre școală, obiective și rutină. Îți fac planuri pe care le aplici dintr-un click." },
  { id: "day", label: "Planul zilei", icon: Sparkles, group: "Planifică", ai: true, title: () => "Planul zilei", say: "Spune-mi cât timp și câtă energie ai, iar eu aleg pașii potriviți din ce ai deja programat." },
  { id: "school", label: "Teme și examene", icon: CalendarCheck, group: "Planifică", ai: true, title: () => "Teme și examene", say: "Scrie-mi ce ai de făcut, de exemplu „Test la mate vineri”, și le fac pași pe care îi poți planifica." },
  { id: "week", label: "Planul săptămânii", icon: CalendarRange, group: "Planifică", ai: true, title: () => "Planul săptămânii", say: "Citesc bifările tale, notele și cercetarea, apoi îți propun pașii pentru săptămâna viitoare." },
  { id: "goal", label: "Scop în pași", icon: Target, group: "Planifică", ai: true, title: () => "Scop în pași", say: "Dă-mi un scop mare și îl tai în pași mici, cu termene. Îi salvezi în Plan, la Obiective." },
  { id: "mirror", label: "Reflecție", icon: BookOpen, group: "Înțelege", ai: true, title: () => "Reflecția săptămânii", say: "Cum a fost săptămâna? Spune-mi ce te-a ajutat sau ce te-a blocat și îți propun un singur pas." },
  { id: "patterns", label: "Tipare", icon: Wand2, group: "Înțelege", ai: true, title: () => "Ce observ la tine", say: "Mă uit la ultimele 4 săptămâni de bifări și îți spun ce tipare văd." },
  { id: "wardrobe", label: "Garderobă", icon: Shirt, group: "Molt", title: () => "Garderoba mea", say: "Ce port arată ce ai făcut. Alege ce îți place și vezi ce mai pot câștiga." },
  { id: "memory", label: "Ce știe Molt", icon: NotebookPen, group: "Molt", title: () => "Ce știu despre tine", say: "Ce-mi spui aici rămâne la mine și îmi ghidează sfaturile: examene, restricții, preferințe." },
  { id: "log", label: "Ce a făcut Molt", icon: History, group: "Molt", ai: true, title: () => "Ce am făcut", say: "Tot ce ți-am propus sau am făcut, cu efectul măsurat și opțiunea de a anula." },
  { id: "evolution", label: "Evoluție", icon: Egg, group: "Molt", title: () => "Evoluția mea", say: "Cresc odată cu obiceiurile pe care le bifezi: fiecare bifă aduce 1, 2 sau 3 puncte de evoluție, după dificultate." },
];

const ALIAS = { ai: "day" }; // the old "Ajutor AI" tab, still reachable from other screens
export const MOLT_TABS = [...SKILLS.map((s) => s.id), ...Object.keys(ALIAS)];

const WIDE = "(min-width: 1024px)";
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function MoltCard({ state, d, ai, wide, waiting, onWaiting, onRename }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const p = PATHS[path];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name || "");
  const label = c.name || "Moltul tău";
  return (
    <Panel tone="violet" corners className="overflow-hidden">
      <div className="flex items-center gap-3 p-3 lg:flex-col lg:items-stretch lg:gap-0 lg:p-0">
        <div className="pedestal flex h-[84px] w-[84px] shrink-0 items-end justify-center rounded-xl lg:h-auto lg:w-auto lg:rounded-none lg:px-6 lg:pt-4">
          <Sprite path={path} stage={c.stage.id} mood={c.mood} size={wide ? 128 : 64} crack={eggCrack(c.ep)} look={c.look} label={`${label}, ${c.stage.name}`} />
        </div>
        <div className="min-w-0 flex-1 space-y-2 lg:p-4 lg:pt-3">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onRename(name.trim().slice(0, 20));
                setRenaming(false);
              }}
            >
              <input className="field" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="Numele personajului" autoFocus />
              <Button type="submit" size="sm" icon={Check} aria-label="Salvează numele" />
            </form>
          ) : (
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="truncate font-pixel text-2xl leading-tight text-ink lg:text-3xl">{label}</h1>
                {c.stage.id !== "egg" && (
                  <button type="button" onClick={() => setRenaming(true)} className="focus-ring shrink-0 rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink" aria-label="Redenumește">
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="text-sm font-extrabold text-violet-hi">
                {c.stage.name} · {p.cls}
              </p>
            </div>
          )}
          <p className="hidden text-sm font-semibold leading-snug text-body lg:block">{moodLine(c, c.name)}</p>
          {c.next ? (
            <div>
              <Bar value={c.progress} tone="violet" label="Progres spre evoluția următoare" />
              <p className="mt-1 flex justify-between gap-2 text-[11px] font-extrabold text-dim">
                <span className="truncate">Spre {c.next.name}</span>
                <span className="tabular shrink-0">
                  {c.ep} / {c.next.min} PE
                </span>
              </p>
            </div>
          ) : (
            <Chip tone="gold" icon={Sparkles}>
              Evoluție completă
            </Chip>
          )}
          {!ai?.server && (
            <Chip tone="dim" icon={Bot}>
              AI indisponibil aici
            </Chip>
          )}
          {waiting > 0 && (
            <button type="button" onClick={onWaiting} className="focus-ring flex w-full items-center gap-2 rounded-xl bg-gold/15 px-2.5 py-1.5 text-left text-xs font-extrabold text-ink ring-1 ring-gold/40 hover:bg-gold/20">
              <Sparkles size={14} className="shrink-0 text-gold-ink" aria-hidden="true" />
              Molt așteaptă {waiting} {waiting === 1 ? "propunere" : "propuneri"}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

// The list of abilities: a column beside the workbench on wide screens, a strip you swipe on phones.
function SkillNav({ active, setTab, wide, waiting, locked }) {
  useEffect(() => {
    if (!wide) document.getElementById(`molt-tab-${active}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active, wide]);

  const onKeyDown = (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    const at = SKILLS.findIndex((s) => s.id === active);
    let next;
    if (step) next = (at + step + SKILLS.length) % SKILLS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SKILLS.length - 1;
    else return;
    e.preventDefault();
    setTab(SKILLS[next].id);
    document.getElementById(`molt-tab-${SKILLS[next].id}`)?.focus();
  };

  let prev;
  return (
    <nav aria-label="Ce poate face Molt">
      <div
        role="tablist"
        aria-orientation={wide ? "vertical" : "horizontal"}
        onKeyDown={onKeyDown}
        className="-mx-3 flex gap-1.5 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {SKILLS.map((sk) => {
          const on = sk.id === active;
          const Icon = sk.icon;
          const head = sk.group && sk.group !== prev;
          prev = sk.group || prev;
          const count = sk.id === "log" ? waiting : 0;
          return (
            <React.Fragment key={sk.id}>
              {head && (
                <>
                  <span role="presentation" className="hidden px-2 pb-0.5 pt-2.5 text-xs font-extrabold text-faint lg:block">
                    {sk.group}
                  </span>
                  <span role="presentation" aria-hidden="true" className="mx-0.5 h-7 w-px shrink-0 self-center bg-edge lg:hidden" />
                </>
              )}
              <button
                id={`molt-tab-${sk.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="molt-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(sk.id)}
                className={`focus-ring flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left text-sm font-extrabold transition lg:w-full lg:rounded-xl lg:py-1 lg:pl-1.5 ${
                  on ? "bg-violet/15 text-ink ring-1 ring-violet/50" : "bg-well text-dim ring-1 ring-edge hover:text-ink lg:bg-transparent lg:ring-0 lg:hover:bg-panel-hi"
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 lg:h-8 lg:w-8 lg:rounded-lg ${on ? "bg-violet text-on-violet ring-violet-hi" : "bg-panel-hi text-violet-hi ring-edge lg:bg-well"}`}>
                  <Icon size={15} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="whitespace-nowrap lg:flex-1 lg:truncate">{sk.label}</span>
                {count > 0 && <span className="rounded-full bg-rose px-1.5 text-[10px] text-on-rose">{count}</span>}
                {locked && sk.ai && <Lock size={12} className="hidden shrink-0 text-faint lg:block" aria-label="cere un cont" />}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}

function Locked() {
  return (
    <div className="inset flex items-start gap-3 p-4">
      <Lock size={18} className="mt-0.5 shrink-0 text-violet-hi" aria-hidden="true" />
      <p className="text-sm font-semibold text-body">Funcția asta folosește inteligența artificială de pe server și e disponibilă când ești în cont. Intră în cont și Molt îți poate face planuri, analize și reflecții.</p>
    </div>
  );
}

function MemoryBody({ props }) {
  const { state, ai, today } = props;
  const reads = [
    "bifările și obiceiurile tale",
    "to-do-urile și calendarul",
    "obiectivele și pașii lor",
    "scorurile și rapoartele de seară",
    state.profile?.goal ? `obiectivul tău: „${state.profile.goal}”` : "obiectivul din profil",
  ];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-extrabold text-ink">Ce citesc din aplicație</p>
        <ul className="flex flex-wrap gap-2">
          {reads.map((r) => (
            <li key={r} className="inline-flex items-center gap-1.5 rounded-full bg-well px-3 py-1 text-xs font-bold text-body ring-1 ring-edge">
              <Check size={12} className="text-mint" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-edge/60 pt-5">
        <p className="mb-3 text-sm font-extrabold text-ink">Spune-mi ce nu se vede în bifări</p>
        {ai?.server ? <NotesPanel ai={ai} today={today} /> : <Locked />}
      </div>
    </div>
  );
}

export default function Molt(props) {
  const { state, d, ai, agent, tab, setTab, prompt, onPromptUsed, onRename, loadMonth, months, today, go, goals, todo, onAddHabit, onEdit, onStateChange, onLook } = props;
  const wide = useWide();
  const [expKey, setExpKey] = useState(0);
  const waiting = useMemo(() => (agent?.log ? pendingConfirm(agent.log).length : 0), [agent?.log]);
  const wanted = ALIAS[tab] || tab;
  const active = SKILLS.some((s) => s.id === wanted) ? wanted : "chat";
  const skill = SKILLS.find((s) => s.id === active);
  const name = d.companion.name || "Moltul";
  const server = !!ai?.server;
  const toNotes = () => setTab("memory");

  let body;
  switch (active) {
    case "chat":
      body = <Chat state={state} d={d} today={today} ai={ai} goals={goals} todo={props.todo} agent={agent} onAddHabit={onAddHabit} embedded initialPrompt={prompt} onPromptUsed={onPromptUsed} />;
      break;
    case "day":
      body = server ? <DailyPlanPanel state={state} today={today} ai={ai} agent={agent} /> : <Locked />;
      break;
    case "school":
      body = server ? <HomeworkPanel state={state} today={today} ai={ai} onStateChange={onStateChange} /> : <Locked />;
      break;
    case "week":
      body = server ? (
        <>
          <PlanPanel state={state} today={today} ai={ai} onAddHabit={onAddHabit} onEdit={onEdit} onExperiment={() => setExpKey((k) => k + 1)} onNotes={toNotes} />
          <ExperimentsPanel state={state} today={today} ai={ai} refreshKey={expKey} />
        </>
      ) : (
        <Locked />
      );
      break;
    case "goal":
      body = server ? <GoalDecomposer today={today} ai={ai} goals={goals} /> : <Locked />;
      break;
    case "mirror":
      body = server ? <ReflectionPanel state={state} today={today} ai={ai} onNotes={toNotes} /> : <Locked />;
      break;
    case "patterns":
      body = server ? <InsightsPanel state={state} today={today} ai={ai} onNotes={toNotes} /> : <Locked />;
      break;
    case "wardrobe":
      body = <Wardrobe state={state} d={d} onLook={onLook} />;
      break;
    case "memory":
      body = <MemoryBody props={props} />;
      break;
    case "log":
      body = server ? <AgentLog actions={agent?.log} state={state} busy={agent?.busy} error={agent?.error} onConfirm={agent?.onConfirm} onReject={agent?.onReject} onUndo={agent?.onUndo} /> : <Locked />;
      break;
    default:
      body = <Companion state={state} d={d} today={today} months={months} loadMonth={loadMonth} onRename={onRename} go={go} embedded />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[272px,minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-3 lg:space-y-4">
        <MoltCard state={state} d={d} ai={ai} wide={wide} waiting={waiting} onWaiting={() => setTab("log")} onRename={onRename} />
        <SkillNav active={active} setTab={setTab} wide={wide} waiting={waiting} locked={!server} />
      </div>
      <Panel tone="violet" id="molt-panel" role="tabpanel" aria-labelledby={`molt-tab-${active}`} className="speech min-w-0 p-4 sm:p-6">
        <header className="mb-5">
          <h2 className="font-pixel text-2xl leading-tight text-ink">{skill.title(name)}</h2>
          <p className="mt-1.5 max-w-prose text-[15px] font-semibold leading-relaxed text-body">{skill.say}</p>
        </header>
        <div key={active} className="anim-slide">
          {body}
        </div>
      </Panel>
    </div>
  );
}
