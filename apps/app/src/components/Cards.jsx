import React, { useEffect, useState } from "react";
import { ChevronDown, Clock, Send, Sparkles } from "lucide-react";
import { Bar, Button, CheckButton, Chip, Gems, Panel, Ring, Skeleton } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { iconFor } from "./icons.js";
import { checkInGain } from "../lib/derive.js";
import { fmt12, monthKey } from "../lib/dates.js";
import { c as tc } from "../lib/themes.js";
import { tr } from "../lib/i18n.js";

// ------------------------------------------------------------ quests

export function QuestCard({ h, code, scheduled, runMult, doneBases, onCheck, onOpen }) {
  const Icon = iconFor(h.icon);
  const done = code > 0;
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(0), 1200);
    return () => clearTimeout(t);
  }, [burst]);
  const click = () => {
    if (!done) setBurst(checkInGain(h, runMult, doneBases));
    onCheck(h.id);
  };
  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border p-3 transition sm:gap-4 ${
        done ? "border-mint/40 bg-mint/5" : "border-edge bg-panel-hi/50 hover:border-edge-hi"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={tr("Detalii: {name}", { name: h.name })}
        className="focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-xl"
        style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 1px ${h.color}66` }}
      >
        <Icon size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-extrabold text-ink">{h.name}</span>
          <Gems n={h.diff} size={11} />
          {!scheduled && <Chip>{tr("opțional azi")}</Chip>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-dim">
          <span>{h.target}</span>
          {h.time && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              {fmt12(h.time)}
            </span>
          )}
          {done ? <span className="font-extrabold text-mint">{tr("Bifat")}</span> : <span className="font-extrabold text-gold-hi">+{checkInGain(h, runMult, doneBases)}</span>}
        </div>
      </div>
      <CheckButton checked={done} onClick={click} label={done ? tr("Anulează bifa pentru {name}", { name: h.name }) : tr("Bifează {name}", { name: h.name })} />
      {burst > 0 && <span className="anim-rise font-display pointer-events-none absolute right-6 top-0 text-lg font-bold text-gold">+{burst}</span>}
    </div>
  );
}

// ------------------------------------------------------------ companion

export function moodLine(c, name) {
  const n = name || tr("Molt-ul tău");
  if (c.stage.id === "egg") {
    if (c.mood === "sleep") return tr("Oul e rece și liniștit. Se încălzește din nou cu prima ta bifă.");
    return c.ep > 0 ? tr("Oul a început să crape! Încă o bifă și se deschide.") : tr("Oul se încălzește cu fiecare obicei pe care îl bifezi.");
  }
  if (c.mood === "sleep") return tr("{n} doarme. Se trezește când revii.", { n });
  if (c.mood === "joy") return tr("{n} sare de bucurie că ai revenit!", { n });
  if (c.mood === "happy") return tr("{n} e mândru de tine: toate misiunile de azi sunt gata.", { n });
  return tr("{n} te așteaptă la următoarea bifă.", { n });
}

/**
 * Molt on Acasă: one slim row. The character, how it is doing, and (with the server) a field to ask it something;
 * the answer opens in the Molt page. Everything else about Molt lives there.
 */
export function CompanionCard({ c, path, ai, waiting = 0, onAsk, onChat }) {
  const label = c.name || tr("Oul tău");
  const labelS = c.name || tr("Oul tău§propoziție"); // inside a sentence ("Talk to your egg")
  const [text, setText] = useState("");
  const ask = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    onAsk?.(t);
  };
  return (
    <Panel tone="violet" className="p-4">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onChat} className="focus-ring pedestal shrink-0 rounded-xl px-2 pt-1" aria-label={tr("Deschide Molt")}>
          <Sprite path={path} stage={c.stage.id} mood={c.mood} size={72} crack={eggCrack(c.ep)} look={c.look} label={`${label}, ${c.stage.name}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg text-ink">{label}</div>
          <p className="text-sm font-semibold leading-snug text-body">{moodLine(c, c.name)}</p>
          {c.next && <Bar className="mt-2" value={c.progress} tone="violet" height={8} segmented={false} label={tr("Progres spre evoluția următoare")} />}
        </div>
      </div>
      {ai?.server ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <input className="field min-w-0 flex-1" value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={tr("Întreabă-l pe {label} orice…", { label: labelS })} aria-label={tr("Întrebare pentru {label}", { label: labelS })} />
          <Button type="submit" variant="violet" icon={Send} disabled={!text.trim()} aria-label={tr("Trimite întrebarea")} />
        </form>
      ) : null}
      {waiting > 0 && (
        <button type="button" onClick={onChat} className="focus-ring mt-3 inline-flex items-center gap-2 text-xs font-extrabold text-gold-ink">
          <Sparkles size={14} aria-hidden="true" />
          {tr("Molt așteaptă {waiting} {v}", { waiting, v: waiting === 1 ? tr("propunere") : tr("propuneri") })}
        </button>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ evening review

export function ReviewCard({ d, state, months, review, ai, today }) {
  const [open, setOpen] = useState(false);
  const saved = state.reviews?.[today];
  const text = months[monthKey(today)]?.reviews?.[today];
  const entry = d.entry;
  const left = review.reviewMin - review.now;
  const due = left <= 0;

  // before the evening there is nothing to show: the card appears when the report is due, being written, or done
  if (!saved && !due && review.status !== "running" && review.status !== "error") return null;

  let body;
  if (review.status === "running") {
    body = (
      <div className="space-y-2" aria-live="polite">
        <p className="text-sm font-bold text-ink">{tr("AI-ul scrie raportul zilei…")}</p>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  } else if (saved) {
    body = (
      <div>
        <div className="flex items-center gap-4">
          <Ring value={(entry?.score || 0) / 100} size={56} stroke={6} color={tc("gold-ink")}>
            <span className="font-display text-lg text-ink">{entry?.score ?? 0}</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-ink">{tr("Ziua de azi e închisă")}</div>
            <div className="text-sm font-semibold text-dim">{tr("+{v} momentum", { v: entry?.reviewXp || 0 })}</div>
          </div>
          {(text?.summary || text?.highlight || text?.tip) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="review-details"
              aria-label={open ? tr("Ascunde raportul") : tr("Arată raportul")}
              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-well hover:text-ink"
            >
              <ChevronDown size={18} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          )}
        </div>
        {open && (
          <div id="review-details" className="mt-3 space-y-2">
            {text?.summary && <p className="text-sm leading-relaxed text-body">{text.summary}</p>}
            {text?.highlight && (
              <p className="text-sm">
                <span className="font-extrabold text-ink">{tr("Cel mai bun moment:")}{" "}</span>
                <span className="text-body">{text.highlight}</span>
              </p>
            )}
            {text?.tip && (
              <p className="text-sm">
                <span className="font-extrabold text-ink">{tr("Pentru mâine:")}{" "}</span>
                <span className="text-body">{text.tip}</span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-ink">{tr("E ora raportului!")}</div>
          <p className="text-sm font-semibold text-dim">
            {review.status === "error" ? review.error : !ai.available ? tr("AI-ul nu e disponibil acum, deci raportul nu se poate genera.") : d.pending === 0 ? tr("Bifează ceva ca raportul să aducă momentum.") : tr("+{v} momentum", { v: d.pending })}
          </p>
        </div>
        <Button id="review-run" variant="gold" size="sm" icon={Sparkles} disabled={!ai.available} onClick={() => review.run(today)}>
          {review.status === "error" ? tr("Încearcă din nou") : tr("Generează raportul")}
        </Button>
      </div>
    );
  }

  return (
    <Panel id="review-card" className="p-4">
      {body}
    </Panel>
  );
}

