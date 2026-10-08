import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FlaskConical, Leaf, Zap } from "lucide-react";
import { useAppStore } from "./lib/store.js";
import { checkInGain, derive, reviewPayload } from "./lib/derive.js";
import { CODE, VERDICT_CODE } from "./lib/engine.js";
import { addDays, monthKey, nowMinutes, parseHM, todayKey } from "./lib/dates.js";
import { detectMoments } from "./lib/moments.js";
import { pickQuote } from "./lib/quotes.js";
import { aiErrorCopy, aiStatus, dailyReview, templateReview } from "./lib/ai.js";
import { permissionState } from "./lib/platform.js";
import { useGroups } from "./lib/groups.js";
import { uid } from "./lib/catalog.js";
import { legacyTodos } from "./lib/legacy.js";
import { Confirm, ToastProvider, useToast } from "./components/ui.jsx";
import { deleteAccount } from "./lib/account.js";
import { Shell } from "./components/Shell.jsx";
import { ProofModal } from "./components/ProofModal.jsx";
import { MomentModal } from "./components/MomentModal.jsx";
import { HabitEditor } from "./components/HabitEditor.jsx";
import { TodoEditor } from "./components/TodoEditor.jsx";
import Onboarding from "./screens/Onboarding.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Habits from "./screens/Habits.jsx";
import Companion from "./screens/Companion.jsx";
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
  const [ai, setAi] = useState({ available: false, images: false, checked: false });
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
  const groups = useGroups({ store, state, update, myStats: d?.publicStats, today });

  const [view, setView] = useState("home");
  const [focusHabit, setFocusHabit] = useState(null);
  const [proof, setProof] = useState(null); // { habitId } or { habitId: null } to pick
  const [habitEd, setHabitEd] = useState(null); // { habit?, tab? }
  const [todoEd, setTodoEd] = useState(null); // a draft to-do
  const [confirm, setConfirm] = useState(null);
  const [queue, setQueue] = useState([]);
  const [review, setReview] = useState({ status: "idle", error: null });
  const autoTried = useRef(null);

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
      .flatMap((m) => [...(m.proofs || []), ...(m.chapters || [])]);
    return all.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [months]);

  const checkIn = useCallback(
    (habitId) => {
      const h = state.habits.find((x) => x.id === habitId);
      const code = state.log?.[today]?.[habitId] || 0;
      if (code > CODE.DONE) {
        setConfirm({
          title: "Anulezi bifa?",
          text: "Misiunea are deja o dovadă. Dacă anulezi bifa, dovada rămâne în jurnal, dar nu mai aduce momentum și puncte de evoluție.",
          label: "Anulează bifa",
          run: () => setCode(habitId, 0),
        });
        return;
      }
      setCode(habitId, code ? 0 : CODE.DONE);
      if (!code) toast({ title: `+${checkInGain(h, CODE.DONE, d.runMult)} momentum`, text: h.name, icon: Zap, tone: "gold", ms: 2200 });
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

  function saveProof(record) {
    const ym = monthKey(record.day);
    update((s) => {
      const day = { ...(s.log?.[record.day] || {}), [record.habitId]: VERDICT_CODE[record.verdict] || CODE.SELF };
      return { ...s, log: { ...(s.log || {}), [record.day]: day }, meta: { ...s.meta, months: uniq([...(s.meta?.months || []), ym]) } };
    });
    store.updateMonth(ym, (m) => {
      const proofs = [...(m.proofs || []), record];
      // keep the document small when thumbnails are stored inline
      let size = JSON.stringify(proofs).length;
      for (const p of proofs) {
        if (size < 200000) break;
        if (p.thumb) {
          size -= p.thumb.length;
          p.thumb = null;
        }
      }
      return { ...m, proofs };
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

  function saveTodo(todo) {
    update((s) => {
      const todos = s.todos || [];
      const exists = todos.some((t) => t.id === todo.id);
      return { ...s, todos: exists ? todos.map((t) => (t.id === todo.id ? todo : t)) : [...todos, todo] };
    });
    setTodoEd(null);
  }
  const todoActions = {
    add: (t) => saveTodo({ id: uid("t"), title: "", date: today, time: null, dur: 30, done: false, doneOn: null, createdAt: today, ...t }),
    toggle: (id) =>
      update((s) => ({
        ...s,
        todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneOn: t.done ? null : today } : t)),
      })),
    move: (id, date, time) => update((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, date, time: time === undefined ? t.time : time } : t)) })),
    remove: (id) => update((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) })),
    edit: (todo) => setTodoEd(todo),
    create: (draft) => setTodoEd({ id: uid("t"), title: "", date: today, time: null, dur: 30, done: false, doneOn: null, createdAt: today, ...draft, isNew: true }),
  };

  function applyRevive() {
    const offer = d.revive.offer;
    if (!offer?.affordable) return;
    update((s) => ({ ...s, streak: { ...(s.streak || {}), revived: { ...(s.streak?.revived || {}), ...Object.fromEntries(offer.days.map((day) => [day, today])) } } }));
    toast({ title: "Serie salvată!", text: `Ai folosit ${offer.days.length === 1 ? "un revive" : "două revive-uri"}. Seria continuă.`, icon: FlaskConical, tone: "mint" });
  }

  async function runReview(day = today, { allowTemplate = false } = {}) {
    if (review.status === "running") return;
    setReview({ status: "running", error: null });
    const payload = reviewPayload(state, d, day);
    let result = null;
    let error = null;
    if (ai.available) {
      try {
        result = await dailyReview(payload);
      } catch (e) {
        error = e?.code || "upstream_error";
      }
    }
    if (!result && error && !allowTemplate) {
      setReview({ status: "error", error: aiErrorCopy(error) || "AI-ul nu a răspuns de data asta." });
      return;
    }
    if (!result) result = { ...templateReview(payload, d.timeline.byDay[day]?.computed ?? 0), score: null, ai: false };
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

  const common = { state, d, today, go, ai, months, recentStories };
  const openProof = (habitId = null) => setProof({ habitId });
  const reviewInfo = { ...review, run: runReview, reviewMin, now };

  return (
    <Shell view={view} setView={go} onReview={() => !state.reviews?.[today] && runReview(today)} d={d} state={state} unread={groups.unread} mode={store.mode} saveStatus={store.saveStatus} now={now}>
      {view === "home" && (
        <Dashboard
          {...common}
          groups={groups}
          review={reviewInfo}
          onCheck={checkIn}
          onProof={openProof}
          onRevive={applyRevive}
          todo={todoActions}
          onAddHabit={() => setHabitEd({ tab: "catalog" })}
        />
      )}
      {view === "habits" && (
        <Habits
          {...common}
          focus={focusHabit}
          setFocus={setFocusHabit}
          onCheck={checkIn}
          onProof={openProof}
          onAdd={() => setHabitEd({ tab: "catalog" })}
          onEdit={(habit) => setHabitEd({ habit, tab: "custom" })}
          onArchive={archiveHabit}
          loadMonth={store.loadMonth}
        />
      )}
      {view === "companion" && (
        <Companion
          {...common}
          loadMonth={store.loadMonth}
          onProof={openProof}
          onRename={(name) => update((s) => ({ ...s, companion: { ...s.companion, name } }))}
        />
      )}
      {view === "group" && <Group {...common} groups={groups} mode={store.mode} />}
      {view === "plan" && <Planner {...common} todo={todoActions} />}
      {view === "stats" && <Stats {...common} mode={store.mode} saveStatus={store.saveStatus} />}
      {view === "settings" && (
        <SettingsScreen
          {...common}
          mode={store.mode}
          env={store.env}
          onChange={(fn) => update(fn)}
          onDeleteAccount={() =>
            setConfirm({
              title: "Ștergi contul?",
              text: "Se șterg contul, toate datele și toate fișierele tale, definitiv. Nu se poate anula.",
              label: "Șterge contul",
              run: () => deleteAccount(store.env),
            })
          }
          onWipe={() =>
            setConfirm({
              title: "Ștergi toate datele?",
              text: "Se șterg obiceiurile, istoricul, dovezile, to-do-urile și personajul. Nu se poate anula.",
              label: "Șterge tot",
              run: wipeAll,
            })
          }
        />
      )}

      <ProofModal
        open={!!proof}
        habitId={proof?.habitId}
        state={state}
        d={d}
        today={today}
        ai={ai}
        env={store.env}
        recentStories={recentStories}
        onSave={saveProof}
        onClose={() => setProof(null)}
      />
      {queue[0] && !proof && (
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
