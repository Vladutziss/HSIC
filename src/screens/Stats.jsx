import React, { useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, Camera, Flame, Gauge, Quote, ShieldCheck, Trophy, Zap } from "lucide-react";
import { Chip, LevelBadge, Panel, SectionTitle, Stat, Tabs } from "../components/ui.jsx";
import { HEAT, HabitLines, Heatmap, MomentumChart, ScoreBars, heatLevel } from "../components/Charts.jsx";
import { MOMENT_META } from "../lib/moments.js";
import { quoteById } from "../lib/quotes.js";
import { LEVELS, evolutionPoints } from "../lib/engine.js";
import { fmtDay, relDay } from "../lib/dates.js";

export default function Stats({ state, d, today }) {
  const [range, setRange] = useState(60);
  const [hidden, setHidden] = useState([]);
  const days = d.timeline.days;
  const shown = range === 0 ? days : days.slice(-range);
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const visible = habits.filter((h) => !hidden.includes(h.id));
  const ev = evolutionPoints(state);
  const last30 = days.filter((x) => x.closed).slice(-30);
  const avg = last30.length ? Math.round(last30.reduce((a, x) => a + x.score, 0) / last30.length) : 0;
  const checkins = Object.values(state.log || {}).reduce((a, e) => a + Object.keys(e).length, 0);
  const byDay = d.timeline.byDay;
  const moments = (state.moments || []).slice().reverse();

  const cell = (day) => {
    const e = byDay[day];
    if (!e) return { color: HEAT[0], title: `${fmtDay(day)}: fără date` };
    return { color: HEAT[heatLevel(e.closed || e.active ? e.score : 0)], title: `${fmtDay(day)}: scor ${e.score}${e.reset ? " · resetare" : ""}` };
  };

  const tableRows = useMemo(() => days.slice(-14).reverse(), [days]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-3xl text-ink">Statistici</h1>
        <p className="text-sm font-semibold text-dim">Momentum-ul general, fiecare obicei și scorurile zilnice.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Zap} tone="gold" label="Momentum" value={d.entry?.momentum ?? 0} sub={`nivel ${d.level.lvl} · ${d.level.name}`} />
        <Stat icon={Trophy} tone="gold" label="Cel mai bun nivel" value={d.timeline.bestLevel} sub={`${d.timeline.bestMomentum} puncte`} />
        <Stat icon={Flame} tone="ember" label="Serie" value={d.streak.current} sub={`record: ${d.streak.best} zile`} />
        <Stat icon={Activity} tone="mint" label="Bifări" value={checkins} sub="în total" />
        <Stat icon={ShieldCheck} tone="violet" label="Dovezi verificate" value={ev.verified} sub={`din ${ev.proofs} trimise`} />
        <Stat icon={Gauge} tone="sky" label="Scor mediu" value={avg} sub="ultimele 30 de zile" />
      </div>

      <Panel tone="gold" corners className="p-4 sm:p-5">
        <SectionTitle
          icon={Zap}
          tone="gold"
          sub={`Liniile punctate sunt pragurile de nivel. Punctele roz marchează resetările după ${d.resetAfter} zile fără activitate.`}
          action={
            <Tabs
              size="sm"
              value={range}
              onChange={setRange}
              items={[
                { value: 30, label: "30 z" },
                { value: 60, label: "60 z" },
                { value: 90, label: "90 z" },
                { value: 0, label: "Tot" },
              ]}
            />
          }
        >
          Momentum general
        </SectionTitle>
        <MomentumChart days={shown} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-dim hover:text-ink">Vezi ca tabel (ultimele 14 zile)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-dim">
                <tr>
                  <th className="py-1.5 pr-3 font-extrabold">Zi</th>
                  <th className="py-1.5 pr-3 font-extrabold">Scor</th>
                  <th className="py-1.5 pr-3 font-extrabold">Câștig</th>
                  <th className="py-1.5 pr-3 font-extrabold">Momentum</th>
                  <th className="py-1.5 font-extrabold">Nivel</th>
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
                      {r.reset && <span className="ml-1 font-extrabold text-rose">reset</span>}
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
          <SectionTitle icon={Activity} tone="mint" sub="Fiecare obicei are propriul momentum">
            Pe obiceiuri
          </SectionTitle>
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
          <HabitLines habits={visible} series={d.timeline.habitSeries} days={shown} />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionTitle icon={BarChart3} tone="violet" sub="60% activitate bifată + 40% evaluarea AI de seară">
            Scorul zilei
          </SectionTitle>
          <ScoreBars days={days.slice(-30)} />
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-violet" /> cu raport AI
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#5a5296]" /> fără AI
            </span>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="min-w-0 p-4 sm:p-5 xl:col-span-3">
          <SectionTitle icon={CalendarDays} tone="gold" sub="Ultimele 26 de săptămâni, după scorul zilei">
            Activitate
          </SectionTitle>
          <Heatmap today={today} weeks={26} size={17} cell={cell} label="Activitatea din ultimele 26 de săptămâni" />
        </Panel>
        <Panel className="min-w-0 p-4 sm:p-5 xl:col-span-2">
          <SectionTitle icon={Trophy} tone="gold" sub="Nivelurile momentum-ului">
            Niveluri
          </SectionTitle>
          <ol className="grid grid-cols-2 gap-1.5">
            {LEVELS.map((l) => (
              <li key={l.lvl} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${l.lvl === d.level.lvl ? "bg-gold/10 ring-1 ring-gold/40" : "bg-[#120f29]"}`}>
                <LevelBadge lvl={l.lvl} size={28} tone={l.lvl <= d.level.lvl ? "gold" : "dim"} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold text-ink">{l.name}</span>
                  <span className="block text-[10px] font-bold text-dim">{l.min} puncte</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <SectionTitle icon={Quote} tone="violet" sub="Citatele apar când pierzi momentum sau faci un pas mare">
          Momente-cheie
        </SectionTitle>
        {moments.length === 0 ? (
          <p className="text-sm font-semibold text-dim">Încă niciun moment-cheie. Primul vine odată cu primul nivel nou sau cu ieșirea din ou.</p>
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
