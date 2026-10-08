import React from "react";
import { AlertTriangle, CalendarCheck, Flame, FlaskConical, Gift, Plus, Swords, TrendingUp, Zap } from "lucide-react";
import { Bar, Button, Chip, LevelBadge, Panel, SectionTitle } from "../components/ui.jsx";
import { CompanionCard, GroupMini, QuestCard, ReviewCard, TodayTodos } from "../components/Cards.jsx";
import { fmtDay, fmtLong } from "../lib/dates.js";
import { RULES } from "../lib/engine.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Noapte bună";
  if (h < 11) return "Bună dimineața";
  if (h < 18) return "Bună ziua";
  return "Bună seara";
}

function Hero({ state, d, today }) {
  const { level, entry, week, streak } = d;
  const nick = state.profile?.nick || "aventurierule";
  const left = d.scheduled.length - d.doneScheduled;
  const sub =
    d.scheduled.length === 0
      ? "Azi nu ai misiuni programate. Poți face oricare obicei ca bonus."
      : left === 0
        ? "Toate misiunile de azi sunt gata. Cufărul zilei e deschis!"
        : `Mai ai ${left} ${left === 1 ? "misiune" : "misiuni"} azi. ${d.companion.stage.id === "egg" ? "Prima dovadă îți încălzește oul." : "Fiecare dovadă îl ajută pe " + (d.companion.name || "personajul tău") + " să crească."}`;
  return (
    <Panel tone="gold" corners className="overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-wrap items-center gap-5 sm:gap-6">
        <div className="min-w-0 basis-full sm:min-w-[240px] sm:flex-1 sm:basis-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-gold">{fmtLong(today)}</p>
          <h1 className="font-pixel mt-1 text-3xl leading-tight text-ink sm:text-4xl">
            {greeting()}, {nick}!
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-body">{sub}</p>
        </div>
        <div className="flex w-full items-center gap-4 sm:w-auto">
          <LevelBadge lvl={level.lvl} size={76} />
          <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-dim">Momentum · {level.name}</div>
            <div className="font-pixel tabular text-4xl leading-none text-ink">{entry?.momentum ?? 0}</div>
            <Bar value={level.progress} className="mt-2" label="Progres spre nivelul următor" />
            <div className="mt-1 text-xs font-bold text-dim">{level.next ? `${level.toNext} până la nivelul ${level.next.lvl}, ${level.next.name}` : "Ai atins nivelul maxim"}</div>
          </div>
        </div>
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <MiniStat icon={Zap} tone="text-gold" label="Azi" value={`+${entry?.gain ?? 0}`} sub={entry?.closed ? "zi închisă" : "provizoriu"} />
        <MiniStat icon={TrendingUp} tone="text-mint" label="Săptămâna asta" value={`+${week}`} sub="momentum" />
        <MiniStat icon={Flame} tone="text-ember" label="Serie" value={`${streak.current} ${streak.current === 1 ? "zi" : "zile"}`} sub={`record: ${streak.best}`} />
        <MiniStat icon={FlaskConical} tone="text-mint" label="Revive-uri" value={`${d.revive.left}/${RULES.revivesPerMonth}`} sub="luna aceasta" />
      </div>
    </Panel>
  );
}

function MiniStat({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className="inset flex items-center gap-3 px-3 py-2.5">
      <Icon size={20} className={tone} aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate text-[10px] font-extrabold uppercase tracking-wider text-dim">{label}</div>
        <div className="font-pixel tabular text-lg leading-tight text-ink">{value}</div>
        <div className="truncate text-[11px] font-semibold text-faint">{sub}</div>
      </div>
    </div>
  );
}

function ReviveBanner({ d, onRevive }) {
  const offer = d.revive.offer;
  if (!offer) return null;
  const n = offer.days.length;
  return (
    <Panel tone="mint" className="flex flex-wrap items-center gap-4 p-4">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint/15 text-mint ring-1 ring-mint/30">
        <FlaskConical size={24} aria-hidden="true" />
      </span>
      <div className="min-w-[220px] flex-1">
        <div className="font-extrabold text-ink">Seria ta de {offer.streakBefore} zile s-a întrerupt</div>
        <p className="text-sm text-body">
          {n === 1 ? `Ai sărit peste ${fmtDay(offer.days[0])}.` : `Ai sărit peste ${fmtDay(offer.days[0])} și ${fmtDay(offer.days[1])}.`}{" "}
          {offer.affordable
            ? `Un revive o repară${n > 1 ? " (îți trebuie două)" : ""}. Ai ${d.revive.left} luna aceasta.`
            : "Nu mai ai destule revive-uri luna aceasta, dar seria nouă începe chiar azi."}
        </p>
      </div>
      {offer.affordable && (
        <Button id="use-revive" variant="mint" icon={FlaskConical} onClick={onRevive}>
          Folosește {n === 1 ? "revive" : "2 revive-uri"}
        </Button>
      )}
    </Panel>
  );
}

