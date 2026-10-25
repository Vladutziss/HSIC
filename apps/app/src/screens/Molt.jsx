// Molt: the player's own character, and the place where every AI feature lives. The character is the assistant: it knows
// the habits, to-dos, goals and notes, talks (Chat), makes plans and analyses, keeps what it was told (Ce știe Molt) and
// grows (Evoluție).
//
// One screen, no long scroll: Molt and the list of what it can do sit on the left, and the chosen ability opens in a
// single workbench on the right, styled as Molt speaking (its tail points at the character). Inside it the question,
// the action button and the answer are one block, so nothing needs hunting for.

import React, { useMemo, useState } from "react";
import { BookOpen, Bot, Loader2, CalendarCheck, CalendarRange, Check, Egg, History, Lock, MessageSquare, NotebookPen, Pencil, Shirt, Sparkles, Target, Wand2 } from "lucide-react";
import { Bar, Button, Panel } from "../components/ui.jsx";
import { Sprite, eggCrack } from "../components/Sprite.jsx";
import { AgentLog } from "../components/AgentLog.jsx";
import { ExperimentsPanel, NotesPanel, PlanPanel } from "../components/CoachAgent.jsx";
import { InsightsPanel, ReflectionPanel, useAiJobs } from "../components/AiCoach.jsx";
import { DailyPlanPanel, GoalDecomposer, HomeworkPanel } from "./Planner.jsx";
import { pendingConfirm } from "../lib/agentActions.js";
import { PATHS } from "../lib/catalog.js";
import Chat from "./Chat.jsx";
import Companion from "./Companion.jsx";
import Wardrobe from "./Wardrobe.jsx";
import { tr } from "../lib/i18n.js";

// `group` heads a run of abilities in the list; `say` is the line Molt speaks at the top of the workbench.
// `ai`: needs the server (signed-in). The order here is the order in the list.
const SKILLS = [
  { id: "chat", label: tr("Vorbește"), icon: MessageSquare, ai: true, title: (n) => tr("Vorbește cu {n}", { n }), say: tr("Întreabă-mă orice despre școală, obiective și rutină. Îți fac planuri pe care le aplici dintr-un click.") },
  { id: "day", label: tr("Planul zilei"), icon: Sparkles, group: tr("Planifică"), ai: true, title: () => tr("Planul zilei"), say: tr("Spune-mi cât timp și câtă energie ai, iar eu aleg pașii potriviți din ce ai deja programat.") },
  { id: "week", label: tr("Planul săptămânii"), icon: CalendarRange, group: tr("Planifică"), ai: true, title: () => tr("Planul săptămânii"), say: tr("Citesc bifările tale, notele și cercetarea, apoi îți propun pașii pentru săptămâna viitoare.") },
  { id: "school", label: tr("Teme și examene"), icon: CalendarCheck, group: tr("Planifică"), ai: true, title: () => tr("Teme și examene"), say: tr("Scrie-mi ce ai de făcut, de exemplu „Test la mate vineri”, și le fac pași pe care îi poți planifica.") },
  { id: "goal", label: tr("Scop în pași"), icon: Target, group: tr("Planifică"), ai: true, title: () => tr("Scop în pași"), say: tr("Dă-mi un scop mare și îl tai în pași mici, cu termene. Îi salvezi în Plan, la Obiective.") },
  { id: "mirror", label: tr("Reflecție"), icon: BookOpen, group: tr("Înțelege"), ai: true, title: () => tr("Reflecția săptămânii"), say: tr("Cum a fost săptămâna? Spune-mi ce te-a ajutat sau ce te-a blocat și îți propun un singur pas.") },
  { id: "patterns", label: tr("Tipare"), icon: Wand2, group: tr("Înțelege"), ai: true, title: () => tr("Ce observ la tine"), say: tr("Mă uit la ultimele 4 săptămâni de bifări și îți spun ce tipare văd.") },
  { id: "wardrobe", label: tr("Garderobă"), icon: Shirt, group: tr("Molt"), title: () => tr("Garderoba mea"), say: tr("Ce port arată ce ai făcut. Alege ce îți place și vezi ce mai pot câștiga.") },
  { id: "memory", label: tr("Ce știe Molt"), icon: NotebookPen, group: tr("Molt"), title: () => tr("Ce știu despre tine"), say: tr("Ce-mi spui aici rămâne la mine și îmi ghidează sfaturile: examene, restricții, preferințe.") },
  { id: "log", label: tr("Ce a făcut Molt"), icon: History, group: tr("Molt"), ai: true, title: () => tr("Ce am făcut"), say: tr("Tot ce ți-am propus sau am făcut, cu efectul măsurat și opțiunea de a anula.") },
  { id: "evolution", label: tr("Evoluție"), icon: Egg, group: tr("Molt"), title: () => tr("Evoluția mea"), say: tr("Cresc odată cu obiceiurile pe care le bifezi: fiecare bifă aduce puncte de evoluție după dificultate, dar în aceeași zi fiecare nouă bifă adaugă tot mai puțin.") },
];

