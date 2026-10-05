import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, History, Moon, Plus, Sparkles, Wand2 } from "lucide-react";
import { Button, Chip, Corners, Field, Gems, Toggle } from "../components/ui.jsx";
import { Sprite } from "../components/Sprite.jsx";
import { HABIT_ICONS, iconFor } from "../components/icons.js";
import { DayPicker, DifficultyPicker, scheduleLabel } from "../components/HabitEditor.jsx";
import { CATALOG, MAX_HABITS, PATHS, PATH_LIST, RECOMMENDED, habitFromCatalog, nextColor, uid } from "../lib/catalog.js";
import { legacyHabits, legacySummary } from "../lib/legacy.js";

const GOAL_EXAMPLES = {
  sport: "Să alerg primul meu semimaraton până în primăvară.",
  studiu: "Să intru în lotul național la olimpiada de matematică.",
  bani: "Să strâng un fond de urgență și să-mi lansez primul proiect.",
  minte: "Să dorm bine și să am mai multă liniște în fiecare zi.",
  creativ: "Să termin un album de desene până la vară.",
};
const TIMES = ["18:00", "19:00", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"];
const STEPS = ["Bun venit", "Drumul", "Obiectivul", "Misiunile", "Ritualul", "Oul"];

function StepDots({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Pasul ${step + 1} din ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <li key={s} className={`h-2.5 rounded-sm transition-all ${i === step ? "w-8 bg-gold" : i < step ? "w-2.5 bg-gold/60" : "w-2.5 bg-edge-hi"}`} title={s} />
      ))}
    </ol>
  );
}

