// Molt: the player's own character, and the place where every AI feature lives. The character is the assistant:
// it knows the habits, to-dos, goals and notes, talks (Chat), makes plans and analyses (Ajutor AI), keeps what it was
// told (Ce știe Molt) and grows (Evoluție). The pieces are the same panels that used to be spread over Obiceiuri,
// Plan and Statistici; here they sit together, so using the AI reads as the main way to reach the goals.

import React, { useMemo, useState } from "react";
import { BarChart3, Bot, Check, Egg, Eye, MessageSquare, NotebookPen, Pencil, Sparkles, Target, Wand2 } from "lucide-react";
import { Bar, Button, Chip, Empty, Panel, Tabs } from "../components/ui.jsx";
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

export const MOLT_TABS = ["chat", "ai", "memory", "evolution"];

// what Molt can do, in plain words: shown to everyone, so the player sees what the AI is for even before signing in
const ABILITIES = [
  { icon: MessageSquare, title: "Vorbește cu el", text: "Întreabă-l orice despre școală, obiective și rutină; îți face planuri pe care le aplici dintr-un click." },
  { icon: Sparkles, title: "Planul zilei și al săptămânii", text: "Alege din ce ai deja programat pașii potriviți pentru timpul și energia pe care le ai." },
  { icon: Target, title: "Scopuri împărțite în pași", text: "Din „vreau să învăț programare” face etape mici, cu termene." },
  { icon: BarChart3, title: "Analize și reflecții", text: "Vede tiparele din bifările tale și îți propune un singur pas care contează." },
  { icon: NotebookPen, title: "Își amintește", text: "Ce îi spui (un examen, o restricție, o preferință) rămâne la el și îi ghidează sfaturile." },
];

