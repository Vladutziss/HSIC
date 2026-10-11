// Past Focus sessions for the Statistici screen: totals, minutes per day and the latest sessions.

import React, { useMemo, useState } from "react";
import { Coffee, Play, Timer } from "lucide-react";
import { Button, Chip, Empty, Panel, SectionTitle, Stat } from "./ui.jsx";
import { addDays, dayKey, fmt12, mondayOf, relDay } from "../lib/dates.js";
import { fmtSpan } from "../lib/focus.js";
import { c } from "../lib/themes.js";

const dayOf = (ms) => dayKey(new Date(ms));
const timeOf = (ms) => {
  const d = new Date(ms);
  return fmt12(d.getHours() * 60 + d.getMinutes());
};

export function FocusStats({ sessions = [], today, onFocus }) {
  const [shown, setShown] = useState(6);
  const list = useMemo(() => [...sessions].sort((a, b) => b.start - a.start), [sessions]);

  const stats = useMemo(() => {
    const week = mondayOf(today);
    return {
      total: sessions.reduce((a, s) => a + s.work, 0),
      count: sessions.length,
      longest: sessions.reduce((a, s) => Math.max(a, s.work), 0),
      week: sessions.filter((s) => dayOf(s.start) >= week).reduce((a, s) => a + s.work, 0),
    };
  }, [sessions, today]);

  const bars = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
    const by = {};
    for (const s of sessions) by[dayOf(s.start)] = (by[dayOf(s.start)] || 0) + s.work;
    const max = Math.max(1800, ...days.map((d) => by[d] || 0)); // at least a 30-minute scale, so a short day is not a full bar
    return days.map((d) => ({ day: d, seconds: by[d] || 0, ratio: (by[d] || 0) / max }));
  }, [sessions, today]);

  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={Timer}
        tone="violet"
        sub="Timpul în care te-ai concentrat, fără pauze"
        action={
          <Button variant="ghost" size="sm" icon={Play} onClick={onFocus}>
            Focus
          </Button>
        }
      >
        Sesiuni Focus
      </SectionTitle>
      {sessions.length === 0 ? (
        <Empty icon={Timer} title="Nicio sesiune încă">
          Pornește Focus din Acasă sau din meniu. Fiecare sesiune de cel puțin un minut apare aici.
        </Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Timer} tone="violet" label="Total concentrat" value={fmtSpan(stats.total)} sub={`${stats.count} ${stats.count === 1 ? "sesiune" : "sesiuni"}`} />
            <Stat icon={Timer} tone="gold" label="Săptămâna asta" value={fmtSpan(stats.week)} />
            <Stat icon={Timer} tone="mint" label="Cea mai lungă" value={fmtSpan(stats.longest)} />
            <Stat icon={Timer} tone="sky" label="Medie / sesiune" value={fmtSpan(stats.total / Math.max(1, stats.count))} />
          </div>

          <div>
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-dim">Ultimele 14 zile</div>
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Minute de concentrare pe fiecare dintre ultimele 14 zile">
              {bars.map((b) => (
                <div key={b.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${relDay(b.day, today)}: ${b.seconds ? fmtSpan(b.seconds) : "nimic"}`}>
                  <div
                    className="w-full rounded-t-md"
                    style={{ height: `${Math.max(b.seconds ? 6 : 2, b.ratio * 100)}%`, background: b.seconds ? (b.day === today ? c("gold-ink") : c("violet-ink")) : c("edge") }}
                  />
                  <span className={`text-[10px] font-extrabold ${b.day === today ? "text-gold-hi" : "text-faint"}`}>{Number(b.day.slice(8))}</span>
                </div>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {list.slice(0, shown).map((s) => (
              <li key={s.id} className="inset flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <div className="min-w-[8.5rem]">
                  <div className="font-extrabold text-ink">{relDay(dayOf(s.start), today)}</div>
                  <div className="text-xs font-semibold text-dim">
                    {timeOf(s.start)} – {timeOf(s.end)}
                  </div>
                </div>
                <div className="font-pixel tabular text-xl text-ink">{fmtSpan(s.work)}</div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {s.pomodoro ? (
                    <Chip tone="violet" icon={Timer}>
                      Pomodoro {s.pomodoro.work}/{s.pomodoro.brk}
                      {s.cycles ? ` · ${s.cycles} ${s.cycles === 1 ? "ciclu" : "cicluri"}` : ""}
                    </Chip>
                  ) : (
                    <Chip>fără pauze</Chip>
                  )}
                  {s.breaks >= 60 && (
                    <Chip tone="mint" icon={Coffee}>
                      pauze {fmtSpan(s.breaks)}
                    </Chip>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {list.length > shown && (
            <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + 10)}>
              Sesiuni mai vechi
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
