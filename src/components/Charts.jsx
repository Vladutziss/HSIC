import React from "react";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RO_DAYS_MIN, RO_MONTHS_SHORT, addDays, fmtDay, mondayOf, parseDay } from "../lib/dates.js";
import { LEVELS } from "../lib/engine.js";

export const AXIS = { fill: "#9a91c9", fontSize: 11, fontWeight: 700, fontFamily: "Nunito, system-ui, sans-serif" };
export const GRID = "#262052";

export function ChartTip({ active, payload, label, format = {}, extra }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-edge-hi bg-[#120f29]/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-extrabold text-ink">{fmtDay(label)}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-semibold text-body">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color || p.fill || p.stroke }} />
          {p.name}: <span className="tabular font-extrabold text-ink">{format[p.dataKey] ? format[p.dataKey](p.value, p.payload) : p.value}</span>
        </div>
      ))}
      {extra && extra(payload[0].payload)}
    </div>
  );
}

export function Sparkline({ points, color = "#ffc542", width = 120, height = 34 }) {
  const vals = points.map((p) => p ?? 0);
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const max = Math.max(1, ...vals);
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={color} opacity="0.14" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="#1a1636" strokeWidth="1.5" />
    </svg>
  );
}

const tickDay = (k) => {
  const d = parseDay(k);
  return `${d.getDate()} ${RO_MONTHS_SHORT[d.getMonth()]}`;
};