// What the menu shows: four entries, the abilities of each one in a second row. Only the abilities that need no account
// work offline; the rest say so when opened.
const GROUPS = [
  { id: "chat", label: tr("Vorbește"), icon: MessageSquare, skills: ["chat"] },
  { id: "plan", label: tr("Planifică"), icon: CalendarCheck, skills: ["day", "week", "school", "goal"] },
  { id: "mind", label: tr("Înțelege"), icon: BookOpen, skills: ["mirror", "patterns"] },
  { id: "about", label: tr("Despre Molt"), icon: Egg, skills: ["wardrobe", "memory", "log", "evolution"] },
];

/** The name of an ability, for messages elsewhere in the app. */
export const skillLabel = (id) => SKILLS.find((s) => s.id === id)?.label || "";

const ALIAS = { ai: "day" }; // the old "Ajutor AI" tab, still reachable from other screens
export const MOLT_TABS = [...SKILLS.map((s) => s.id), ...Object.keys(ALIAS)];

function MoltHeader({ state, d, ai, waiting, onWaiting, onRename }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const p = PATHS[path];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name || "");
  const label = c.name || tr("Moltul tău");
  return (
    <div className="flex items-center gap-4">
      <div className="pedestal shrink-0 rounded-xl px-2 pt-1">
        <Sprite path={path} stage={c.stage.id} mood={c.mood} size={64} crack={eggCrack(c.ep)} look={c.look} label={`${label}, ${c.stage.name}`} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {renaming ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onRename(name.trim().slice(0, 20));
              setRenaming(false);
            }}
          >
            <input className="field" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label={tr("Numele personajului")} autoFocus />
            <Button type="submit" size="sm" icon={Check} aria-label={tr("Salvează numele")} />
          </form>
        ) : (
          <div className="flex items-center gap-1.5">
            <h1 className="truncate font-pixel text-xl leading-tight text-ink">{label}</h1>
            {c.stage.id !== "egg" && (
              <button type="button" onClick={() => setRenaming(true)} className="focus-ring shrink-0 rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink" aria-label={tr("Redenumește")}>
                <Pencil size={15} aria-hidden="true" />
              </button>
            )}
            <span className="truncate text-sm font-extrabold text-violet-hi">
              {c.stage.name} · {p.cls}
            </span>
          </div>
        )}
        {c.next && <Bar value={c.progress} tone="violet" height={8} segmented={false} label={tr("Progres spre evoluția următoare")} />}
        {!ai?.server && <p className="text-xs font-semibold text-dim">{tr("AI indisponibil aici")}</p>}
        {waiting > 0 && (
          <button type="button" onClick={onWaiting} className="focus-ring inline-flex items-center gap-1.5 text-xs font-extrabold text-gold-ink">
            <Sparkles size={13} aria-hidden="true" />
            {tr("Molt așteaptă {waiting} {v}", { waiting, v: waiting === 1 ? tr("propunere") : tr("propuneri") })}
          </button>
        )}
      </div>
    </div>
  );
}

