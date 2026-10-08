import React, { useEffect, useState } from "react";
import { BookOpenText, Camera, Clock, Crown, ListTodo, MessageCircle, Moon, Plus, ScrollText, Sparkles, Users } from "lucide-react";
import { Bar, Button, Chip, CheckButton, Gems, Panel, Ring, SectionTitle, Skeleton } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { ProofBadge } from "./ProofModal.jsx";
import { iconFor } from "./icons.js";
import { PATHS } from "../lib/catalog.js";
import { CODE_VERDICT, checkInGain } from "../lib/derive.js";
import { fmtDay, monthKey } from "../lib/dates.js";
import { c as tc } from "../lib/themes.js";

// ------------------------------------------------------------ quests

export function QuestCard({ h, code, scheduled, runMult, onCheck, onProof, onOpen }) {
  const Icon = iconFor(h.icon);
  const done = code > 0;
  const verdict = CODE_VERDICT[code];
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(0), 1200);
    return () => clearTimeout(t);
  }, [burst]);
  const click = () => {
    if (!done) setBurst(checkInGain(h, 1, runMult));
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
              {h.time}
            </span>
          )}
          {done ? (
            verdict ? (
              <ProofBadge verdict={verdict} />
            ) : (
              <span className="font-extrabold text-mint">Bifat · adaugă o dovadă pentru bonus</span>
            )
          ) : (
            <span className="font-extrabold text-gold-hi">
              +{checkInGain(h, 1, runMult)}
              <span className="hidden sm:inline"> · până la +{checkInGain(h, 4, runMult)} cu dovadă</span>
            </span>
          )}
        </div>
      </div>
      {!verdict && (
        <Button variant={done ? "violet" : "ghost"} size="sm" icon={Camera} onClick={() => onProof(h.id)} aria-label={`Trimite o dovadă pentru ${h.name}`}>
          <span className="hidden sm:inline">Dovadă</span>
        </Button>
      )}
      <CheckButton checked={done} onClick={click} label={done ? `Anulează bifa pentru ${h.name}` : `Bifează ${h.name}`} />
      {burst > 0 && <span className="anim-rise font-pixel pointer-events-none absolute right-6 top-0 text-lg font-bold text-gold">+{burst}</span>}
    </div>
  );
}

// ------------------------------------------------------------ companion

export function moodLine(c, name) {
  const n = name || "Molt-ul tău";
  if (c.stage.id === "egg") {
    if (c.mood === "sleep") return "Oul e rece și liniștit. Se încălzește din nou cu prima ta dovadă.";
    return c.ep > 0 ? "Oul a început să crape! Încă o dovadă și se deschide." : "Oul se încălzește cu fiecare dovadă pe care o trimiți.";
  }
  if (c.mood === "sleep") return `${n} doarme. Se trezește când revii.`;
  if (c.mood === "joy") return `${n} sare de bucurie că ai revenit!`;
  if (c.mood === "happy") return `${n} e mândru de tine: toate misiunile de azi sunt gata.`;
  return `${n} te așteaptă la următoarea dovadă.`;
}

