import React from "react";
import { AlertTriangle, CalendarCheck, ChevronDown, FlaskConical, Gift, Plus, Swords, Timer } from "lucide-react";
import { Button, Panel, SectionTitle } from "../components/ui.jsx";
import { CompanionCard, QuestCard, ReviewCard } from "../components/Cards.jsx";
import { SchoolCard } from "../components/SchoolCard.jsx";
import { fmtDay, fmtLong } from "../lib/dates.js";
import { RULES } from "../lib/engine.js";
import { tr } from "../lib/i18n.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return tr("Noapte bună");
  if (h < 11) return tr("Bună dimineața");
  if (h < 18) return tr("Bună ziua");
  return tr("Bună seara");
}

function Hero({ state, d, today, onFocus }) {
  const { entry, week, streak } = d;
  const nick = state.profile?.nick || "aventurierule";
  const left = d.missions.left;
  const sub =
    d.scheduled.length === 0
      ? tr("Azi nu ai misiuni programate. Poți face oricare obicei ca bonus.")
      : left === 0
        ? tr("Toate misiunile de azi sunt gata. Cufărul zilei e deschis!")
        : tr("Mai ai {left} {v} azi. {v2}", { left, v: left === 1 ? tr("misiune") : tr("misiuni"), v2: d.companion.stage.id === "egg" ? tr("Prima bifă îți încălzește oul.") : tr("Fiecare bifă îl ajută pe ") + (d.companion.name || tr("personajul tău")) + tr(" să crească.") });
  return (
    <Panel className="p-5 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-dim">{fmtLong(today)}</p>
      <h1 className="font-display mt-1 text-2xl leading-tight text-ink sm:text-3xl">
        {greeting()}, {nick}!
      </h1>
      <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-body">{sub}</p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-dim">
        <span>{tr("Azi")} <b className="tabular text-ink">+{entry?.gain ?? 0}</b></span>
        <span>{tr("Săptămâna asta")} <b className="tabular text-ink">+{week}</b></span>
        <span>{tr("Serie")} <b className="tabular text-ink">{streak.current} {streak.current === 1 ? tr("zi") : tr("zile")}</b></span>
      </p>
      <Button variant="violet" size="sm" icon={Timer} className="mt-4 lg:hidden" onClick={onFocus}>
        Focus
      </Button>
    </Panel>
  );
}

function ReviveBanner({ d, onRevive }) {
  const offer = d.revive.offer;
  const n = offer.days.length;
  return (
    <Panel tone="mint" className="flex flex-wrap items-center gap-4 p-4">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint/15 text-mint ring-1 ring-mint/30">
        <FlaskConical size={24} aria-hidden="true" />
      </span>
      <div className="min-w-[220px] flex-1">
        <div className="font-extrabold text-ink">{tr("Seria ta de {streakBefore} zile s-a întrerupt", { streakBefore: offer.streakBefore })}</div>
        <p className="text-sm text-body">
          {n === 1 ? tr("Ai sărit peste {fmtDay}.", { fmtDay: fmtDay(offer.days[0]) }) : tr("Ai sărit peste {fmtDay} și {fmtDay2}.", { fmtDay: fmtDay(offer.days[0]), fmtDay2: fmtDay(offer.days[1]) })}{" "}
          {offer.affordable
            ? tr("Un revive o repară{v}. Ai {left} luna aceasta.", { v: n > 1 ? tr(" (îți trebuie două)") : "", left: d.revive.left })
            : tr("Nu mai ai destule revive-uri luna aceasta, dar seria nouă începe chiar azi.")}
        </p>
      </div>
      {offer.affordable && (
        <Button id="use-revive" variant="mint" icon={FlaskConical} onClick={onRevive}>{tr("Folosește {v}", { v: n === 1 ? tr("revive") : tr("2 revive-uri") })}</Button>
      )}
    </Panel>
  );
}

function ResetWarning({ d }) {
  if (!d.resetRisk) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-ember/10 p-4 ring-1 ring-ember/30">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
      <p className="text-sm font-semibold text-body">{tr("{span} Ai avut {quietDays} {v} fără activitate. Dacă azi bifezi un singur lucru, momentum-ul tău de {v2} rămâne; altfel pornește din nou de la zero.", { span: <span className="font-extrabold text-ink">{tr("Ultima zi înainte de resetare.")}</span>, quietDays: d.quietDays, v: d.quietDays === 1 ? tr("zi") : tr("zile"), v2: d.timeline.byDay[d.today]?.momentum ?? 0 })}</p>
    </div>
  );
}

