import React, { useEffect, useMemo, useState } from "react";
import { BookOpenText, Check, Lock, Pencil, ScrollText, Sparkles, Zap, MessageSquare } from "lucide-react";
import { Bar, Button, Chip, Empty, Panel, SectionTitle, Stat } from "../components/ui.jsx";
import { Sprite, eggCrack } from "../components/Sprite.jsx";
import { moodLine } from "../components/Cards.jsx";
import { PATHS } from "../lib/catalog.js";
import { STAGES } from "../lib/engine.js";
import { addDays, monthsBetween, relDay } from "../lib/dates.js";
import { tr } from "../lib/i18n.js";

const STAGE_TEXT = {
  egg: tr("Așteaptă primele bifări ca să se deschidă."),
  hatchling: tr("Abia ieșit din ou, curios și mic."),
  apprentice: tr("Primește primul echipament al drumului său."),
  adept: tr("Poartă unealta clasei sale."),
  master: tr("Mantie și medalie: un veteran al obiceiurilor."),
  legend: tr("Contur de aur și aură. Rar întâlnit."),
};

// a framed panel on its own page; a plain section when it sits inside the Molt workbench (which is the frame)
function Sect({ embedded, tone, children }) {
  return embedded ? <section className="border-t border-edge/60 pt-5 first:border-t-0 first:pt-0">{children}</section> : <Panel tone={tone} className="p-4 sm:p-5">{children}</Panel>;
}