/** Overall momentum with the level thresholds and the resets marked. */
export function MomentumChart({ days, height = 280 }) {
  const data = days.map((d) => ({ day: d.day, momentum: d.momentum, gain: d.gain, score: d.score, level: d.level, reset: d.reset, closed: d.closed }));
  const max = Math.max(200, ...data.map((d) => d.momentum));
  const top = Math.ceil((max * 1.12) / 100) * 100;
  const levels = LEVELS.filter((l) => l.min > 0 && l.min <= top);
  const resets = data.filter((d) => d.reset);
  return (
    <div style={{ height }} role="img" aria-label={`Momentum în ultimele ${data.length} zile, acum ${data[data.length - 1]?.momentum ?? 0}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 44, bottom: 0, left: -6 }}>
          <defs>
            <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffc542" stopOpacity="0.45" />
              <stop offset="1" stopColor="#ffc542" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickFormatter={tickDay} minTickGap={28} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={AXIS} domain={[0, top]} axisLine={false} tickLine={false} width={48} />
          {levels.map((l) => (
            <ReferenceLine
              key={l.lvl}
              y={l.min}
              stroke="#463c8c"
              strokeDasharray="3 5"
              label={{ value: `Nv ${l.lvl}`, position: "right", fill: "#9a91c9", fontSize: 10, fontWeight: 800 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: "#9a91c9", strokeDasharray: "3 3" }}
            content={
              <ChartTip
                format={{ momentum: (v, p) => `${v} (nivel ${p.level})` }}
                extra={(p) => (
                  <div className="mt-1 text-[11px] font-semibold text-dim">
                    +{p.gain} în ziua aceea{p.closed ? ` · scor ${p.score}` : " · provizoriu"}
                    {p.reset && <span className="ml-1 font-extrabold text-rose">· resetat</span>}
                  </div>
                )}
              />
            }
          />
          <Area type="monotone" dataKey="momentum" name="Momentum" stroke="#ffc542" strokeWidth={2.5} fill="url(#momFill)" activeDot={{ r: 5, stroke: "#1a1636", strokeWidth: 2 }} />
          {resets.map((r) => (
            <ReferenceDot key={r.day} x={r.day} y={0} r={6} fill="#ff5f87" stroke="#1a1636" strokeWidth={2} label={{ value: "reset", position: "top", fill: "#ff5f87", fontSize: 10, fontWeight: 800 }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Per-habit momentum, one line per habit in its own color. */
export function HabitLines({ habits, series, days, height = 260 }) {
  const idx = Object.fromEntries(days.map((d, i) => [d.day, i]));
  const data = days.map((d) => ({ day: d.day }));
  for (const h of habits) {
    for (const p of series[h.id] || []) {
      const i = idx[p.day];
      if (i !== undefined) data[i][h.id] = p.m;
    }
  }
  return (
    <div style={{ height }} role="img" aria-label="Momentum pe fiecare obicei">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickFormatter={tickDay} minTickGap={28} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip cursor={{ stroke: "#9a91c9", strokeDasharray: "3 3" }} content={<ChartTip />} />
          {habits.map((h) => (
            <Line key={h.id} type="monotone" dataKey={h.id} name={h.name} stroke={h.color} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: "#1a1636", strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HabitArea({ points, color, height = 200 }) {
  const data = points.filter((p) => p.m !== null);
  return (
    <div style={{ height }} role="img" aria-label="Momentum-ul obiceiului în timp">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="habFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.4" />
              <stop offset="1" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickFormatter={tickDay} minTickGap={28} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: "#9a91c9", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="m" name="Momentum" stroke={color} strokeWidth={2.5} fill="url(#habFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Day scores; AI-reviewed days in violet, days closed without AI in slate. */
export function ScoreBars({ days, height = 200 }) {
  const data = days.filter((d) => d.closed).map((d) => ({ day: d.day, score: d.score, ai: d.ai, reviewed: d.reviewed }));
  return (
    <div style={{ height }} role="img" aria-label="Scorul fiecărei zile">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickFormatter={tickDay} minTickGap={28} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={AXIS} domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "rgba(143,107,255,0.08)" }}
            content={<ChartTip format={{ score: (v, p) => `${v}${p.ai !== null ? ` · AI: ${p.ai}` : p.reviewed ? " · fără AI" : " · închisă automat"}` }} />}
          />
          <RBar dataKey="score" name="Scor" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.day} fill={d.ai !== null ? "#8f6bff" : "#5a5296"} />
            ))}
          </RBar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sequential ramp (one hue, dark → bright) for the activity heatmap.
export const HEAT = ["#211c45", "#4a3c22", "#7a5a14", "#b07f0e", "#ffc542"];
export const heatLevel = (score) => (score <= 0 ? 0 : score < 25 ? 1 : score < 50 ? 2 : score < 75 ? 3 : 4);

/** A calendar heatmap: one column per week (Monday first), newest week on the right. */
export function Heatmap({ today, weeks = 20, size = 14, cell, legend = true, label }) {
  const start = addDays(mondayOf(today), -7 * (weeks - 1));
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(start, w * 7 + i));
    cols.push(days);
  }
  // a month name where a month starts, skipped when it would collide with the previous one
  const labels = [];
  let lastAt = -9;
  cols.forEach((days, w) => {
    const m = parseDay(days[0]).getMonth();
    const prev = w > 0 ? parseDay(cols[w - 1][0]).getMonth() : null;
    if (w === 0 || m !== prev) {
      if (w - lastAt < 3) labels[lastAt] = "";
      labels[w] = RO_MONTHS_SHORT[m];
      lastAt = w;
    }
  });
  const gap = 3;
  return (
    <div className="overflow-x-auto pb-1" role="img" aria-label={label}>
      <div className="inline-grid" style={{ gap, gridTemplateColumns: `22px repeat(${weeks}, ${size}px)` }}>
        <span />
        {cols.map((days, w) => (
          <span key={w} className="h-4 overflow-visible whitespace-nowrap text-[10px] font-extrabold text-dim">
            {labels[w] || ""}
          </span>
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <React.Fragment key={row}>
            <span className="pr-1 text-right text-[10px] font-extrabold text-faint" style={{ lineHeight: `${size}px` }}>
              {row % 2 === 0 ? RO_DAYS_MIN[(row + 1) % 7] : ""}
            </span>
            {cols.map((days, w) => {
              const day = days[row];
              if (day > today) return <span key={w} style={{ width: size, height: size }} />;
              const c = cell(day);
              return (
                <span
                  key={w}
                  title={c.title}
                  className={`rounded-[3px] ${day === today ? "ring-2 ring-ink/80" : ""}`}
                  style={{ width: size, height: size, background: c.color, boxShadow: c.ring ? `inset 0 0 0 1.5px ${c.ring}` : undefined }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {legend && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-dim">
          Mai puțin
          {HEAT.map((c) => (
            <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          Mai mult
        </div>
      )}
    </div>
  );
}
