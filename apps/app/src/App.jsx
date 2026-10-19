import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, CalendarX, CheckCircle2, FlaskConical, Leaf, Timer, Zap } from "lucide-react";
import { useAppStore } from "./lib/store.js";
import { checkInGain, derive, reviewPayload } from "./lib/derive.js";
import { CODE, focusXpByDay } from "./lib/engine.js";
import { addDays, dayKey, fmt12, monthKey, nowMinutes, parseHM, todayKey, weekday } from "./lib/dates.js";
import { detectMoments } from "./lib/moments.js";
import { milestoneSet, statusPatch, toggleLink } from "./lib/milestones.js";
import { pickQuote } from "./lib/quotes.js";
import { agentClient, aiErrorCopy, aiStatus, dailyReview } from "./lib/ai.js";
import { hasOpenTodo, loadActions, markApplied, markRejected, markUndone, pendingAuto, planApply, planUndo, recordTodo } from "./lib/agentActions.js";
import { permissionState } from "./lib/platform.js";
import { useGroups } from "./lib/groups.js";
import { uid } from "./lib/catalog.js";
import { legacyTodos } from "./lib/legacy.js";
import { toggleDone } from "./lib/todos.js";
import { rescueInfo } from "./lib/rescue.js";
import { Confirm, ToastProvider, useToast } from "./components/ui.jsx";
import { deleteAccount } from "./lib/account.js";
import { Shell } from "./components/Shell.jsx";
import { FocusMode, FocusSetup } from "./components/Focus.jsx";
import { carryCopies } from "./lib/goals.js";
import { fmtSpan, loadSession, newSession, saveSession } from "./lib/focus.js";
import { MomentModal } from "./components/MomentModal.jsx";
import { HabitEditor, scheduleLabel } from "./components/HabitEditor.jsx";
import { TodoEditor } from "./components/TodoEditor.jsx";
import Onboarding from "./screens/Onboarding.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Habits from "./screens/Habits.jsx";
import Companion from "./screens/Companion.jsx";
import Chat from "./screens/Chat.jsx";
import Group from "./screens/Group.jsx";
import Planner from "./screens/Planner.jsx";
import Stats from "./screens/Stats.jsx";
import SettingsScreen from "./screens/Settings.jsx";

const STATE_VERSION = 2;
const uniq = (arr) => [...new Set(arr)];

function useToday() {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const t = setInterval(() => setToday((cur) => (cur === todayKey() ? cur : todayKey())), 30000);
    return () => clearInterval(t);
  }, []);
  return today;
}

