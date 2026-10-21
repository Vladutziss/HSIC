import React, { useMemo, useState } from "react";
import { Activity, BarChart3, Bot, CalendarDays, Flame, Gauge, Quote, Sparkles, Trophy, Zap } from "lucide-react";
import { Chip, Empty, LevelBadge, Panel, SectionTitle, Skeleton, Stat, Tabs } from "../components/ui.jsx";
import { HEAT, HabitLines, Heatmap, MomentumChart, ScoreBars, heatLevel } from "../components/Charts.jsx";
import { MOMENT_META } from "../lib/moments.js";
import { quoteById } from "../lib/quotes.js";
import { LEVELS } from "../lib/engine.js";
import { FocusStats } from "../components/FocusStats.jsx";
import { useStats } from "../lib/useStats.js";
import { agentImpact } from "../lib/agentActions.js";
import { fmtDay, relDay } from "../lib/dates.js";
import { tr } from "../lib/i18n.js";

/** The coach, measured on this player: what it proposed, what they did with it, and the before/after of the accepted changes. */
function AgentImpact({ log }) {
  const m = agentImpact(log);
  if (!m.proposals) return null;
  return (
    <Panel className="p-5">
      <SectionTitle icon={Bot} tone="violet" sub={tr("Doar pe datele tale")}>{tr("Cum te ajută coach-ul")}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Chip tone="dim">{tr("{proposals} propuneri", { proposals: m.proposals })}</Chip>
        <Chip tone="mint">{tr("{applied} aplicate", { applied: m.applied })}</Chip>
        <Chip tone="dim">{tr("{rejected} respinse", { rejected: m.rejected })}</Chip>
      </div>
      <p className="mt-3 text-sm font-semibold text-body">
        {m.measured
          ? tr("Din {measured} schimbări măsurate: rata a crescut la {improved}, nu s-a văzut o diferență clară la {same}, a scăzut la {worse}.", { measured: m.measured, improved: m.improved, same: m.same, worse: m.worse })
          : tr("Efectul schimbărilor aplicate se măsoară după 14 zile.")}
      </p>
      <p className="mt-1 text-xs font-semibold text-dim">{tr("Comparație înainte/după pe tine. Nu dovedește că schimbarea a cauzat diferența.")}</p>
    </Panel>
  );
}