function Group({ title, sub, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-pixel text-lg text-ink">{title}</h2>
        {sub && <p className="text-xs font-semibold text-dim">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Hero({ state, d, ai, onRename, setTab }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const p = PATHS[path];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name || "");
  const habits = (state.habits || []).filter((h) => !h.archivedAt).length;
  const goals = (state.objectives || []).filter((o) => !o.archived && !o.doneOn).length;
  const label = c.name || "Moltul tău";
  return (
    <Panel tone="violet" corners className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[auto,1fr] [&>*]:min-w-0">
        <div className="pedestal flex items-end justify-center px-8 pt-5 sm:min-w-[210px]">
          <Sprite path={path} stage={c.stage.id} mood={c.mood} size={148} crack={eggCrack(c.ep)} label={`${label}, ${c.stage.name}`} />
        </div>
        <div className="flex flex-col justify-center gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="violet" icon={Sparkles}>
              Asistentul tău personal AI
            </Chip>
            <Chip tone={ai?.server ? "mint" : "dim"} icon={Bot}>
              {ai?.server ? "AI activ" : "AI indisponibil aici"}
            </Chip>
          </div>
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-hi">
              {c.stage.name} · {p.cls}
            </div>
            {renaming ? (
              <form
                className="mt-1 flex gap-2"
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
              <div className="mt-1 flex items-center gap-2">
                <h1 className="font-pixel text-3xl text-ink sm:text-4xl">{label}</h1>
                {c.stage.id !== "egg" && (
                  <button type="button" onClick={() => setRenaming(true)} className="focus-ring rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink" aria-label="Redenumește">
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-1.5 text-sm font-semibold text-body">
              {c.stage.id === "egg" ? moodLine(c, c.name) : `Îți știu obiceiurile, to-do-urile și obiectivele, ca să te ajut să le atingi. ${moodLine(c, c.name)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold text-dim">
            <span className="inline-flex items-center gap-1 rounded-full bg-well px-2.5 py-1 ring-1 ring-edge">
              <Eye size={12} aria-hidden="true" /> văd {habits} {habits === 1 ? "obicei" : "obiceiuri"}
            </span>
            <span className="rounded-full bg-well px-2.5 py-1 ring-1 ring-edge">
              {goals} {goals === 1 ? "obiectiv activ" : "obiective active"}
            </span>
            <button type="button" onClick={() => setTab("memory")} className="focus-ring rounded-full bg-well px-2.5 py-1 ring-1 ring-edge hover:text-ink">
              ce știu despre tine →
            </button>
          </div>
          {c.next && (
            <div>
              <div className="mb-1 flex justify-between text-xs font-extrabold text-dim">
                <span>Următoarea evoluție: {c.next.name}</span>
                <span className="tabular">
                  {c.ep} / {c.next.min} PE
                </span>
              </div>
              <Bar value={c.progress} tone="violet" label="Progres spre evoluția următoare" />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function AiTab({ props }) {
  const { state, today, ai, agent, goals, onStateChange, onAddHabit, onEdit } = props;
  const [expKey, setExpKey] = useState(0);
  const waiting = agent?.log ? pendingConfirm(agent.log).length : 0;

  if (!ai?.server) {
    return (
      <Panel className="p-4 sm:p-6">
        <Empty icon={Bot} title="Ajutorul AI e disponibil când ești în cont">
          Funcțiile de mai jos folosesc inteligența artificială de pe server. Intră în contul tău și Molt va putea să-ți facă planuri, analize și reflecții.
        </Empty>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {ABILITIES.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.title} className="inset flex items-start gap-3 p-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-violet-hi" aria-hidden="true" />
                <div>
                  <p className="text-sm font-extrabold text-ink">{a.title}</p>
                  <p className="text-xs font-semibold text-dim">{a.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    );
  }
  return (
    <div className="space-y-7">
      {waiting > 0 && (
        <a href="#molt-log" className="focus-ring flex items-center gap-3 rounded-2xl bg-gold/15 p-3 text-sm font-extrabold text-ink ring-1 ring-gold/40 hover:bg-gold/20">
          <Sparkles size={18} className="shrink-0 text-gold-ink" aria-hidden="true" />
          <span className="flex-1">
            Molt așteaptă răspunsul tău la {waiting} {waiting === 1 ? "propunere" : "propuneri"}.
          </span>
          <span className="text-xs">Vezi mai jos ↓</span>
        </a>
      )}
      <Group title="Pentru azi" sub="Cere-i lui Molt să te ajute cu ziua de azi">
        <DailyPlanPanel state={state} today={today} ai={ai} agent={agent} />
        <HomeworkPanel state={state} today={today} ai={ai} onStateChange={onStateChange} />
      </Group>
      <Group title="Pentru săptămâna asta" sub="Planuri și analize făcute din bifările tale reale">
        <PlanPanel state={state} today={today} ai={ai} onAddHabit={onAddHabit} onEdit={onEdit} onExperiment={() => setExpKey((k) => k + 1)} />
        <ReflectionPanel state={state} today={today} ai={ai} />
        <InsightsPanel state={state} today={today} ai={ai} />
      </Group>
      <Group title="Pentru scopurile tale" sub="Scopurile salvate apar în Plan, la Obiective">
        <GoalDecomposer today={today} ai={ai} goals={goals} />
        <ExperimentsPanel state={state} today={today} ai={ai} refreshKey={expKey} />
      </Group>
      <div id="molt-log">
        <AgentLog actions={agent?.log} state={state} busy={agent?.busy} error={agent?.error} onConfirm={agent?.onConfirm} onReject={agent?.onReject} onUndo={agent?.onUndo} />
      </div>
    </div>
  );
}

function MemoryTab({ props }) {
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
      <Panel className="p-4 sm:p-5">
        <h2 className="font-pixel text-lg text-ink">Ce citește Molt din aplicație</h2>
        <p className="mt-0.5 text-xs font-semibold text-dim">Doar ce ai în Molted; nimic din afară. Le folosește ca să-ți dea sfaturi potrivite.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {reads.map((r) => (
            <li key={r} className="inline-flex items-center gap-1.5 rounded-full bg-well px-3 py-1 text-xs font-bold text-body ring-1 ring-edge">
              <Check size={12} className="text-mint" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      </Panel>
      {ai?.server ? <NotesPanel ai={ai} today={today} /> : <Empty icon={NotebookPen} title="Notele cer un cont">Intră în cont ca să-i poți spune lui Molt ce nu se vede în bifări.</Empty>}
    </div>
  );
}

export default function Molt(props) {
  const { state, d, ai, agent, tab, setTab, prompt, onPromptUsed, onRename, loadMonth, months, today, go } = props;
  const waiting = useMemo(() => (agent?.log ? pendingConfirm(agent.log).length : 0), [agent?.log]);
  const active = MOLT_TABS.includes(tab) ? tab : "chat";
  return (
    <div className="space-y-5">
      <Hero state={state} d={d} ai={ai} onRename={onRename} setTab={setTab} />
      <Tabs
        value={active}
        onChange={setTab}
        items={[
          { value: "chat", label: "Chat", icon: MessageSquare, id: "molt-tab-chat" },
          { value: "ai", label: "Ajutor AI", icon: Wand2, count: waiting, id: "molt-tab-ai" },
          { value: "memory", label: "Ce știe Molt", icon: NotebookPen, id: "molt-tab-memory" },
          { value: "evolution", label: "Evoluție", icon: Egg, id: "molt-tab-evolution" },
        ]}
      />
      {active === "chat" && (
        <Chat
          state={state}
          d={d}
          today={today}
          ai={ai}
          goals={props.goals}
          todo={props.todo}
          agent={agent}
          onAddHabit={props.onAddHabit}
          embedded
          initialPrompt={prompt}
          onPromptUsed={onPromptUsed}
        />
      )}
      {active === "ai" && <AiTab props={props} />}
      {active === "memory" && <MemoryTab props={props} />}
      {active === "evolution" && <Companion state={state} d={d} today={today} months={months} loadMonth={loadMonth} onRename={onRename} go={go} embedded />}
    </div>
  );
}