function useNow() {
  const [now, setNow] = useState(nowMinutes());
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useAi() {
  const [ai, setAi] = useState({ available: false, checked: false });
  useEffect(() => {
    let alive = true;
    aiStatus().then((s) => alive && setAi({ ...s, checked: true }));
    return () => {
      alive = false;
    };
  }, []);
  return ai;
}

function Loading() {
  return (
    <div className="app-bg grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-dim">
        <Leaf className="anim-flicker text-gold" size={28} aria-hidden="true" />
        <span className="font-pixel text-lg text-ink">Se încarcă aventura…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Game />
    </ToastProvider>
  );
}

function Game() {
  const store = useAppStore();
  const { state, update } = store;
  const today = useToday();
  const now = useNow();
  const ai = useAi();
  const toast = useToast();
  const d = useMemo(() => (state ? derive(state, today) : null), [state, today]);
  const groups = useGroups({ store, state, update, myStats: d?.publicStats });

  const [view, setView] = useState("home");
  const [focusHabit, setFocusHabit] = useState(null);
  const [habitEd, setHabitEd] = useState(null); // { habit?, tab? }
  const [todoEd, setTodoEd] = useState(null); // a draft to-do
  const [confirm, setConfirm] = useState(null);
  const [focusSession, setFocusSession] = useState(loadSession); // the running Focus session, else null
  const [focusSetup, setFocusSetup] = useState(false);
  const [focusPrefill, setFocusPrefill] = useState(null); // { work } from a planned to-do's Focus button
  const beginFocus = (pomodoro) => {
    const s = newSession(Date.now(), pomodoro);
    saveSession(s);
    setFocusSession(s);
    setFocusSetup(false);
    setFocusPrefill(null);
  };
  const changeFocus = useCallback((s) => {
    saveSession(s);
    setFocusSession(s);
  }, []);
  const finishFocus = (record) => {
    saveSession(null);
    setFocusSession(null);
    if (!record) return;
    const before = focusXpByDay(state.focusSessions)[dayKey(new Date(record.start))] || 0;
    const after = focusXpByDay([...(state.focusSessions || []), record])[dayKey(new Date(record.start))] || 0;
    update((s) => ({ ...s, focusSessions: [...(s.focusSessions || []), record].slice(-300) }));
    const xp = after - before;
    toast({
      title: "Sesiune de Focus salvată",
      text: `${fmtSpan(record.work)} de concentrare${xp > 0 ? ` · +${xp} momentum` : record.work < 300 ? " · sub 5 minute, fără momentum" : " · limita zilnică de momentum din Focus e atinsă"}`,
      icon: Timer,
      tone: "mint",
    });
  };
  const [queue, setQueue] = useState([]);
  const [review, setReview] = useState({ status: "idle", error: null });
  const autoTried = useRef(null);

  // The coach agent's log: what it did, what waits for a tap, and what came of it. Every effect is
  // applied here, by the player's own session, so the app keeps a single writer for its state.
  const [agentLog, setAgentLog] = useState(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const appliedAuto = useRef(new Set());
  const reloadAgentLog = useCallback(async () => {
    try {
      const c = await agentClient();
      setAgentLog(c ? await loadActions(c) : []);
    } catch {
      setAgentLog([]);
    }
  }, []);
  useEffect(() => {
    if (ai.server) reloadAgentLog();
  }, [ai.server, reloadAgentLog]);

  // Reversible, low-risk actions the weekly run logged as automatic (a to-do) are applied once, with an undo.
  useEffect(() => {
    if (!agentLog || !state || !ai.server) return;
    for (const a of pendingAuto(agentLog)) {
      if (appliedAuto.current.has(a.id)) continue;
      appliedAuto.current.add(a.id);
      const r = planApply(a, state, today);
      if (r.error) continue;
      update(r.patch);
      agentClient()
        .then((c) => markApplied(c, a.id, r.before, { outcomeDue: addDays(today, 14), action: a }))
        .then(reloadAgentLog)
        .catch(() => {});
      toast({ title: "Coach-ul ți-a pregătit ceva", text: a.reason, icon: CheckCircle2, tone: "mint", ms: 4500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentLog, !!state, ai.server]);

  const decideAction = async (fn) => {
    setAgentBusy(true);
    setAgentError("");
    try {
      await fn();
      await reloadAgentLog();
    } catch (e) {
      setAgentError(aiErrorCopy(e?.code));
    } finally {
      setAgentBusy(false);
    }
  };
  const agentActions = {
    log: agentLog,
    busy: agentBusy,
    error: agentError,
    onConfirm: (a) =>
      decideAction(async () => {
        const r = planApply(a, state, today);
        if (r.error) throw { code: "db_error" };
        update(r.patch);
        await markApplied(await agentClient(), a.id, r.before, { outcomeDue: addDays(today, 14), action: a });
      }),
    onUndo: (a) =>
      decideAction(async () => {
        const r = planUndo(a, state, today);
        if (r.error) throw { code: "db_error" };
        update(r.patch);
        await markUndone(await agentClient(), a.id, a);
      }),
    onReject: (a, reason) =>
      decideAction(async () => {
        await markRejected(await agentClient(), a.id, reason, a);
      }),
    // A to-do the app proposes itself (daily plan, rescue), after the player's tap: logged in agent_actions
    // and applied with undo when the server build is signed in, a plain local to-do otherwise.
    // Resolves {duplicate: true} instead of adding a second copy.
    propose: async ({ title, dur, date = today, reason, explanation, focus = false }) => {
      if (hasOpenTodo(state, title, date)) return { duplicate: true };
      const c = ai.server ? await agentClient() : null;
      if (!c) {
        todoActions.add({ title, date, dur, fromAgent: true, ...(focus ? { focus: true } : {}) });
        return {};
      }
      const a = await recordTodo(c, { title, date, dur, reason, explanation, focus });
      const r = planApply(a, state, today);
      if (r.error) throw { code: "db_error" };
      update(r.patch);
      await markApplied(c, a.id, r.before, { outcomeDue: addDays(today, 14), action: a });
      reloadAgentLog();
      return {};
    },
  };

  const go = useCallback((v, habitId = null) => {
    setView(v);
    setFocusHabit(habitId);
    window.scrollTo(0, 0);
  }, []);

  // the month documents with stories and review texts for recent weeks
  const hasState = !!state;
  useEffect(() => {
    if (!hasState) return;
    store.loadMonth(monthKey(today));
    store.loadMonth(monthKey(addDays(today, -28)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasState, today]);

  // key moments
  useEffect(() => {
    if (!d || !state) return;
    const { moments, seen } = detectMoments({ seen: state.seen, timeline: d.timeline, companion: d.companion, streak: d.streak, today });
    if (JSON.stringify(seen) === JSON.stringify(state.seen)) return;
    const recent = (state.moments || []).slice(-10).map((m) => m.quoteId);
    const found = moments.map((m, i) => ({
      ...m,
      id: uid("m"),
      day: today,
      quoteId: pickQuote(m.type, state.profile?.path, recent, `${today}-${i}-${m.type}`).id,
    }));
    update((s) => ({ ...s, seen, moments: [...(s.moments || []), ...found].slice(-40) }));
    if (found.length) setQueue((q) => [...q, ...found]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // ------------------------------------------------------------ actions

  const months = store.months;
  const recentStories = useMemo(() => {
    const all = Object.values(months)
      .filter(Boolean)
      .flatMap((m) => m.chapters || []);
    return all.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [months]);

  const checkIn = useCallback(
    (habitId) => {
      const h = state.habits.find((x) => x.id === habitId);
      const code = state.log?.[today]?.[habitId] || 0;
      setCode(habitId, code ? 0 : CODE.DONE);
      if (!code) toast({ title: `+${checkInGain(h, d.runMult)} momentum`, text: h.name, icon: Zap, tone: "gold", ms: 2200 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, today, d]
  );

  function setCode(habitId, code) {
    update((s) => {
      const day = { ...(s.log?.[today] || {}) };
      if (code) day[habitId] = code;
      else delete day[habitId];
      const log = { ...(s.log || {}) };
      if (Object.keys(day).length) log[today] = day;
      else delete log[today];
      return { ...s, log };
    });
  }

  function saveChapter(chapter) {
    const ym = monthKey(chapter.day);
    update((s) => ({ ...s, meta: { ...s.meta, months: uniq([...(s.meta?.months || []), ym]) } }));
    store.updateMonth(ym, (m) => ({ ...m, chapters: [...(m.chapters || []), chapter] }));
  }

  function saveHabit(habit, { keepOpen = false } = {}) {
    update((s) => {
      const exists = s.habits.some((h) => h.id === habit.id);
      return { ...s, habits: exists ? s.habits.map((h) => (h.id === habit.id ? habit : h)) : [...s.habits, habit] };
    });
    toast({ title: habitEd?.habit ? "Obicei actualizat" : "Obicei nou adăugat", text: habit.name, icon: CheckCircle2, tone: "mint", ms: 2200 });
    if (!keepOpen) setHabitEd(null);
  }

  function archiveHabit(habitId, archived) {
    update((s) => ({
      ...s,
      habits: s.habits.map((h) => (h.id === habitId ? { ...h, archivedAt: archived ? today : null } : h)),
    }));
    setHabitEd(null);
  }

  // dragging a habit block in the calendar moves its weekly slot: the day it was dragged from is replaced by the
  // day it was dropped on (and the hour changes when it is dropped at another time); a day that already has it refuses
  function moveHabit(habitId, fromDay, toDay, time) {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return;
    const from = weekday(fromDay);
    const to = weekday(toDay);
    // a day that already has the habit would swallow the one dragged from: leave everything as it is instead
    if (to !== from && habit.days.includes(to)) {
      toast({ title: "Nu s-a mutat", text: `${habit.name} e deja programat în ziua aceea`, icon: CalendarX, tone: "rose", ms: 2600 });
      return;
    }
    const days = [...new Set([...habit.days.filter((x) => x !== from), to])].sort();
    const nextTime = time || habit.time;
    if (from === to && nextTime === habit.time) return;
    update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === habitId ? { ...h, days, time: nextTime } : h)) }));
    toast({ title: "Obicei mutat", text: `${habit.name}: ${scheduleLabel(days)}${nextTime ? ` · ${fmt12(nextTime)}` : ""} (se repetă în fiecare săptămână)`, icon: CheckCircle2, tone: "mint", ms: 3200 });
  }

  // deleting drops the habit for good: its check-ins go with it and to-dos linked to it stay as plain to-dos
  function deleteHabit(habitId) {
    const name = state.habits.find((h) => h.id === habitId)?.name;
    update((s) => {
      const log = {};
      for (const [day, entries] of Object.entries(s.log || {})) {
        const { [habitId]: _gone, ...rest } = entries || {};
        if (Object.keys(rest).length) log[day] = rest;
      }
      return {
        ...s,
        habits: s.habits.filter((h) => h.id !== habitId),
        log,
        todos: (s.todos || []).map((t) => (t.habitId === habitId ? { ...t, habitId: null } : t)),
      };
    });
    toast({ title: "Obicei șters", text: name, icon: CheckCircle2, tone: "mint", ms: 2200 });
  }

  function saveTodo(todo) {
    update((s) => {
      const todos = s.todos || [];
      const exists = todos.some((t) => t.id === todo.id);
      return { ...s, todos: exists ? todos.map((t) => (t.id === todo.id ? todo : t)) : [...todos, todo] };
    });
    setTodoEd(null);
  }
  const goalActions = {
    add: ({ period, key, text }) =>
      update((s) => ({ ...s, goals: [...(s.goals || []), { id: uid("o"), period, key, text, done: false, doneOn: null, createdAt: today }].slice(-200) })),
    // a parent goal with its milestones, linked by parentId (see lib/milestones.js)
    addSet: (parent, children) =>
      update((s) => ({
        ...s,
        goals: [...(s.goals || []), ...milestoneSet(parent, children, (g) => ({ id: uid("o"), done: false, doneOn: null, createdAt: today, ...g }))].slice(-200),
      })),
    toggle: (id) => update((s) => ({ ...s, goals: (s.goals || []).map((g) => (g.id === id ? { ...g, ...statusPatch(g.done ? "open" : "done", today) } : g)) })),
    // status: "open" | "done" | "dropped"
    status: (id, status) => update((s) => ({ ...s, goals: (s.goals || []).map((g) => (g.id === id ? { ...g, ...statusPatch(status, today) } : g)) })),
    // link/unlink an existing todo ("todoIds") or habit ("habitIds")
    link: (id, field, itemId) =>
      update((s) => ({ ...s, goals: (s.goals || []).map((g) => (g.id === id && (field === "todoIds" || field === "habitIds") ? { ...g, [field]: toggleLink(g[field], itemId) } : g)) })),
    remove: (id) => update((s) => ({ ...s, goals: (s.goals || []).filter((g) => g.id !== id && g.parentId !== id) })),
    carry: (period, key, list) =>
      update((s) => ({ ...s, goals: [...(s.goals || []), ...carryCopies(list, period, key, today, () => uid("o"))].slice(-200) })),
  };
  const todoActions = {
    add: (t) => saveTodo({ id: uid("t"), title: "", date: today, time: null, dur: 30, done: false, doneOn: null, createdAt: today, ...t }),
    // `day` is the occurrence of a repeating to-do (calendar and lists pass it); defaults to today
    toggle: (id, day = today) => update((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? toggleDone(t, day) : t)) })),
    move: (id, date, time) => update((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, date, time: time === undefined ? t.time : time } : t)) })),
    remove: (id) => update((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) })),
    rename: (id, title) => update((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, title } : t)) })),
    edit: (todo) => setTodoEd(state.todos.find((t) => t.id === todo.id) || todo), // a series is edited as a whole, not as the day it was clicked on
    create: (draft) => setTodoEd({ id: uid("t"), title: "", date: today, time: null, dur: 30, done: false, doneOn: null, createdAt: today, ...draft, isNew: true }),
  };
  const rescue = rescueInfo(d, state, today);

  function applyRevive() {
    const offer = d.revive.offer;
    if (!offer?.affordable) return;
    update((s) => ({ ...s, streak: { ...(s.streak || {}), revived: { ...(s.streak?.revived || {}), ...Object.fromEntries(offer.days.map((day) => [day, today])) } } }));
    toast({ title: "Serie salvată!", text: `Ai folosit ${offer.days.length === 1 ? "un revive" : "două revive-uri"}. Seria continuă.`, icon: FlaskConical, tone: "mint" });
  }

  // The report is written by the AI or not at all: when it fails the card says so and the day stays open.
  async function runReview(day = today) {
    if (review.status === "running") return;
    if (!ai.available) {
      setReview({ status: "error", error: aiErrorCopy("unavailable") });
      return;
    }
    setReview({ status: "running", error: null });
    let result;
    try {
      result = await dailyReview(reviewPayload(state, d, day));
    } catch (e) {
      setReview({ status: "error", error: aiErrorCopy(e?.code || "upstream_error") || "AI-ul nu a răspuns de data asta." });
      return;
    }
    const ym = monthKey(day);
    update((s) => ({
      ...s,
      reviews: { ...(s.reviews || {}), [day]: { ai: result.ai ? result.score : null, at: new Date().toISOString() } },
      meta: { ...s.meta, months: uniq([...(s.meta?.months || []), ym]) },
    }));
    store.updateMonth(ym, (m) => ({
      ...m,
      reviews: { ...(m.reviews || {}), [day]: { summary: result.summary, highlight: result.highlight, tip: result.tip, ai: !!result.ai, score: result.score } },
    }));
    setReview({ status: "idle", error: null });
  }

  // run the evening review by itself when the player already allowed the AI
  const reviewMin = parseHM(state?.settings?.reviewTime || "21:00");
  useEffect(() => {
    if (!state || !d || !ai.available) return;
    if (state.settings?.autoReview === false || state.reviews?.[today] || now < reviewMin) return;
    if (autoTried.current === today) return;
    autoTried.current = today;
    permissionState("sample").then((st) => {
      if (st === "granted") runReview(today);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.available, now, today, !!state?.reviews?.[today]]);

  function startGame(draft) {
    let s = {
      v: STATE_VERSION,
      profile: { nick: draft.nick, path: draft.path, goal: draft.goal },
      companion: { name: "" },
      habits: draft.habits,
      log: {},
      reviews: {},
      todos: [],
      streak: { revived: {} },
      settings: { reviewTime: draft.reviewTime, autoReview: true, resetAfter: 3 },
      meta: { start: today, created: new Date().toISOString(), months: [] },
      groups: [],
      seen: null,
      moments: [],
    };
    if (draft.importOld && store.legacy) s.todos = [...legacyTodos(store.legacy, today), ...(s.todos || [])];
    update(() => s);
    go("home");
  }

  function wipeAll() {
    store.wipe(state?.meta?.months || []);
    setQueue([]);
    go("home");
  }

  // ------------------------------------------------------------ render

  if (state === undefined) return <Loading />;
  if (state === null) return <Onboarding onDone={startGame} store={store} today={today} legacy={store.legacy} />;
  if (!d) return <Loading />;

  const common = { state, d, today, go, ai, months, recentStories, onStateChange: update };
  const reviewInfo = { ...review, run: runReview, reviewMin, now };

  return (
    <Shell view={view} setView={go} onFocus={() => setFocusSetup(true)} onReview={() => !state.reviews?.[today] && runReview(today)} d={d} state={state} unread={groups.unread} mode={store.mode} saveStatus={store.saveStatus} now={now}>
      {view === "home" && (
        <Dashboard
          {...common}
          groups={groups}
          agent={agentActions}
          review={reviewInfo}
          onFocus={() => setFocusSetup(true)}
          onCheck={checkIn}
          onRevive={applyRevive}
          todo={todoActions}
          onAddHabit={() => setHabitEd({ tab: "catalog" })}
          rescue={rescue}
          onRescue={async (step) => {
            try {
              await agentActions.propose({
                title: step.title,
                date: step.date,
                dur: step.dur,
                reason: step.reason,
                explanation: { dataUsed: [step.source === "reset-risk" ? "risc de resetare a seriei" : "revenire după pauză"], confidence: "high", expectedEffect: "un pas mic ca să reiei ritmul" },
              });
              toast({ title: "Pasul de revenire este gata", text: step.title, icon: CalendarCheck, tone: "mint" });
            } catch (e) {
              toast({ title: "Nu am putut salva pasul", text: aiErrorCopy(e?.code), icon: CalendarCheck, tone: "rose" });
            }
          }}
        />
      )}
      {view === "habits" && (
        <Habits
          {...common}
          focus={focusHabit}
          setFocus={setFocusHabit}
          onCheck={checkIn}
          onAdd={() => setHabitEd({ tab: "catalog" })}
          onAddHabit={(habit) => saveHabit(habit, { keepOpen: true })}
          agent={agentActions}
          onEdit={(habit) => setHabitEd({ habit, tab: "custom" })}
          onArchive={archiveHabit}
          onDelete={deleteHabit}
        />
      )}
      {view === "companion" && (
        <Companion
          {...common}
          loadMonth={store.loadMonth}
          onRename={(name) => update((s) => ({ ...s, companion: { ...s.companion, name } }))}
        />
      )}
      {view === "chat" && (
        <Chat
          {...common}
          goals={goalActions}
          todo={todoActions}
          agent={agentActions}
          onAddHabit={saveHabit}
        />
      )}
      {view === "group" && <Group {...common} groups={groups} />}
      {view === "plan" && <Planner {...common} todo={todoActions} goals={goalActions} agent={agentActions} onFocusTodo={(t) => { setFocusPrefill({ work: t.dur || 25 }); setFocusSetup(true); }} onMoveHabit={moveHabit} />}
      {view === "stats" && <Stats {...common} mode={store.mode} saveStatus={store.saveStatus} onFocus={() => setFocusSetup(true)} />}
      {view === "settings" && (
        <SettingsScreen
          {...common}
          mode={store.mode}
          env={store.env}
          onChange={(fn) => update(fn)}
          onDeleteAccount={() =>
            setConfirm({
              title: "Ștergi contul?",
              text: "Se șterg contul și toate datele tale, definitiv. Nu se poate anula.",
              label: "Șterge contul",
              phrase: "Elimin contul definitiv",
              run: () => deleteAccount(store.env),
            })
          }
          onWipe={() =>
            setConfirm({
              title: "Ștergi toate datele?",
              text: "Se șterg obiceiurile, istoricul, to-do-urile și personajul. Nu se poate anula.",
              label: "Șterge tot",
              phrase: "Resetez toate datele",
              run: wipeAll,
            })
          }
        />
      )}

      <FocusSetup key={String(focusSetup)} open={focusSetup} initial={focusPrefill} onStart={beginFocus} onClose={() => { setFocusSetup(false); setFocusPrefill(null); }} />
      {focusSession && <FocusMode session={focusSession} onChange={changeFocus} onFinish={finishFocus} todos={state.todos} today={today} todoActions={todoActions} />}
      {queue[0] && (
        <MomentModal
          key={queue[0].id}
          moment={queue[0]}
          state={state}
          d={d}
          ai={ai}
          recentStories={recentStories}
          onName={(name) => update((s) => ({ ...s, companion: { ...s.companion, name } }))}
          onChapter={saveChapter}
          onClose={() => setQueue((q) => q.slice(1))}
        />
      )}
      {habitEd && (
        <HabitEditor
          open
          initial={habitEd.habit}
          tab={habitEd.tab}
          state={state}
          today={today}
          onSave={saveHabit}
          onArchive={archiveHabit}
          onClose={() => setHabitEd(null)}
        />
      )}
      {todoEd && <TodoEditor todo={todoEd} state={state} today={today} onSave={saveTodo} onDelete={(id) => (todoActions.remove(id), setTodoEd(null))} onClose={() => setTodoEd(null)} />}
      <Confirm
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.label}
        phrase={confirm?.phrase}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      >
        {confirm?.text}
      </Confirm>
    </Shell>
  );
}