export default function Stats({ state, d, today, go, mode, saveStatus, ai, agent, onFocus }) {
  const { stats: s, loading } = useStats(state, today, mode, saveStatus);
  const [range, setRange] = useState(60);
  const [hidden, setHidden] = useState([]);
  const days = s.days;
  const shown = range === 0 ? days : days.slice(-range);
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const visible = habits.filter((h) => !hidden.includes(h.id));
  const byDay = useMemo(() => Object.fromEntries(days.map((x) => [x.day, x])), [days]);
  const moments = (state.moments || []).slice().reverse();

  const cell = (day) => {
    const e = byDay[day];
    if (!e) return { color: HEAT[0], title: tr("{fmtDay}: fără date", { fmtDay: fmtDay(day) }) };
    return { color: HEAT[heatLevel(e.closed || e.active ? e.score : 0)], title: tr("{fmtDay}: scor {score}{v}", { fmtDay: fmtDay(day), score: e.score, v: e.reset ? tr(" · resetare") : "" }) };
  };

  const tableRows = useMemo(() => days.slice(-14).reverse(), [days]);

  const head = (
    <div>
      <h1 className="font-pixel text-3xl text-ink">{tr("Statistici")}</h1>
      <p className="text-sm font-semibold text-dim">{tr("Momentum-ul general, fiecare obicei și scorurile zilnice.")}</p>
    </div>
  );
  if (loading)
    return (
      <div className="space-y-5" aria-busy="true">
        {head}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-60" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  if (!s.checkins && !days.some((x) => x.active))
    return (
      <div className="space-y-5">
        {head}
        <Panel>
          <Empty icon={BarChart3} title={tr("Încă nu sunt statistici")}>{tr("Bifează primul obicei sau termină un to-do și graficele apar aici.")}</Empty>
        </Panel>
        <FocusStats sessions={state.focusSessions || []} today={today} onFocus={onFocus} />
      </div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-3xl text-ink">{tr("Statistici")}</h1>
        <p className="text-sm font-semibold text-dim">{tr("Momentum-ul general, fiecare obicei și scorurile zilnice.")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Zap} tone="gold" label={tr("Momentum")} value={d.entry?.momentum ?? 0} sub={tr("nivel {lvl} · {name}", { lvl: d.level.lvl, name: d.level.name })} />
        <Stat icon={Trophy} tone="gold" label={tr("Cel mai bun nivel")} value={s.bestLevel} sub={tr("{n} puncte", { n: s.bestMomentum })} />
        <Stat icon={Flame} tone="ember" label={tr("Serie")} value={s.streak.current} sub={tr("record: {best} zile", { best: s.streak.best })} />
        <Stat icon={Activity} tone="mint" label={tr("Bifări")} value={s.checkins} sub={tr("în total")} />
        <Stat icon={Sparkles} tone="violet" label={tr("Puncte de evoluție")} value={s.evolution?.ep ?? s.evidence?.ep ?? 0} sub={tr("{name} · personajul tău", { name: d.companion.stage.name })} />
        <Stat icon={Gauge} tone="sky" label={tr("Scor mediu")} value={s.avg} sub={tr("ultimele 30 de zile")} />
      </div>

      <Panel tone="gold" corners className="p-4 sm:p-5">
        <SectionTitle
          icon={Zap}
          tone="gold"
          sub={tr("Liniile punctate sunt pragurile de nivel. Punctele roz marchează resetările după {resetAfter} zile fără activitate.", { resetAfter: s.resetAfter })}
          action={
            <Tabs
              size="sm"
              value={range}
              onChange={setRange}
              items={[
                { value: 30, label: tr("30 z") },
                { value: 60, label: tr("60 z") },
                { value: 90, label: tr("90 z") },
                { value: 0, label: tr("Tot") },
              ]}
            />
          }
        >{tr("Momentum general")}</SectionTitle>
        <MomentumChart days={shown} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-dim hover:text-ink">{tr("Vezi ca tabel (ultimele 14 zile)")}</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-dim">
                <tr>
                  <th className="py-1.5 pr-3 font-extrabold">{tr("Zi")}</th>
                  <th className="py-1.5 pr-3 font-extrabold">{tr("Scor")}</th>
                  <th className="py-1.5 pr-3 font-extrabold">{tr("Câștig")}</th>
                  <th className="py-1.5 pr-3 font-extrabold">{tr("Momentum")}</th>
                  <th className="py-1.5 font-extrabold">{tr("Nivel")}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {tableRows.map((r) => (
                  <tr key={r.day} className="border-t border-edge">
                    <td className="py-1.5 pr-3 font-bold text-ink">{relDay(r.day, today)}</td>
                    <td className="py-1.5 pr-3 text-body">{r.closed ? r.score : "–"}</td>
                    <td className="py-1.5 pr-3 text-gold-hi">+{r.gain}</td>
                    <td className="py-1.5 pr-3 text-body">
                      {r.momentum}
                      {r.reset && <span className="ml-1 font-extrabold text-rose">{tr("reset")}</span>}
                    </td>
                    <td className="py-1.5 text-body">{r.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionTitle icon={Activity} tone="mint" sub={tr("Fiecare obicei are propriul momentum")}>{tr("Pe obiceiuri")}</SectionTitle>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {habits.map((h) => {
              const on = !hidden.includes(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHidden((x) => (on ? [...x, h.id] : x.filter((y) => y !== h.id)))}
                  className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 transition ${on ? "text-ink ring-edge-hi" : "text-faint ring-edge opacity-60"}`}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: h.color }} />
                  {h.name}
                </button>
              );
            })}
          </div>
          <HabitLines habits={visible} series={s.habitSeries} days={shown} />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionTitle icon={BarChart3} tone="violet" sub={tr("60% activitate bifată + 40% evaluarea AI de seară")}>{tr("Scorul zilei")}</SectionTitle>
          <ScoreBars days={days.slice(-30)} />
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-violet" />{" "}{tr("cu raport AI")}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-mark" />{" "}{tr("fără AI")}</span>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="min-w-0 p-4 sm:p-5 xl:col-span-3">
          <SectionTitle icon={CalendarDays} tone="gold" sub={tr("Ultimele 26 de săptămâni, după scorul zilei")}>{tr("Activitate")}</SectionTitle>
          <Heatmap today={today} weeks={26} size={17} cell={cell} label={tr("Activitatea din ultimele 26 de săptămâni")} />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5 xl:col-span-2">
          <SectionTitle icon={Trophy} tone="gold" sub={tr("Nivelurile momentum-ului")}>{tr("Niveluri")}</SectionTitle>
          <ol className="grid grid-cols-2 gap-1.5">
            {LEVELS.map((l) => (
              <li key={l.lvl} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${l.lvl === d.level.lvl ? "bg-gold/10 ring-1 ring-gold/40" : "bg-well"}`}>
                <LevelBadge lvl={l.lvl} size={28} tone={l.lvl <= d.level.lvl ? "gold" : "dim"} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold text-ink">{l.name}</span>
                  <span className="block text-[10px] font-bold text-dim">{tr("{min} puncte", { min: l.min })}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {ai?.server && (
        <button
          type="button"
          onClick={() => go?.("molt", "ai")}
          className="focus-ring flex w-full items-center gap-3 rounded-2xl bg-violet/10 p-3 text-left ring-1 ring-violet/30 transition hover:bg-violet/15"
        >
          <Sparkles size={18} className="shrink-0 text-violet-hi" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">{tr("Ce înseamnă cifrele astea? Întreabă-l pe Molt")}</span>
            <span className="block text-xs font-semibold text-dim">{tr("Molt vede tiparele din ultimele 4 săptămâni și te ajută cu o reflecție de săptămână.")}</span>
          </span>
          <span className="shrink-0 text-xs font-extrabold text-violet-hi">{tr("Deschide →")}</span>
        </button>
      )}

      {ai?.server && agent?.log && <AgentImpact log={agent.log} />}
      <FocusStats sessions={state.focusSessions || []} today={today} onFocus={onFocus} />

      <Panel className="p-4 sm:p-5">
        <SectionTitle icon={Quote} tone="violet" sub={tr("Citatele apar când pierzi momentum sau faci un pas mare")}>{tr("Momente-cheie")}</SectionTitle>
        {moments.length === 0 ? (
          <p className="text-sm font-semibold text-dim">{tr("Încă niciun moment-cheie. Primul vine odată cu primul nivel nou sau cu ieșirea din ou.")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {moments.slice(0, 12).map((m) => {
              const q = quoteById(m.quoteId);
              return (
                <li key={m.id} className="inset p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold text-dim">
                    <Chip tone={MOMENT_META[m.type]?.tone === "rose" ? "rose" : MOMENT_META[m.type]?.tone || "gold"}>{MOMENT_META[m.type]?.title}</Chip>
                    {relDay(m.day, today)}
                  </div>
                  {q && (
                    <>
                      <p className="text-sm italic text-ink">„{q.text}”</p>
                      <p className="mt-1 text-[11px] font-bold text-dim">
                        {q.author} · {q.source}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
