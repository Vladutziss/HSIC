import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Crown, MessageCircle, Moon, Send, Sparkles, Users } from "lucide-react";
import { Bar, Button, Chip, CheckButton, Gems, Panel, Ring, SectionTitle, Skeleton } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { iconFor } from "./icons.js";
import { PATHS } from "../lib/catalog.js";
import { checkInGain } from "../lib/derive.js";
import { fmt12, monthKey } from "../lib/dates.js";
import { c as tc } from "../lib/themes.js";

// ------------------------------------------------------------ quests

export function QuestCard({ h, code, scheduled, runMult, onCheck, onOpen }) {
  const Icon = iconFor(h.icon);
  const done = code > 0;
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(0), 1200);
    return () => clearTimeout(t);
  }, [burst]);
  const click = () => {
    if (!done) setBurst(checkInGain(h, runMult));
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
        aria-label={`Detalii: ${h.name}`}
        className="focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-xl"
        style={{ background: `${h.color}26`, color: h.color, boxShadow: `inset 0 0 0 1px ${h.color}66` }}
      >
        <Icon size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-extrabold text-ink">{h.name}</span>
          <Gems n={h.diff} size={11} />
          {!scheduled && <Chip>opțional azi</Chip>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-dim">
          <span>{h.target}</span>
          {h.time && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              {fmt12(h.time)}
            </span>
          )}
          {done ? <span className="font-extrabold text-mint">Bifat</span> : <span className="font-extrabold text-gold-hi">+{checkInGain(h, runMult)}</span>}
        </div>
      </div>
      <CheckButton checked={done} onClick={click} label={done ? `Anulează bifa pentru ${h.name}` : `Bifează ${h.name}`} />
      {burst > 0 && <span className="anim-rise font-pixel pointer-events-none absolute right-6 top-0 text-lg font-bold text-gold">+{burst}</span>}
    </div>
  );
}

// ------------------------------------------------------------ companion

export function moodLine(c, name) {
  const n = name || "Molt-ul tău";
  if (c.stage.id === "egg") {
    if (c.mood === "sleep") return "Oul e rece și liniștit. Se încălzește din nou cu prima ta bifă.";
    return c.ep > 0 ? "Oul a început să crape! Încă o bifă și se deschide." : "Oul se încălzește cu fiecare obicei pe care îl bifezi.";
  }
  if (c.mood === "sleep") return `${n} doarme. Se trezește când revii.`;
  if (c.mood === "joy") return `${n} sare de bucurie că ai revenit!`;
  if (c.mood === "happy") return `${n} e mândru de tine: toate misiunile de azi sunt gata.`;
  return `${n} te așteaptă la următoarea bifă.`;
}

// What Molt can be asked from Acasă: the same questions work in the chat and use everything the app knows
const QUICK_ASKS = ["Fă-mi planul pentru azi", "Cu ce ar trebui să încep?", "Ajută-mă să mă pregătesc pentru un examen", "Cum pot să rămân constant?"];

/**
 * Molt on the home screen: the character and an input to talk to it. Questions open the Molt page with the
 * answer on its way. Without the server there is no AI, so the card just leads to the page.
 */
