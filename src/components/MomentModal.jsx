import React, { useEffect, useRef, useState } from "react";
import { Flame, Quote, RotateCcw, Sparkles, TrendingDown } from "lucide-react";
import { Button, LevelBadge, Modal } from "./ui.jsx";
import { Sprite } from "./Sprite.jsx";
import { MOMENT_META, momentLine, momentSituation } from "../lib/moments.js";
import { quoteById } from "../lib/quotes.js";
import { evolutionChapter, momentLineAI } from "../lib/ai.js";
import { DEFAULT_NAMES, PATHS, uid } from "../lib/catalog.js";
import { STAGES } from "../lib/engine.js";

export function MomentModal({ moment, state, d, ai, recentStories, onName, onChapter, onClose }) {
  const meta = MOMENT_META[moment.type] || MOMENT_META.levelup;
  const quote = quoteById(moment.quoteId);
  const path = state.profile?.path || "sport";
  const c = d.companion;
  const needsName = moment.type === "hatch" && !state.companion?.name;
  const [name, setName] = useState(state.companion?.name || DEFAULT_NAMES[path]?.[0] || "");
  const displayName = needsName ? name || "Molt-ul tău" : c.name || "Molt-ul tău";
  const ctx = { name: displayName, resetAfter: d.resetAfter };
  const [line, setLine] = useState(momentLine(moment, ctx));
  const [chapter, setChapter] = useState(null);
  const chapterDone = useRef(false);

  useEffect(() => {
    if (!ai.available || !quote) return undefined;
    const ctl = new AbortController();
    momentLineAI(momentSituation(moment, ctx), quote, ctl.signal)
      .then((l) => l && setLine(l))
      .catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment.id]);

  // hatching and evolving add a chapter to the companion's story
  useEffect(() => {
    if (!["hatch", "evolve"].includes(moment.type) || chapterDone.current) return undefined;
    chapterDone.current = true;
    const stageIdx = moment.stageIndex ?? c.stageIndex;
    const from = STAGES[Math.max(0, stageIdx - 1)].name;
    const to = STAGES[stageIdx].name;
    const fallback = {
      title: moment.type === "hatch" ? "Coaja se sparge" : `Devine ${to}`,
      story:
        moment.type === "hatch"
          ? `Coaja trosnește, apoi se desface. Din ou iese un ${PATHS[path].cls.toLowerCase()} mic, care clipește la lumină și te recunoaște pe loc.`
          : `Lumina îl învăluie pe ${displayName}, iar când se risipește, stă mai drept și mai sigur pe el. A devenit ${to} și e gata de drumuri mai lungi.`,
    };
    const save = (ch) => {
      const chapter = { id: uid("c"), type: "chapter", day: d.today, at: new Date().toISOString(), stage: to, ...ch };
      setChapter(chapter);
      onChapter(chapter);
    };
    if (!ai.available) {
      save(fallback);
      return undefined;
    }
    const ctl = new AbortController();
    evolutionChapter({ name: displayName, pathId: path, from, to, recent: recentStories.slice(-3).map((s) => s.story) }, ctl.signal)
      .then((ch) => save(ch.story ? ch : fallback))
      .catch(() => save(fallback));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment.id]);

  const finish = () => {
    if (needsName) onName(name.trim().slice(0, 20) || DEFAULT_NAMES[path]?.[0] || "Ecou");
    onClose();
  };

  let hero;
  if (moment.type === "levelup") {
    hero = (
      <div className="flex flex-col items-center gap-2">
        <div className="anim-pop">
          <LevelBadge lvl={moment.lvl} size={112} />
        </div>
        <div className="font-pixel text-2xl text-gold-hi">{moment.name}</div>
      </div>
    );
  } else if (moment.type === "streak") {
    hero = (
      <div className="flex flex-col items-center gap-1">
        <Flame size={84} className="anim-flicker text-ember" fill="#ff7b47" aria-hidden="true" />
        <div className="font-pixel text-4xl text-ink">{moment.n} zile</div>
      </div>
    );
  } else {
    const mood = moment.type === "reset" || moment.type === "drop" ? "idle" : "joy";
    hero = (
      <div className="pedestal flex flex-col items-center rounded-3xl px-10 pt-2">
        <Sprite path={path} stage={c.stage.id} mood={mood} size={160} label={displayName} />
        {(moment.type === "reset" || moment.type === "drop") && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-[#120f29] px-3 py-1 text-xs font-extrabold text-dim ring-1 ring-edge">
            {moment.type === "reset" ? <RotateCcw size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
            {moment.type === "reset" ? "momentum: 0" : `${moment.from} → ${moment.to}`}
          </span>
        )}
      </div>
    );
  }

  const tone = meta.tone === "rose" || meta.tone === "ember" ? "violet" : meta.tone;
  return (
    <Modal
      open
      onClose={finish}
      tone={tone}
      labelledBy="moment-title"
      footer={
        <Button id="moment-continue" onClick={finish} disabled={needsName && !name.trim()} data-autofocus={needsName ? undefined : true}>
          {needsName ? "Botează și continuă" : "Continuă"}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-xs font-extrabold uppercase tracking-[0.25em] text-gold">Moment-cheie</span>
        <h2 id="moment-title" className="font-pixel text-3xl leading-tight text-ink">
          {meta.title}
        </h2>
        {hero}
        <p className="max-w-md text-[15px] font-semibold leading-relaxed text-body">{line}</p>

        {needsName && (
          <div className="w-full max-w-sm text-left">
            <label htmlFor="companion-name" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">
              Cum îl cheamă?
            </label>
            <input id="companion-name" className="field" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(DEFAULT_NAMES[path] || []).map((n) => (
                <button key={n} type="button" onClick={() => setName(n)} className="rounded-full bg-violet/15 px-2.5 py-1 text-xs font-extrabold text-violet-hi ring-1 ring-violet/30 hover:bg-violet/25">
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {chapter && (
          <div className="inset w-full p-4 text-left">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-violet-hi">
              <Sparkles size={13} aria-hidden="true" /> Capitol nou · {chapter.title}
            </div>
            <p className="text-sm leading-relaxed text-ink">{chapter.story}</p>
          </div>
        )}

        {quote && (
          <figure className="panel panel-gold w-full p-4 text-left">
            <Quote size={20} className="mb-1 text-gold" aria-hidden="true" />
            <blockquote className="text-[15px] font-semibold italic leading-relaxed text-ink">„{quote.text}”</blockquote>
            <figcaption className="mt-2 text-xs font-bold text-dim">
              <span className="text-gold-hi">{quote.author}</span> · {quote.source}
            </figcaption>
          </figure>
        )}
      </div>
    </Modal>
  );
}
