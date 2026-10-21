import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  Check,
  Clock,
  Flame,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Button, Chip, Confirm, IconButton, Panel, Skeleton, useToast } from "../components/ui.jsx";
import { Sprite, eggCrack } from "../components/Sprite.jsx";
import { PATHS } from "../lib/catalog.js";
import { append as appendChat, clear as clearChat, load as loadChat, loadLocal, saveLocal } from "../lib/chatStore.js";
import { askChat, chatContext } from "../lib/chat.js";
import { goalSet, habitList, summary as planSummary, todoList } from "../lib/planApply.js";
import { getClient } from "../lib/supabase.js";
import { loadNotes } from "../lib/memory.js";
import { aiErrorCopy } from "../lib/ai.js";
import { uid } from "../lib/catalog.js";
import { tr } from "../lib/i18n.js";

const STARTERS = [
  tr("Vreau să mă pregătesc pentru examenul de bacalaureat la matematică."),
  tr("Ajută-mă să-mi fac un program zilnic de învățat și teme."),
  tr("Vreau să încep un obicei sănătos de lectură de 20 de minute pe zi."),
  tr("Cum pot să-mi împart un proiect mare de școală în pași mici?"),
];

// `embedded`: inside the Molt page, which already has the header. `initialPrompt`: a question sent as soon as the
// conversation has loaded (from the quick questions on Acasă); `onPromptUsed` clears it so it is sent once.
export default function Chat({ state, d, today, ai, goals, todo, agent, onAddHabit, embedded = false, initialPrompt = null, onPromptUsed }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [clearOpen, setClearOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [appliedPlans, setAppliedPlans] = useState(() => new Set());
  const toast = useToast();
  const listRef = useRef(null);

  const companion = d?.companion || state?.companion || {};
  const path = state?.profile?.path || "sport";
  const pInfo = PATHS[path] || PATHS.sport;
  const moltName = companion.name || tr("Moltul tău");

  // Initial load: from Supabase on web build, localStorage fallback on offline/artifact
  useEffect(() => {
    let alive = true;
    if (ai?.server) {
      getClient()
        .then(async (c) => {
          if (!c || !alive) return;
          try {
            const [loadedMsgs, loadedNotes] = await Promise.all([
              loadChat(c),
              loadNotes(c).catch(() => []),
            ]);
            if (alive) {
              setMessages(loadedMsgs);
              setNotes(loadedNotes);
            }
          } catch {
            if (alive) setMessages(loadLocal());
          }
          if (alive) setLoaded(true);
        })
        .catch(() => {
          if (alive) {
            setMessages(loadLocal());
            setLoaded(true);
          }
        });
    } else {
      setMessages(loadLocal());
      setLoaded(true);
    }
    return () => {
      alive = false;
    };
  }, [ai?.server]);

  // Scroll to bottom on new messages
  useEffect(() => {
    // follow the conversation inside the list only: scrollIntoView would also move the whole page, and opening the
    // chat (nothing said yet) must not scroll anything
    const list = listRef.current;
    if (list && messages.length > 0) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const handleSend = async (textToSend) => {
    const text = (typeof textToSend === "string" ? textToSend : input).trim();
    if (!text || busy) return;
    setInput("");
    setError("");

    const userMsg = { id: `local-${Date.now()}`, role: "user", content: text, plan: null, createdAt: new Date().toISOString() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const client = ai?.server ? await getClient() : null;
      if (client) {
        appendChat(client, { role: "user", content: text }).catch(() => {});
      } else {
        saveLocal(nextMessages);
      }

      // Find current active plan from previous messages to allow iterative editing
      const latestPlan = [...nextMessages].reverse().find((m) => m.plan)?.plan || null;

      const context = chatContext(state, today, notes);
      const res = await askChat({
        name: companion.name || pInfo.cls,
        cls: pInfo.cls,
        goal: state?.profile?.goal || "",
        messages: nextMessages,
        plan: latestPlan,
        context,
      });

      const assistantMsg = {
        id: `local-${Date.now() + 1}`,
        role: "assistant",
        content: res.reply,
        plan: res.plan,
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);

      if (client) {
        appendChat(client, { role: "assistant", content: res.reply, plan: res.plan }).catch(() => {});
      } else {
        saveLocal(finalMessages);
      }
    } catch (e) {
      setError(aiErrorCopy(e?.code) || tr("Moltul nu a putut răspunde. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  };

  // a question asked from elsewhere in the app goes out once, after the old messages are in
  const promptSent = useRef(false);
  useEffect(() => {
    if (!loaded || !initialPrompt || promptSent.current || !ai?.server) return;
    promptSent.current = true;
    onPromptUsed?.();
    handleSend(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, initialPrompt, ai?.server]);

  const handleApplyPlan = async (plan, msgId) => {
    if (!plan || appliedPlans.has(msgId)) return;
    try {
      // 1. Goal with milestones
      const set = goalSet(plan, today);
      let stepCount = 0;
      if (set && goals?.addSet) {
        goals.addSet(set.parent, set.children);
        stepCount = set.children.length;
      }

      // 2. Habits
      const habitsToAdd = habitList(plan, state);
      for (const h of habitsToAdd) {
        onAddHabit?.({
          id: uid("h"),
          name: h.name,
          days: h.days,
          diff: h.diff,
          path,
          createdAt: today,
        });
      }

      // 3. To-dos
      const todosToAdd = todoList(plan, state, today);
      for (const t of todosToAdd) {
        if (agent?.propose) {
          await agent.propose({
            title: t.title,
            dur: t.dur,
            date: t.date,
            reason: plan.why || `Plan: ${plan.title}`,
            explanation: {
              dataUsed: [tr("conversația cu Moltul")],
              confidence: "high",
              expectedEffect: tr("pas din planul structurat"),
            },
          });
        } else if (todo?.add) {
          todo.add({ title: t.title, dur: t.dur, date: t.date, fromAgent: true });
        }
      }

      setAppliedPlans((prev) => new Set([...prev, msgId]));
      toast({
        title: tr("Plan aplicat cu succes!"),
        text: planSummary({ steps: stepCount, habits: habitsToAdd.length, todos: todosToAdd.length }),
        icon: Check,
        tone: "mint",
      });
    } catch (e) {
      toast({
        title: tr("Eroare la aplicarea planului"),
        text: aiErrorCopy(e?.code) || tr("Unele elemente nu au putut fi salvate."),
        icon: AlertCircle,
        tone: "rose",
      });
    }
  };

  const handleClear = async () => {
    setClearOpen(false);
    try {
      if (ai?.server) {
        const client = await getClient();
        if (client) await clearChat(client);
      }
      saveLocal([]);
      setMessages([]);
      setAppliedPlans(new Set());
      toast({ title: tr("Conversație ștearsă"), icon: Trash2, tone: "mint" });
    } catch {
      toast({ title: tr("Nu am putut șterge conversația"), icon: AlertCircle, tone: "rose" });
    }
  };

  const Wrap = embedded ? "div" : Panel;
  return (
    <div className="space-y-4">
      {!embedded && (
        <>
        {/* Header Panel */}
        <Panel tone="violet" corners className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="pedestal grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14">
                <Sprite path={path} stage={companion.stage?.id || "egg"} mood={companion.mood || "idle"} size={48} crack={eggCrack(companion.ep || 0)} look={companion.look} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-pixel text-lg sm:text-xl text-ink">{moltName}</h1>
                  <Chip tone="violet">{pInfo.cls}</Chip>
                </div>
                <p className="text-xs font-semibold text-dim">{tr("Asistentul tău personal AI · Întreabă orice despre școală, obiective și rutină")}</p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setClearOpen(true)} className="text-dim hover:text-rose">{tr("Șterge conversația")}</Button>
            )}
          </div>
        </Panel>
        </>
      )}

      {/* Offline banner if server is unavailable */}
      {!ai?.server && (
        <div className="inset flex items-center gap-2.5 p-3 text-xs font-semibold text-dim">
          <AlertCircle size={16} className="text-ember shrink-0" aria-hidden="true" />
          <span>{tr("Chat-ul cu Moltul folosește inteligența artificială de pe server. În modul local/offline conversațiile anterioare sunt păstrate, dar generarea răspunsurilor noi necesită conexiune activă.")}</span>
        </div>
      )}

      {/* Chat Messages Container */}
      <Wrap {...(embedded ? { className: "flex flex-col" } : { tone: "violet", className: "flex min-h-[460px] flex-col justify-between p-3 sm:p-5" })}>
        <div ref={listRef} className={`space-y-4 overflow-y-auto pr-1 ${embedded ? "max-h-[min(56vh,520px)] min-h-[220px]" : ""}`}>
          {messages.length === 0 ? (
            <div className={`flex flex-col items-center justify-center gap-4 text-center ${embedded ? "py-3" : "py-8"}`}>
              {!embedded && (
                <>
                  <div className="pedestal grid h-20 w-20 place-items-center rounded-2xl">
                    <Sprite path={path} stage={companion.stage?.id || "egg"} mood={companion.mood || "idle"} size={64} crack={eggCrack(companion.ep || 0)} look={companion.look} />
                  </div>
                  <div className="max-w-md">
                    <h2 className="font-pixel text-lg text-ink">{tr("Salut! Eu sunt {moltName}.", { moltName })}</h2>
                    <p className="mt-1 text-sm font-semibold text-dim">{tr("Sunt aici să te ajut să îți organizezi învățatul, să pregătești examenele sau să-ți construiești obiceiuri solide. Despre ce vrei să vorbim?")}</p>
                  </div>
                </>
              )}

              {ai?.server && (
                <div className="mt-2 w-full max-w-lg space-y-2">
                  <p className="text-sm font-extrabold text-violet-hi">{tr("Cu ce începem?")}</p>
                  <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2">
                    {STARTERS.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSend(s)}
                        className="inset focus-ring flex items-center gap-2 p-2.5 text-left text-xs font-semibold text-body transition hover:bg-panel-hi hover:text-ink"
                      >
                        <Sparkles size={13} className="shrink-0 text-gold" aria-hidden="true" />
                        <span className="line-clamp-2">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((m, idx) => {
              const isUser = m.role === "user";
              const isApplied = appliedPlans.has(m.id);

              return (
                <div key={m.id || idx} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold text-dim">
                    {isUser ? (
                      <span>{tr("Tu")}</span>
                    ) : (
                      <>
                        <Sparkles size={11} className="text-violet-hi" aria-hidden="true" />
                        <span className="text-violet-hi">{moltName}</span>
                      </>
                    )}
                  </div>

                  <div
                    className={`max-w-[90%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-4 text-sm font-medium leading-relaxed ${
                      isUser
                        ? "rounded-tr-xs bg-violet/15 text-ink ring-1 ring-violet/30"
                        : "rounded-tl-xs bg-panel text-ink ring-1 ring-edge"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>

                    {/* Plan Card */}
                    {m.plan && (
                      <div className="mt-3 space-y-3 rounded-xl border border-violet/30 bg-well/80 p-3 sm:p-4">
                        <div className="border-b border-edge/60 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-violet-hi">{tr("Plan structurat de Molt")}</span>
                          <h3 className="font-pixel text-base text-ink">{m.plan.title}</h3>
                          {m.plan.why && (
                            <p className="mt-0.5 text-xs font-medium text-dim italic">„{m.plan.why}”</p>
                          )}
                        </div>

                        {/* Steps */}
                        {m.plan.steps?.length > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-violet-hi">
                              <Target size={13} aria-hidden="true" />{" "}{tr("Etape (Obiective): {length}", { length: m.plan.steps.length })}</div>
                            <ul className="space-y-1">
                              {m.plan.steps.map((st, sIdx) => (
                                <li key={sIdx} className="inset flex items-baseline gap-2 p-2 text-xs">
                                  <span className="font-pixel font-bold text-violet">{sIdx + 1}.</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-bold text-ink">{st.text}</span>
                                    {st.criteria && (
                                      <span className="block text-[11px] text-dim font-medium">{tr("Criteriu: {criteria}", { criteria: st.criteria })}</span>
                                    )}
                                  </div>
                                  {st.due && <Chip tone="sky">{st.due}</Chip>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Habits */}
                        {m.plan.habits?.length > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gold">
                              <Flame size={13} aria-hidden="true" />{" "}{tr("Obiceiuri propuse: {length}", { length: m.plan.habits.length })}</div>
                            <div className="flex flex-wrap gap-2">
                              {m.plan.habits.map((h, hIdx) => (
                                <div key={hIdx} className="inset flex items-center gap-2 px-2.5 py-1.5 text-xs">
                                  <span className="font-bold text-ink">{h.name}</span>
                                  <Chip tone="gold">{tr("Dificultate {diff}", { diff: h.diff })}</Chip>
                                  <span className="text-[10px] text-dim">{tr("{length} zile/săpt", { length: h.days?.length })}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* To-dos */}
                        {m.plan.todos?.length > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-mint">
                              <Clock size={13} aria-hidden="true" />{" "}{tr("To-do-uri imediate: {length}", { length: m.plan.todos.length })}</div>
                            <ul className="space-y-1">
                              {m.plan.todos.map((t, tIdx) => (
                                <li key={tIdx} className="inset flex items-center justify-between gap-2 p-2 text-xs">
                                  <span className="font-bold text-ink">{t.title}</span>
                                  <div className="flex items-center gap-2">
                                    <Chip tone="mint">{t.dur} min</Chip>
                                    <span className="text-[10px] text-dim">{t.date}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Apply button */}
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant={isApplied ? "ghost" : "gold"}
                            icon={isApplied ? Check : Plus}
                            disabled={isApplied}
                            onClick={() => handleApplyPlan(m.plan, m.id)}
                            className="w-full sm:w-auto"
                          >
                            {isApplied ? tr("Plan aplicat în obiective și to-do-uri") : tr("Aplică planul în obiective, obiceiuri și to-do-uri")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {busy && (
            <div className="flex flex-col items-start gap-1">
              <span className="text-[11px] font-bold text-violet-hi">{tr("{moltName} se gândește…", { moltName })}</span>
              <div className="rounded-2xl rounded-tl-xs bg-panel p-3.5 ring-1 ring-edge">
                <Skeleton className="h-6 w-48" />
              </div>
            </div>
          )}

          {error && (
            <div className="inset flex items-center gap-2 p-3 text-xs font-bold text-rose">
              <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mt-4 flex items-center gap-2 border-t border-edge/60 pt-3"
        >
          {messages.length > 0 && <IconButton icon={Trash2} label={tr("Șterge conversația")} onClick={() => setClearOpen(true)} className="shrink-0 hover:text-rose" />}
          <input
            className="field flex-1 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr("Scrie-i lui {moltName}… (ex: „Vreau un plan de 2 săptămâni pentru simulare”)", { moltName })}
            disabled={busy || !ai?.server}
          />
          <Button
            type="submit"
            variant="gold"
            icon={Send}
            disabled={!input.trim() || busy || !ai?.server}
            busy={busy}
          >{tr("Trimite")}</Button>
        </form>
      </Wrap>

      <Confirm
        open={clearOpen}
        title={tr("Ștergi conversația?")}
        confirmLabel={tr("Șterge definitiv")}
        tone="rose"
        onConfirm={handleClear}
        onClose={() => setClearOpen(false)}
      >
        <p className="text-sm font-semibold text-body">{tr("Toate mesajele din conversația cu {moltName} vor fi șterse. Obiectivele, obiceiurile și to-do-urile deja aplicate vor rămâne salvate în aplicație.", { moltName })}</p>
      </Confirm>
    </div>
  );
}