function ResetWarning({ d }) {
  if (!d.resetRisk) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-ember/10 p-4 ring-1 ring-ember/30">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
      <p className="text-sm font-semibold text-body">
        <span className="font-extrabold text-ink">Ultima zi înainte de resetare.</span> Ai avut {d.quietDays} {d.quietDays === 1 ? "zi" : "zile"} fără activitate. Dacă azi bifezi un singur lucru, momentum-ul tău de{" "}
        {d.timeline.byDay[d.today]?.momentum ?? 0} rămâne; altfel pornește din nou de la zero.
      </p>
    </div>
  );
}

export default function Dashboard({ state, d, today, go, ai, months, recentStories, groups, review, onCheck, onProof, onRevive, todo, onAddHabit }) {
  const chestOpen = d.scheduled.length > 0 && d.doneScheduled === d.scheduled.length;
  const lastStory = [...recentStories].reverse().find((s) => s.story);
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="min-w-0 space-y-5 lg:col-span-8">
        <Hero state={state} d={d} today={today} />
        <ReviveBanner d={d} onRevive={onRevive} />
        <ResetWarning d={d} />

        <Panel className="p-4 sm:p-5">
          <SectionTitle
            icon={Swords}
            sub={`${d.doneScheduled} din ${d.scheduled.length} misiuni programate azi`}
            action={
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-extrabold ring-1 ${
                  chestOpen ? "bg-gold/15 text-gold-hi ring-gold/40" : "bg-[#120f29] text-dim ring-edge"
                }`}
                title="Cufărul zilei: toate misiunile programate bifate"
              >
                <Gift size={16} className={chestOpen ? "anim-flicker text-gold" : ""} aria-hidden="true" />
                {chestOpen ? `Cufăr deschis · +${RULES.chestXp}` : `Cufărul zilei · +${RULES.chestXp}`}
              </div>
            }
          >
            Misiunile zilei
          </SectionTitle>
          <div className="space-y-2.5">
            {d.scheduled.map(({ h, code, scheduled }) => (
              <QuestCard key={h.id} h={h} code={code} scheduled={scheduled} runMult={d.runMult} onCheck={onCheck} onProof={onProof} onOpen={() => go("habits", h.id)} />
            ))}
            {d.scheduled.length === 0 && <p className="inset p-4 text-center text-sm font-semibold text-dim">Nicio misiune programată azi. Zi de odihnă sau de bonusuri!</p>}
          </div>
          {d.optional.length > 0 && (
            <details className="mt-4 group">
              <summary className="cursor-pointer list-none text-xs font-extrabold uppercase tracking-wider text-dim hover:text-ink">
                <span className="inline-flex items-center gap-2">
                  <CalendarCheck size={14} aria-hidden="true" /> Opționale azi ({d.optional.length}) · bifează-le ca bonus
                </span>
              </summary>
              <div className="mt-2.5 space-y-2.5">
                {d.optional.map(({ h, code, scheduled }) => (
                  <QuestCard key={h.id} h={h} code={code} scheduled={scheduled} runMult={d.runMult} onCheck={onCheck} onProof={onProof} onOpen={() => go("habits", h.id)} />
                ))}
              </div>
            </details>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-dim">Dovezile verificate de AI dau ×1,5 momentum și puncte de evoluție.</p>
            <Button variant="ghost" size="sm" icon={Plus} onClick={onAddHabit}>
              Obicei nou
            </Button>
          </div>
        </Panel>

        <TodayTodos state={state} today={today} todo={todo} go={go} />
      </div>

      <div className="min-w-0 space-y-5 lg:col-span-4">
        <CompanionCard c={d.companion} path={state.profile.path} lastStory={lastStory} onOpen={() => go("companion")} onProof={() => onProof(null)} />
        <ReviewCard d={d} state={state} months={months} review={review} ai={ai} today={today} />
        <GroupMini groups={groups} go={go} />
      </div>
    </div>
  );
}