// `embedded`: shown inside the Molt page, whose header already has the picture, the name and the evolution bar
export default function Companion({ state, d, today, months, loadMonth, onRename, go, embedded = false }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const p = PATHS[path];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name || "");
  const [extraMonths, setExtraMonths] = useState(2);

  const span = useMemo(() => monthsBetween(addDays(today, -31 * extraMonths), today), [today, extraMonths]);
  useEffect(() => {
    span.forEach((ym) => loadMonth(ym));
  }, [span, loadMonth]);

  const story = useMemo(() => {
    const items = span.flatMap((ym) => {
      const m = months[ym];
      return m ? m.chapters || [] : [];
    });
    return items.filter((x) => x.story).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [months, span]);

  const oldest = (state.meta?.months || []).slice().sort()[0];
  const canLoadMore = oldest && span[0] > oldest;

  return (
    <div className={embedded ? "space-y-6" : "space-y-5"}>
      {!embedded && (
        <Panel tone="violet" className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.1fr,1fr] [&>*]:min-w-0">
            <div className="relative">
              <div className="pedestal flex min-h-[300px] items-end justify-center pt-8">
                <Sprite path={path} stage={c.stage.id} mood={c.mood} size={224} crack={eggCrack(c.ep)} look={c.look} label={`${c.name || tr("Oul tău")}, ${c.stage.name}`} />
              </div>
              <div className="scene-ground h-8" />
            </div>
            <div className="flex flex-col justify-center gap-4 p-5 sm:p-7">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-hi">
                  {c.stage.name} · {p.cls}
                </div>
                {renaming ? (
                  <form
                    className="mt-1 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (name.trim()) onRename(name.trim().slice(0, 20));
                      setRenaming(false);
                    }}
                  >
                    <input className="field" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label={tr("Numele personajului")} autoFocus />
                    <Button type="submit" size="sm" icon={Check} aria-label={tr("Salvează numele")} />
                  </form>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <h1 className="font-pixel text-4xl text-ink">{c.name || tr("Oul tău")}</h1>
                    {c.stage.id !== "egg" && (
                      <button type="button" onClick={() => setRenaming(true)} className="focus-ring rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink" aria-label={tr("Redenumește")}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-[15px] font-semibold text-body">{moodLine(c, c.name)}</p>
                <div className="mt-3">
                  <Button variant="violet" size="sm" icon={MessageSquare} onClick={() => go?.("chat")}>{tr("Vorbește cu {v} (Chat AI)", { v: c.name || tr("Moltul") })}</Button>
                </div>
              </div>
              {c.next ? (
                <div>
                  <div className="mb-1 flex justify-between text-xs font-extrabold text-dim">
                    <span>{tr("Următoarea evoluție: {name}", { name: c.next.name })}</span>
                    <span className="tabular">{tr("{ep} / {min} PE", { ep: c.ep, min: c.next.min })}</span>
                  </div>
                  <Bar value={c.progress} tone="violet" label={tr("Progres spre evoluția următoare")} />
                  <p className="mt-1 text-xs font-semibold text-faint">{tr("Puncte de evoluție (PE): fiecare bifă contează după dificultatea obiceiului, dar cu cât bifezi mai multe într-o zi, cu atât fiecare adaugă mai puțin.")}</p>
                </div>
              ) : (
                <Chip tone="gold" icon={Sparkles}>{tr("Evoluție completă")}</Chip>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Sect embedded={embedded}>
        {!embedded && (
          <SectionTitle icon={Sparkles} sub={tr("Evoluția vine din obiceiurile pe care le bifezi")}>{tr("Drumul evoluției")}</SectionTitle>
        )}
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {STAGES.map((s, i) => {
            const reached = c.stageIndex >= i;
            const current = c.stageIndex === i;
            return (
              <li
                key={s.id}
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-center ring-1 ${
                  current ? "bg-violet/15 ring-violet" : reached ? "bg-well ring-gold/40" : "bg-well ring-edge"
                }`}
              >
                <Sprite path={path} stage={s.id} size={64} still silhouette={!reached} />
                <span className={`font-pixel text-base ${reached ? "text-ink" : "text-faint"}`}>{s.name}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-dim">
                  {reached ? <Check size={12} className="text-mint" aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />}{tr("{min} PE", { min: s.min })}</span>
                <span className="hidden text-[11px] font-semibold leading-snug text-faint sm:block">{STAGE_TEXT[s.id]}</span>
              </li>
            );
          })}
        </ol>
      </Sect>

      {embedded ? (
        <p className="text-sm font-bold text-dim">{tr("{ep} puncte de evoluție · {checkins} bifări în total · {length} {v} în perioada afișată", { ep: c.ep, checkins: c.checkins, length: story.length, v: story.length === 1 ? tr("capitol") : tr("capitole") })}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Sparkles} tone="violet" label={tr("Puncte de evoluție")} value={c.ep} />
          <Stat icon={Zap} tone="gold" label={tr("Bifări")} value={c.checkins} sub={tr("în total")} />
          <Stat icon={BookOpenText} tone="sky" label={tr("Capitole")} value={story.length} sub={tr("în perioada afișată")} />
        </div>
      )}

      <Sect embedded={embedded} tone="gold">
        <SectionTitle icon={ScrollText} sub={tr("Un capitol nou la fiecare evoluție")}>{tr("Povestea lui {v}", { v: c.name || tr("Molt-ului tău") })}</SectionTitle>
        {story.length === 0 ? (
          <Empty icon={ScrollText} title={tr("Povestea nu a început încă")}>{tr("Primul capitol apare când oul se deschide. Bifează-ți obiceiurile și ai răbdare.")}</Empty>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-dashed border-edge-hi pl-5">
            {story.map((s) => (
              <li key={s.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-sm bg-gold" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-dim">
                  <span className="font-extrabold text-gold-hi">{s.title || tr("Capitol")}</span>
                  <span>· {relDay(s.day, today)}</span>
                  {s.stage && <Chip tone="gold">{tr("evoluție: {stage}", { stage: s.stage })}</Chip>}
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{s.story}</p>
              </li>
            ))}
          </ol>
        )}
        {canLoadMore && (
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setExtraMonths((n) => n + 3)}>{tr("Capitole mai vechi")}</Button>
          </div>
        )}
      </Sect>
    </div>
  );
}