export function MoltCard({ c, path, ai, waiting = 0, onAsk, onOpen }) {
  const [text, setText] = useState("");
  const label = c.name || "Moltul tău";
  const cls = PATHS[path]?.cls;
  const ask = (q) => {
    const t = (q ?? text).trim();
    if (!t) return;
    setText("");
    onAsk?.(t);
  };
  return (
    <Panel tone="violet" corners className="p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <button type="button" onClick={onOpen} className="focus-ring pedestal grid h-24 w-24 shrink-0 place-items-center rounded-2xl sm:h-28 sm:w-28" aria-label={`Deschide pagina lui ${label}`}>
          <Sprite path={path} stage={c.stage.id} mood={c.mood} size={88} crack={eggCrack(c.ep)} label={`${label}, ${c.stage.name}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-pixel text-xl text-ink sm:text-2xl">{label}</h2>
            <Chip tone="violet" icon={Sparkles}>
              AI
            </Chip>
            {waiting > 0 && (
              <button type="button" onClick={onOpen} className="focus-ring rounded-full">
                <Chip tone="gold">
                  {waiting} {waiting === 1 ? "propunere" : "propuneri"} pentru tine
                </Chip>
              </button>
            )}
          </div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-violet-hi">
            {c.stage.name} · {cls}
          </div>
          <p className="relative mt-2 rounded-xl bg-well p-2.5 text-sm font-semibold text-body ring-1 ring-edge">{moodLine(c, c.name)}</p>
        </div>
      </div>

      {ai?.server ? (
        <div className="mt-3 space-y-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input className="field min-w-0 flex-1" value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={`Întreabă-l pe ${label} orice…`} aria-label={`Întrebare pentru ${label}`} />
            <Button type="submit" variant="violet" icon={Send} disabled={!text.trim()} aria-label="Trimite întrebarea">
              <span className="hidden sm:inline">Întreabă</span>
            </Button>
          </form>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_ASKS.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="focus-ring shrink-0 whitespace-nowrap rounded-full bg-violet/10 px-3 py-1 text-xs font-bold text-violet-hi ring-1 ring-violet/25 hover:bg-violet/20">
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="violet" size="sm" icon={Sparkles} onClick={onOpen}>
            Vezi ce poate face {label}
          </Button>
          <span className="text-xs font-semibold text-dim">Planuri, analize și chat, când ești în cont.</span>
        </div>
      )}

      {c.next && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-bold text-dim">
            <span>Spre {c.next.name}</span>
            <span className="tabular">
              {c.ep} / {c.next.min} PE
            </span>
          </div>
          <Bar value={c.progress} tone="violet" label="Progres spre evoluția următoare" />
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ evening review

export function ReviewCard({ d, state, months, review, ai, today }) {
  const [open, setOpen] = useState(false);
  const saved = state.reviews?.[today];
  // the card is closed whenever Acasă is opened, but the report opens by itself the moment it is written,
  // and the "Raport gata" button in the header asks for it open
  const wasSaved = useRef(!!saved);
  useEffect(() => {
    if (saved && !wasSaved.current) setOpen(true);
    wasSaved.current = !!saved;
  }, [saved]);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("molted:open-review", show);
    return () => window.removeEventListener("molted:open-review", show);
  }, []);
  const text = months[monthKey(today)]?.reviews?.[today];
  const entry = d.entry;
  const time = state.settings?.reviewTime || "21:00";
  const left = review.reviewMin - review.now;
  const due = left <= 0;
  const countdown = left > 0 ? (left >= 60 ? `peste ${Math.floor(left / 60)} h ${left % 60} min` : `peste ${left} min`) : "acum";

  let body;
  if (review.status === "running") {
    body = (
      <div className="space-y-2" aria-live="polite">
        <p className="text-sm font-bold text-gold-hi">AI-ul scrie raportul zilei…</p>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  } else if (saved) {
    body = (
      <div>
        <div className="flex items-center gap-4">
          <Ring value={(entry?.score || 0) / 100} size={70} stroke={7} color={tc("gold-ink")}>
            <span className="font-pixel text-xl text-ink">{entry?.score ?? 0}</span>
          </Ring>
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-dim">Scorul zilei</div>
            <div className="font-pixel text-xl text-gold-hi">+{entry?.reviewXp || 0} momentum</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {saved.ai !== null && saved.ai !== undefined ? <Chip tone="violet" icon={Sparkles}>evaluat de AI · {saved.ai}</Chip> : <Chip>închis fără AI</Chip>}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="review-details"
            aria-label={open ? "Ascunde raportul" : "Arată raportul"}
            className="-mr-1 -mt-3 grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-well hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-hi"
          >
            <ChevronDown size={18} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
        {/* the written part folds away; the card starts closed */}
        <div id="review-details" className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={open ? undefined : ""}>
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-3 pt-3">
              {text?.summary && <p className="text-sm leading-relaxed text-body">{text.summary}</p>}
              {text?.highlight && (
                <p className="text-sm">
                  <span className="font-extrabold text-mint">Cel mai bun moment: </span>
                  <span className="text-body">{text.highlight}</span>
                </p>
              )}
              {text?.tip && (
                <p className="text-sm">
                  <span className="font-extrabold text-sky">Pentru mâine: </span>
                  <span className="text-body">{text.tip}</span>
                </p>
              )}
              <p className="text-[11px] font-semibold text-faint">Scorul zilei = 60% din activitatea bifată + 40% evaluarea AI.</p>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-body">
          {due ? (
            <>
              <span className="font-extrabold text-gold-hi">E ora raportului!</span> AI-ul trece prin ziua ta, scrie un rezumat scurt și dă un scor care intră în momentum.
            </>
          ) : (
            <>
              La <span className="font-extrabold text-ink">{fmt12(time)}</span> ({countdown}) AI-ul face rezumatul zilei și îi dă un scor care intră în momentum.
            </>
          )}
        </p>
        {d.pending === 0 && <p className="text-xs font-semibold text-dim">Bifează ceva ca raportul să aducă momentum.</p>}
        {review.status === "error" && (
          <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">{review.error}</p>
        )}
        {!ai.available && review.status !== "error" && (
          <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">AI-ul nu e disponibil acum, deci raportul nu se poate genera.</p>
        )}
        <div className="flex flex-col gap-2">
          <Button id="review-run" variant={due ? "gold" : "ghost"} size="md" icon={Sparkles} className="w-full" disabled={!ai.available} onClick={() => review.run(today)}>
            {review.status === "error" ? "Încearcă din nou" : due ? "Generează raportul" : "Generează acum"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Panel id="review-card" tone="gold" corners className="p-4 sm:p-5">
      <SectionTitle
        icon={Moon}
        tone="gold"
        sub={saved ? "Ziua de azi e închisă" : `Ritualul de seară · ${fmt12(time)}`}
        action={
          !saved && d.pending > 0 ? (
            <span className="font-pixel text-xl text-gold-hi" title="Momentum pe care îl aduce raportul dacă închizi ziua acum">
              +{d.pending}
            </span>
          ) : null
        }
      >
        Raportul zilei
      </SectionTitle>
      {body}
    </Panel>
  );
}

// ------------------------------------------------------------ group

export function GroupMini({ groups, go }) {
  const g = groups.groups[0];
  const loading = groups.status === "loading";
  const ranked = g ? [...g.members].sort((a, b) => (b.weekGain || 0) - (a.weekGain || 0)) : [];
  const myRank = ranked.findIndex((m) => m.isMe);
  const top = ranked.slice(0, 3);
  if (myRank >= 3) top.push(ranked[myRank]);
  return (
    <Panel corners="gold" className="p-4 sm:p-5">
      <SectionTitle
        icon={Users}
        tone="sky"
        sub={g ? (g.info?.kind === "partner" ? "Partener de progres" : g.info?.name) : undefined}
        action={
          <Button variant="ghost" size="sm" icon={MessageCircle} onClick={() => go("group")}>
            {g ? "Reminder" : "Grup"}
          </Button>
        }
      >
        Clasament
      </SectionTitle>
      {loading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Se încarcă…">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !g ? (
        <p className="py-3 text-sm font-semibold text-dim">{groups.cloud ? "Nu ești într-un grup. Creează unul sau intră cu un cod." : "Intră în cont ca să vezi clasamentul."}</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {top.map((m) => {
              const rank = ranked.indexOf(m) + 1;
              return (
                <li key={m.id} className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${m.isMe ? "bg-gold/10 ring-1 ring-gold/30" : "bg-well"}`}>
                  <span className={`w-5 text-center font-pixel text-base ${rank === 1 ? "text-gold" : rank === 2 ? "text-body" : rank === 3 ? "text-ember" : "text-dim"}`}>
                    {rank === 1 ? <Crown size={16} className="mx-auto text-gold" aria-label="Locul 1" /> : rank}
                  </span>
                  <Sprite path={m.path || "sport"} stage={m.stage || "egg"} mood={m.mood || "idle"} size={32} still />
                  <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">
                    {m.name}
                    {m.isMe && <span className="ml-1 text-xs text-gold-hi">(tu)</span>}
                  </span>
                  <span className="font-pixel tabular text-sm text-gold-hi">{m.weekGain || 0}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] font-semibold text-faint">Momentum câștigat de luni încoace.</p>
        </>
      )}
    </Panel>
  );
}