function CustomHabitForm({ path, habits, onAdd, onCancel }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("target");
  const [diff, setDiff] = useState(2);
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [target, setTarget] = useState("");
  const keys = Object.keys(HABIT_ICONS).slice(0, 20);
  return (
    <div className="inset space-y-4 p-4">
      <Field label="Nume" htmlFor="ob-habit-name">
        <input id="ob-habit-name" className="field" value={name} maxLength={40} placeholder="ex.: Înot" onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => {
          const Icon = HABIT_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              aria-label={k}
              aria-pressed={icon === k}
              onClick={() => setIcon(k)}
              className={`focus-ring grid h-9 w-9 place-items-center rounded-lg ${icon === k ? "bg-gold text-[#2a1b00]" : "bg-panel text-dim ring-1 ring-edge"}`}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <DifficultyPicker value={diff} onChange={setDiff} />
      <DayPicker value={days} onChange={setDays} idPrefix="ob-day" />
      <Field label="Țintă" htmlFor="ob-habit-target">
        <input id="ob-habit-target" className="field" value={target} maxLength={60} placeholder="ex.: 1 km" onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Renunță
        </Button>
        <Button
          size="sm"
          icon={Check}
          disabled={name.trim().length < 2 || !days.length}
          onClick={() =>
            onAdd({
              id: uid("h"),
              name: name.trim(),
              icon,
              cat: path,
              diff,
              days,
              time: null,
              target: target.trim() || "o dată pe zi",
              proofHint: "",
              color: nextColor(habits),
            })
          }
        >
          Adaugă
        </Button>
      </div>
    </div>
  );
}

export default function Onboarding({ onDone, store, today, legacy }) {
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState("");
  const [path, setPath] = useState(null);
  const [goal, setGoal] = useState("");
  const [habits, setHabits] = useState([]);
  const [custom, setCustom] = useState(false);
  const [reviewTime, setReviewTime] = useState("21:00");
  const [demo, setDemo] = useState(true);
  const [filter, setFilter] = useState("rec");
  const [importOld, setImportOld] = useState(true);
  const fromLegacy = useRef(false);
  const old = legacy ? legacySummary(legacy) : null;

  // data from the first version of the app: goal and habits come pre-filled
  useEffect(() => {
    if (!legacy || fromLegacy.current) return;
    fromLegacy.current = true;
    setDemo(false);
    if (legacy.goal) setGoal((g) => g || legacy.goal);
    const hs = legacyHabits(legacy, today);
    if (hs.length) setHabits((cur) => (cur.length ? cur : hs));
  }, [legacy, today]);

  // prefill the name from the claude.ai profile when there is one
  useEffect(() => {
    const user = store.env.current?.user;
    if (!user || typeof user.name !== "function") return;
    user
      .name()
      .then((n) => n && setNick((cur) => cur || n.split(" ")[0]))
      .catch(() => {});
  }, [store]);

  const choosePath = (p) => {
    setPath(p);
    if (fromLegacy.current && importOld && habits.length) return;
    if (!habits.length || habits.every((h) => h.catalogId)) {
      const recs = RECOMMENDED[p].map((id) => CATALOG.find((c) => c.id === id));
      const list = [];
      for (const c of recs) list.push(habitFromCatalog(c, list, today));
      setHabits(list);
    }
  };

  const toggleCatalog = (c) => {
    const has = habits.find((h) => h.catalogId === c.id);
    if (has) setHabits(habits.filter((h) => h !== has));
    else if (habits.length < MAX_HABITS) setHabits([...habits, habitFromCatalog(c, habits, today)]);
  };

  const shown = useMemo(() => {
    if (!path) return [];
    if (filter === "rec") return RECOMMENDED[path].map((id) => CATALOG.find((c) => c.id === id));
    return CATALOG.filter((c) => filter === "all" || c.cat === filter);
  }, [path, filter]);

  const canNext = [nick.trim().length > 0, !!path, goal.trim().length >= 4, habits.length > 0, true, true][step];
  const next = () =>
    step < STEPS.length - 1
      ? setStep(step + 1)
      : onDone({ nick: nick.trim(), path, goal: goal.trim(), habits: habits.map((h) => ({ ...h, cat: h.catalogId ? h.cat : h.cat || path })), reviewTime, demo, importOld: !!old && importOld });

  const eggPath = path || "creativ";
  let content;
  if (step === 0) {
    content = (
      <div className="grid items-center gap-6 sm:grid-cols-[auto,1fr]">
        <div className="pedestal mx-auto rounded-full p-4">
          <Sprite path={eggPath} stage="egg" size={160} label="Un ou misterios" />
        </div>
        <div className="space-y-4">
          <h1 className="font-pixel text-3xl leading-tight text-ink sm:text-4xl">Fiecare erou începe cu un ou.</h1>
          <p className="text-[15px] leading-relaxed text-body">
            Bifezi obiceiuri, trimiți dovezi și îți crești <span className="font-extrabold text-gold-hi">momentum-ul</span>. Din ou iese un personaj care evoluează cu
            fiecare dovadă, doarme când lipsești și se bucură când revii.
          </p>
          <Field label="Cum să-ți spunem?" htmlFor="ob-nick">
            <input id="ob-nick" className="field" value={nick} maxLength={24} placeholder="Numele sau porecla ta" onChange={(e) => setNick(e.target.value)} />
          </Field>
          {old && (
            <label htmlFor="ob-import" className="flex items-start justify-between gap-4 rounded-2xl bg-mint/10 p-4 ring-1 ring-mint/30">
              <span className="flex gap-3">
                <History size={20} className="mt-0.5 shrink-0 text-mint" aria-hidden="true" />
                <span>
                  <span className="block font-extrabold text-ink">Am găsit datele din prima versiune</span>
                  <span className="block text-xs font-semibold text-body">
                    {old.todos} to-do-uri ({old.open} nefăcute), {old.habits} obiceiuri{old.goal ? " și obiectivul tău" : ""}. Le aducem în aplicația nouă; istoricul vechi de bife nu se
                    mută.
                  </span>
                </span>
              </span>
              <Toggle id="ob-import" checked={importOld} onChange={setImportOld} label="Importă datele vechi" />
            </label>
          )}
        </div>
      </div>
    );
  } else if (step === 1) {
    content = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="pedestal rounded-full p-2">
            <Sprite path={eggPath} stage="egg" size={96} mood="joy" />
          </div>
          <div>
            <h1 className="font-pixel text-3xl text-ink">Alege-ți drumul</h1>
            <p className="text-sm text-body">Drumul hotărăște ce personaj iese din ou. Obiceiurile le poți amesteca oricum.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PATH_LIST.map((p) => {
            const Icon = iconFor(p.icon === "book" ? "book" : p.icon);
            const on = path === p.id;
            return (
              <button
                key={p.id}
                id={`path-${p.id}`}
                type="button"
                aria-pressed={on}
                onClick={() => choosePath(p.id)}
                className={`focus-ring relative flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${
                  on ? "border-gold bg-gold/10 shadow-[0_4px_0_#a8740a]" : "border-edge bg-panel-hi/60 hover:border-edge-hi"
                }`}
              >
                <Sprite path={p.id} stage="apprentice" size={64} still />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-extrabold text-ink">
                    <Icon size={15} style={{ color: p.color }} aria-hidden="true" /> {p.label}
                  </span>
                  <span className="block font-pixel text-lg leading-tight" style={{ color: p.color }}>
                    {p.cls}
                  </span>
                  <span className="block text-xs font-semibold text-dim">{p.pitch}</span>
                </span>
                {on && <Check size={18} className="absolute right-3 top-3 text-gold" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (step === 2) {
    content = (
      <div className="space-y-4">
        <h1 className="font-pixel text-3xl text-ink">Care e obiectivul tău?</h1>
        <p className="text-sm text-body">O propoziție. AI-ul o folosește în rapoartele de seară și în povestea personajului.</p>
        <textarea id="ob-goal" className="field min-h-[110px] text-base" value={goal} maxLength={160} placeholder={GOAL_EXAMPLES[path]} onChange={(e) => setGoal(e.target.value)} />
        <button type="button" className="text-xs font-bold text-dim underline hover:text-ink" onClick={() => setGoal(GOAL_EXAMPLES[path])}>
          Folosește exemplul
        </button>
      </div>
    );
  } else if (step === 3) {
    content = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-pixel text-3xl text-ink">Primele misiuni</h1>
            <p className="text-sm text-body">Alege din catalog sau creează unele proprii. Le poți schimba oricând.</p>
          </div>
          <Chip tone="gold">
            {habits.length} / {MAX_HABITS} alese
          </Chip>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "rec", label: "Recomandate" }, { id: "all", label: "Toate" }, ...PATH_LIST].map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={filter === p.id}
              onClick={() => setFilter(p.id)}
              className={`focus-ring rounded-full px-3 py-1.5 text-xs font-extrabold ${filter === p.id ? "bg-gold text-[#2a1b00]" : "text-dim ring-1 ring-edge hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {shown.map((c) => {
            const Icon = iconFor(c.icon);
            const on = habits.some((h) => h.catalogId === c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCatalog(c)}
                className={`focus-ring flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-gold bg-gold/10" : "border-edge bg-panel-hi/50 hover:border-edge-hi"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${PATHS[c.cat].color}22`, color: PATHS[c.cat].color }}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-ink">{c.name}</span>
                  <span className="flex items-center gap-2 text-[11px] font-bold text-dim">
                    <Gems n={c.diff} size={10} /> {scheduleLabel(c.days)}
                  </span>
                </span>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${on ? "bg-gold text-[#2a1b00]" : "ring-1 ring-edge-hi"}`}>{on && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span>
              </button>
            );
          })}
        </div>
        {habits.filter((h) => !h.catalogId).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {habits
              .filter((h) => !h.catalogId)
              .map((h) => (
                <Chip key={h.id} tone="violet" icon={Wand2}>
                  {h.name}
                </Chip>
              ))}
          </div>
        )}
        {custom ? (
          <CustomHabitForm
            path={path}
            habits={habits}
            onCancel={() => setCustom(false)}
            onAdd={(h) => {
              setHabits([...habits, { ...h, createdAt: today }]);
              setCustom(false);
            }}
          />
        ) : (
          <Button variant="ghost" size="sm" icon={Plus} disabled={habits.length >= MAX_HABITS} onClick={() => setCustom(true)}>
            Creează un obicei personalizat
          </Button>
        )}
      </div>
    );
  } else if (step === 4) {
    content = (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet/15 text-violet-hi ring-1 ring-violet/30">
            <Moon size={24} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-pixel text-3xl text-ink">Ritualul de seară</h1>
            <p className="text-sm text-body">La ora aleasă, AI-ul face un rezumat al zilei și îi dă un scor care intră în momentum.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={reviewTime === t}
              onClick={() => setReviewTime(t)}
              className={`focus-ring rounded-xl px-4 py-2.5 font-pixel text-lg transition ${reviewTime === t ? "bg-gold text-[#2a1b00] shadow-[0_3px_0_#a8740a]" : "bg-[#120f29] text-body ring-1 ring-edge hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="inset space-y-2 p-4 text-sm text-body">
          <p>
            <span className="font-extrabold text-ink">Cum crește momentum-ul:</span> fiecare misiune bifată aduce puncte, dovezile verificate aduc ×1,5, iar zilele la
            rând adaugă până la +40%.
          </p>
          <p>
            <span className="font-extrabold text-ink">Cum scade:</span> o zi ratată scade puțin. După 3 zile la rând fără nicio activitate, momentum-ul pornește din nou de
            la zero. Personajul nu moare niciodată: doar doarme până revii.
          </p>
          <p>
            <span className="font-extrabold text-ink">Seria:</span> ai 2 revive-uri pe lună ca s-o salvezi după o zi ratată.
          </p>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-[#120f29] p-4 ring-1 ring-edge" htmlFor="ob-demo">
          <span>
            <span className="block font-extrabold text-ink">Pornește cu 3 săptămâni de date demonstrative</span>
            <span className="block text-xs font-semibold text-dim">Ca să vezi graficele, o resetare și povestea. Le ștergi oricând din Setări.</span>
          </span>
          <Toggle id="ob-demo" checked={demo} onChange={setDemo} label="Date demonstrative" />
        </label>
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="pedestal rounded-full px-10 pt-4">
          <Sprite path={path} stage="egg" mood="joy" size={192} crack={demo ? 2 : 0} label={`Oul tău de ${PATHS[path].cls}`} />
        </div>
        <h1 className="font-pixel text-3xl text-ink">Acesta e oul tău</h1>
        <p className="max-w-md text-[15px] leading-relaxed text-body">
          {PATHS[path].egg} Se deschide după primele dovezi, iar apoi evoluează: Pui, Ucenic, Adept, Maestru și, într-o zi, Legendă.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip tone="gold" icon={Sparkles}>
            {habits.length} misiuni
          </Chip>
          <Chip tone="violet">Raport la {reviewTime}</Chip>
          {demo && <Chip tone="mint">cu date demonstrative</Chip>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-3 py-8 sm:px-6">
      <div className="relative w-full max-w-3xl">
        <Corners tone="gold" />
        <div className="panel panel-gold p-5 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="font-pixel text-lg font-bold tracking-wide text-gold">MOMENTUM</div>
            <StepDots step={step} />
          </div>
          {content}
          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
                Înapoi
              </Button>
            ) : (
              <span />
            )}
            <Button id="ob-next" size="lg" iconRight={step === STEPS.length - 1 ? Sparkles : ArrowRight} disabled={!canNext} onClick={next}>
              {step === 0 ? "Începe aventura" : step === STEPS.length - 1 ? "Intră în joc" : "Continuă"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