export function CompanionCard({ c, path, lastStory, onOpen, onProof }) {
  const cls = PATHS[path]?.cls;
  return (
    <Panel tone="violet" corners className="overflow-hidden">
      <div className="pedestal flex justify-center rounded-t-[18px] pt-5">
        <Sprite path={path} stage={c.stage.id} mood={c.mood} size={160} crack={eggCrack(c.ep)} label={`${c.name || "Oul tău"}, ${c.stage.name}`} />
      </div>
      <div className="scene-ground h-3" />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-pixel text-2xl text-ink">{c.name || "Oul tău"}</div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-violet-hi">
              {c.stage.name} · {cls}
            </div>
          </div>
          <Chip tone="violet" icon={Sparkles}>
            {c.ep} PE
          </Chip>
        </div>
        <div className="relative rounded-xl bg-well p-3 text-sm font-semibold text-body ring-1 ring-edge">
          <span className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 bg-well ring-1 ring-edge [clip-path:polygon(0_0,100%_0,0_100%)]" aria-hidden="true" />
          {moodLine(c, c.name)}
        </div>
        {c.next && (
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-dim">
              <span>Spre {c.next.name}</span>
              <span className="tabular">
                {c.ep} / {c.next.min} PE
              </span>
            </div>
            <Bar value={c.progress} tone="violet" label="Progres spre evoluția următoare" />
          </div>
        )}
        {lastStory && (
          <figure className="inset p-3">
            <figcaption className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-gold">
              <ScrollText size={12} aria-hidden="true" /> {lastStory.title}
            </figcaption>
            <p className="line-clamp-3 text-sm italic leading-relaxed text-body">{lastStory.story}</p>
          </figure>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="violet" size="sm" icon={Camera} onClick={onProof}>
            Trimite o dovadă
          </Button>
          <Button variant="ghost" size="sm" icon={BookOpenText} onClick={onOpen}>
            Povestea
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ evening review

export function ReviewCard({ d, state, months, review, ai, today }) {
  const saved = state.reviews?.[today];
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
        <p className="text-sm font-bold text-gold-hi">{ai.available ? "AI-ul scrie raportul zilei…" : "Închidem ziua…"}</p>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  } else if (saved) {
    body = (
      <div className="space-y-3">
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
              La <span className="font-extrabold text-ink">{time}</span> ({countdown}) AI-ul face rezumatul zilei și îi dă un scor care intră în momentum.
            </>
          )}
        </p>
        <div className="inset flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-xs font-bold text-dim">{d.pending > 0 ? "Raportul ar adăuga acum" : "Bifează ceva ca raportul să aducă momentum"}</span>
          {d.pending > 0 && <span className="font-pixel text-lg text-gold-hi">+{d.pending}</span>}
        </div>
        {review.status === "error" && (
          <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">{review.error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button id="review-run" variant={due ? "gold" : "ghost"} size="sm" icon={Sparkles} onClick={() => review.run(today)}>
            {ai.available ? (due ? "Generează raportul" : "Generează acum") : "Închide ziua"}
          </Button>
          {review.status === "error" && (
            <Button variant="ghost" size="sm" onClick={() => review.run(today, { allowTemplate: true })}>
              Închide fără AI
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Panel id="review-card" tone="gold" corners className="p-4 sm:p-5">
      <SectionTitle icon={Moon} tone="gold" sub={saved ? "Ziua de azi e închisă" : `Ritualul de seară · ${time}`}>
        Raportul zilei
      </SectionTitle>
      {body}
    </Panel>
  );
}

// ------------------------------------------------------------ group

export function GroupMini({ groups, go }) {
  const g = groups.groups.real[0] || groups.groups.demo;
  const ranked = [...g.members].sort((a, b) => (b.weekGain || 0) - (a.weekGain || 0));
  const myRank = ranked.findIndex((m) => m.isMe);
  const top = ranked.slice(0, 3);
  if (myRank >= 3) top.push(ranked[myRank]);
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={Users}
        tone="sky"
        sub={g.demo ? "Grup demonstrativ" : g.info?.kind === "partner" ? "Partener de progres" : g.info?.name}
        action={
          <Button variant="ghost" size="sm" icon={MessageCircle} onClick={() => go("group")}>
            Reminder
          </Button>
        }
      >
        Clasament
      </SectionTitle>
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
    </Panel>
  );
}

// ------------------------------------------------------------ to-dos today

export function TodayTodos({ state, today, todo, go }) {
  const [text, setText] = useState("");
  const todos = (state.todos || []).filter((t) => (t.date === today && (!t.done || t.doneOn === today)) || (!t.done && t.date && t.date < today));
  todos.sort((a, b) => Number(a.done) - Number(b.done) || (a.time || "99").localeCompare(b.time || "99"));
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={ListTodo}
        tone="mint"
        sub={`${todos.filter((t) => t.done).length} din ${todos.length} gata · +5 momentum fiecare`}
        action={
          <Button variant="ghost" size="sm" onClick={() => go("plan")}>
            Planificator
          </Button>
        }
      >
        To-do azi
      </SectionTitle>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          todo.add({ title: text.trim().slice(0, 80) });
          setText("");
        }}
      >
        <input id="quick-todo" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Adaugă ceva pentru azi…" aria-label="To-do nou pentru azi" />
        <Button type="submit" variant="mint" icon={Plus} aria-label="Adaugă to-do">
          <span className="hidden sm:inline">Adaugă</span>
        </Button>
      </form>
      {todos.length === 0 ? (
        <p className="py-3 text-center text-sm font-semibold text-dim">Nimic pe lista de azi.</p>
      ) : (
        <ul className="space-y-1.5">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl bg-well px-3 py-2">
              <CheckButton size="sm" checked={t.done} onClick={() => todo.toggle(t.id)} label={t.done ? `Debifează ${t.title}` : `Bifează ${t.title}`} />
              <button type="button" onClick={() => todo.edit(t)} className={`min-w-0 flex-1 truncate text-left text-sm font-bold ${t.done ? "text-faint line-through" : "text-ink"}`}>
                {t.title}
              </button>
              {t.date < today && !t.done ? (
                <Chip tone="ember">din {fmtDay(t.date)}</Chip>
              ) : (
                t.time && <span className="text-xs font-bold text-dim">{t.time}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