function RescueCard({ rescue, onRescue, goalReminders = [], goalActions }) {
  if (!rescue) return null;
  return (
    <Panel tone="mint" className="flex flex-wrap items-center gap-3 p-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink">{tr("Un pas mic pentru revenire")}</span>
        <span className="block text-sm font-semibold text-body">{rescue.reason}</span>
      </span>
      <Button variant="mint" size="sm" icon={CalendarCheck} onClick={() => onRescue?.(rescue)}>{tr("Adaugă pasul")}</Button>
    </Panel>
  );
}

export default function Dashboard({ state, d, today, go, ai, months, onStateChange, recentStories, groups, review, onFocus, onCheck, onRevive, onAddHabit, rescue, onRescue, goalReminders = [], goalActions, onAskMolt, moltWaiting = 0 }) {
  const chestOpen = d.missions.total > 0 && d.missions.done === d.missions.total;
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="min-w-0 space-y-5 lg:col-span-8">
        <Hero state={state} d={d} today={today} onFocus={onFocus} />
        {/* one notice at a time, the most urgent first */}
        {d.revive.offer ? <ReviveBanner d={d} onRevive={onRevive} /> : d.resetRisk ? <ResetWarning d={d} /> : <RescueCard rescue={rescue} onRescue={onRescue} />}

        <Panel className="p-4 sm:p-5">
          <SectionTitle
            icon={Swords}
            sub={tr("{doneScheduled} din {length} misiuni programate azi", { doneScheduled: d.missions.done, length: d.missions.total })}
            action={
              <Button variant="ghost" size="sm" icon={Plus} onClick={onAddHabit}>{tr("Obicei nou")}</Button>
            }
          >{tr("Misiunile zilei")}</SectionTitle>
          <div className="space-y-2.5">
            {d.scheduled.map(({ h, code, scheduled }) => (
              <QuestCard key={h.id} h={h} code={code} scheduled={scheduled} runMult={d.runMult} doneBases={d.doneBases} onCheck={onCheck} onOpen={() => go("habits", h.id)} />
            ))}
            {d.scheduled.length === 0 && <p className="inset p-4 text-center text-sm font-semibold text-dim">{tr("Nicio misiune programată azi. Zi de odihnă sau de bonusuri!")}</p>}
          </div>
          {d.optional.length > 0 && (
            // the optional habits live inside this grey box and unfold with it
            <details className="group mt-4 rounded-xl border border-dashed border-edge-hi bg-well/60 transition-colors open:border-solid hover:border-gold/60">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-well">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CalendarCheck size={16} className="shrink-0 text-gold-hi" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-ink">{tr("Opționale azi {span}", { span: <span className="text-dim">({d.optional.length})</span> })}</span>
                    <span className="block text-xs font-semibold text-dim">{tr("Bonusuri fără obligație: bifate, aduc momentum în plus")}</span>
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-dim group-hover:text-ink">
                  <span className="group-open:hidden">{tr("Arată")}</span>
                  <span className="hidden group-open:inline">{tr("Ascunde")}</span>
                  <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                </span>
              </summary>
              <div className="space-y-2.5 px-2.5 pb-2.5 pt-1">
                {d.optional.map(({ h, code, scheduled }) => (
                  <QuestCard key={h.id} h={h} code={code} scheduled={scheduled} runMult={d.runMult} doneBases={d.doneBases} onCheck={onCheck} onOpen={() => go("habits", h.id)} />
                ))}
              </div>
            </details>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-extrabold ring-1 ${
                chestOpen ? "bg-gold/15 text-gold-hi ring-gold/40" : "bg-well text-dim ring-edge"
              }`}
              title={tr("Cufărul zilei: toate misiunile programate bifate")}
            >
              <Gift size={16} className={chestOpen ? "anim-flicker text-gold" : ""} aria-hidden="true" />
              {chestOpen ? tr("Cufăr deschis · +{chestXp}", { chestXp: RULES.chestXp }) : tr("Cufărul zilei · +{chestXp}", { chestXp: RULES.chestXp })}
            </div>
          </div>
        </Panel>

        <SchoolCard state={state} today={today} onStateChange={onStateChange} />
      </div>

      <div className="min-w-0 space-y-5 lg:col-span-4">
        <CompanionCard c={d.companion} path={state.profile.path} ai={ai} waiting={moltWaiting} onAsk={onAskMolt} onChat={() => go("molt", "chat")} />
        <ReviewCard d={d} state={state} months={months} review={review} ai={ai} today={today} />
      </div>
    </div>
  );
}