// The menu: one row of four, and a second row with the abilities of the one that is open (when it has more than one).
function MoltNav({ active, setTab, waiting }) {
  const jobs = useAiJobs(); // an ability can be thinking, or have an answer waiting, while you are on another one
  const group = GROUPS.find((g) => g.skills.includes(active)) || GROUPS[0];
  const pill = (on) => `focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold transition ${on ? "bg-violet text-on-violet" : "bg-well text-dim ring-1 ring-edge hover:text-ink"}`;
  const state = (ids) => (ids.some((i) => jobs.busy.includes(i)) ? "busy" : ids.some((i) => jobs.ready.includes(i)) ? "ready" : "");
  return (
    <nav aria-label={tr("Ce poate face Molt")} className="space-y-2">
      <div role="tablist" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const on = g.id === group.id;
          const st = !on ? state(g.skills) : "";
          return (
            <button key={g.id} id={`molt-tab-${g.skills[0]}`} type="button" role="tab" aria-selected={on} onClick={() => setTab(g.skills.includes(active) ? active : g.skills[0])} className={pill(on)}>
              <Icon size={15} strokeWidth={2.5} className="hidden sm:block" aria-hidden="true" />
              {g.label}
              {g.skills.includes("log") && waiting > 0 && <span className="rounded-full bg-rose px-1.5 text-[10px] text-on-rose">{waiting}</span>}
              {st === "busy" && <Loader2 size={13} className="anim-spin shrink-0" role="img" aria-label={tr("Molt se gândește…")} />}
              {st === "ready" && <span className="h-2 w-2 shrink-0 rounded-full bg-mint" role="img" aria-label={tr("Molt are un răspuns pentru tine")} />}
            </button>
          );
        })}
      </div>
      {group.skills.length > 1 && (
        <div role="tablist" className="-mx-3 flex gap-4 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {group.skills.map((id) => {
            const sk = SKILLS.find((x) => x.id === id);
            const on = id === active;
            return (
              <button
                key={id}
                id={`molt-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="molt-panel"
                onClick={() => setTab(id)}
                className={`focus-ring inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-1 text-sm font-extrabold transition ${on ? "border-violet text-ink" : "border-transparent text-dim hover:text-ink"}`}
              >
                {sk.label}
                {id === "log" && waiting > 0 && <span className="rounded-full bg-rose px-1.5 text-[10px] text-on-rose">{waiting}</span>}
                {jobs.busy.includes(id) && <Loader2 size={12} className="anim-spin shrink-0 text-violet-hi" role="img" aria-label={tr("Molt se gândește…")} />}
                {!on && jobs.ready.includes(id) && <span className="h-2 w-2 shrink-0 rounded-full bg-mint" role="img" aria-label={tr("Molt are un răspuns pentru tine")} />}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

function Locked() {
  return (
    <div className="inset flex items-start gap-3 p-4">
      <Lock size={18} className="mt-0.5 shrink-0 text-violet-hi" aria-hidden="true" />
      <p className="text-sm font-semibold text-body">{tr("Funcția asta folosește inteligența artificială de pe server și e disponibilă când ești în cont. Intră în cont și Molt îți poate face planuri, analize și reflecții.")}</p>
    </div>
  );
}

function MemoryBody({ props }) {
  const { state, ai, today } = props;
  const reads = [
    tr("bifările și obiceiurile tale"),
    tr("to-do-urile și calendarul"),
    tr("obiectivele și pașii lor"),
    tr("scorurile și rapoartele de seară"),
    state.profile?.goal ? tr("obiectivul tău: „{goal}”", { goal: state.profile.goal }) : tr("obiectivul din profil"),
  ];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-extrabold text-ink">{tr("Ce citesc din aplicație")}</p>
        <ul className="flex flex-wrap gap-2">
          {reads.map((r) => (
            <li key={r} className="inline-flex items-center gap-1.5 rounded-full bg-well px-3 py-1 text-xs font-bold text-body ring-1 ring-edge">
              <Check size={12} className="text-mint" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-edge/60 pt-5">
        <p className="mb-3 text-sm font-extrabold text-ink">{tr("Spune-mi ce nu se vede în bifări")}</p>
        {ai?.server ? <NotesPanel ai={ai} today={today} /> : <Locked />}
      </div>
    </div>
  );
}

export default function Molt(props) {
  const { state, d, ai, agent, tab, setTab, prompt, onPromptUsed, onRename, loadMonth, months, today, go, goals, todo, onAddHabit, onEdit, onStateChange, onLook } = props;
  const [expKey, setExpKey] = useState(0);
  const waiting = useMemo(() => (agent?.log ? pendingConfirm(agent.log).length : 0), [agent?.log]);
  const wanted = ALIAS[tab] || tab;
  const active = SKILLS.some((s) => s.id === wanted) ? wanted : "chat";
  const skill = SKILLS.find((s) => s.id === active);
  const name = d.companion.name || tr("Moltul");
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
    <div className="space-y-4">
      <MoltHeader state={state} d={d} ai={ai} waiting={waiting} onWaiting={() => setTab("log")} onRename={onRename} />
      <MoltNav active={active} setTab={setTab} waiting={waiting} />
      <Panel tone="violet" id="molt-panel" role="tabpanel" aria-labelledby={`molt-tab-${active}`} className="min-w-0 p-4 sm:p-6">
        <header className="mb-5">
          <h2 className="font-pixel text-xl leading-tight text-ink">{skill.title(name)}</h2>
          <p className="mt-1.5 max-w-prose text-sm font-semibold leading-relaxed text-body">{skill.say}</p>
        </header>
        <div key={active} className="anim-slide">
          {body}
        </div>
      </Panel>
    </div>
  );
}
