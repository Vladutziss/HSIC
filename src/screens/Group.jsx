import React, { useMemo, useState } from "react";
import { Bell, Check, Copy, Crown, Flame, Handshake, Inbox, LogOut, Medal, Send, UserPlus, Users } from "lucide-react";
import { Button, Chip, Empty, Field, LevelBadge, Panel, SectionTitle, Tabs, useToast } from "../components/ui.jsx";
import { Sprite } from "../components/Sprite.jsx";
import { NUDGE_TEMPLATES } from "../lib/groups.js";
import { PATHS } from "../lib/catalog.js";

const timeAgo = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "acum";
  if (min < 60) return `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `acum ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ieri" : `acum ${d} zile`;
};

function CreateJoin({ groups }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("group");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  async function create() {
    setBusy("create");
    setError("");
    try {
      const r = await groups.create(name || (kind === "partner" ? "Parteneri de progres" : "Grupul meu"), kind);
      toast({ title: kind === "partner" ? "Parteneriat creat" : "Grup creat", text: `Codul de invitație: ${r.code}`, icon: Users, tone: "mint", ms: 5000 });
      setName("");
    } catch {
      setError("Nu am putut crea grupul. Verifică dacă ai drept de editare în această pagină.");
    }
    setBusy(null);
  }
  async function join() {
    setBusy("join");
    setError("");
    try {
      const r = await groups.join(code);
      if (!r.ok) setError("Nu există niciun grup cu acest cod.");
      else {
        toast({ title: r.already ? "Ești deja în grup" : "Ai intrat în grup", icon: Users, tone: "mint" });
        setCode("");
      }
    } catch {
      setError("Nu am putut intra în grup. Încearcă din nou.");
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionTitle icon={Users} tone="gold">
          Creează
        </SectionTitle>
        <Tabs
          value={kind}
          onChange={setKind}
          items={[
            { value: "group", label: "Grup", icon: Users },
            { value: "partner", label: "Partener de progres", icon: Handshake },
          ]}
        />
        <Field label="Nume" htmlFor="group-name">
          <input id="group-name" className="field" value={name} maxLength={40} placeholder={kind === "partner" ? "ex.: Eu și Andrei" : "ex.: Clubul de dimineață"} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button id="group-create" icon={UserPlus} busy={busy === "create"} onClick={create}>
          Creează și primește codul
        </Button>
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionTitle icon={UserPlus} tone="sky">
          Intră cu un cod
        </SectionTitle>
        <p className="text-sm text-body">Cere codul de 6 caractere de la cineva din grup. Toți membrii trebuie să poată deschide această aplicație.</p>
        <Field label="Cod" htmlFor="group-code">
          <input id="group-code" className="field font-pixel text-lg uppercase tracking-[0.3em]" value={code} maxLength={6} placeholder="K7P2QX" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Button variant="violet" icon={Check} busy={busy === "join"} disabled={code.trim().length < 6} onClick={join}>
          Intră în grup
        </Button>
      </Panel>
      {error && <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30 md:col-span-2">{error}</p>}
    </div>
  );
}

function Leaderboard({ g }) {
  const [by, setBy] = useState("weekGain");
  const ranked = useMemo(() => [...g.members].sort((a, b) => (b[by] || 0) - (a[by] || 0)), [g.members, by]);
  const unit = { weekGain: "momentum", momentum: "puncte", streak: "zile" }[by];
  return (
    <Panel tone="gold" corners className="p-4 sm:p-5">
      <SectionTitle icon={Crown} tone="gold" sub="Se resetează în fiecare luni" action={null}>
        Clasament
      </SectionTitle>
      <Tabs
        className="mb-4"
        size="sm"
        value={by}
        onChange={setBy}
        items={[
          { value: "weekGain", label: "Săptămâna asta" },
          { value: "momentum", label: "Momentum" },
          { value: "streak", label: "Serie" },
        ]}
      />
      <ol className="space-y-2">
        {ranked.map((m, i) => {
          const rank = i + 1;
          return (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${m.isMe ? "bg-gold/10 ring-1 ring-gold/40" : "bg-well ring-1 ring-edge"}`}
            >
              <span className="grid w-7 place-items-center">
                {rank === 1 ? (
                  <Crown size={20} className="text-gold" aria-label="Locul 1" />
                ) : rank <= 3 ? (
                  <Medal size={18} className={rank === 2 ? "text-body" : "text-ember"} aria-label={`Locul ${rank}`} />
                ) : (
                  <span className="font-pixel text-lg text-dim">{rank}</span>
                )}
              </span>
              <span className="pedestal grid h-11 w-11 shrink-0 place-items-center rounded-xl">
                <Sprite path={m.path || "sport"} stage={m.stage || "egg"} mood={m.mood || "idle"} size={32} still />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-extrabold text-ink">{m.name}</span>
                  {m.isMe && <Chip tone="gold">tu</Chip>}
                  {m.mood === "sleep" && <Chip tone="violet">doarme</Chip>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-dim">
                  <span>{PATHS[m.path]?.cls || "Aventurier"}</span>
                  <span className="inline-flex items-center gap-1">
                    <Flame size={12} className="text-ember" aria-hidden="true" /> {m.streak || 0}
                  </span>
                  {m.todayTotal ? (
                    <span>
                      azi {m.todayDone || 0}/{m.todayTotal}
                    </span>
                  ) : null}
                </div>
              </div>
              <LevelBadge lvl={m.level || 1} size={30} tone={m.isMe ? "gold" : "violet"} />
              <div className="w-16 shrink-0 text-right sm:w-20">
                <div className="font-pixel tabular text-xl leading-none text-ink">{m[by] || 0}</div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-dim">{unit}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Composer({ g, groups }) {
  const toast = useToast();
  const others = g.members.filter((m) => !m.isMe);
  const [to, setTo] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const all = others.length > 0 && to.length === others.length;
  const toggle = (id) => setTo((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  async function send() {
    setBusy(true);
    try {
      await groups.send(g.id, to, text);
      toast({ title: "Reminder trimis", text: to.length === others.length ? "către tot grupul" : `către ${to.length} ${to.length === 1 ? "persoană" : "persoane"}`, icon: Send, tone: "mint" });
      setText("");
      setTo([]);
    } catch {
      toast({ title: "Nu am putut trimite reminderul", tone: "rose", icon: Bell });
    }
    setBusy(false);
  }
  return (
    <Panel className="space-y-4 p-4 sm:p-5">
      <SectionTitle icon={Send} tone="mint" sub="Unui prieten, mai multora sau întregului grup">
        Trimite un reminder
      </SectionTitle>
      {others.length === 0 ? (
        <p className="text-sm text-dim">Încă nu mai e nimeni în grup. Trimite codul prietenilor tăi.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={all}
              onClick={() => setTo(all ? [] : others.map((m) => m.id))}
              className={`focus-ring rounded-full px-3 py-1.5 text-xs font-extrabold transition ${all ? "bg-gold text-on-gold" : "text-dim ring-1 ring-edge hover:text-ink"}`}
            >
              Tot grupul
            </button>
            {others.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={to.includes(m.id)}
                onClick={() => toggle(m.id)}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-extrabold transition ${
                  to.includes(m.id) ? "bg-mint text-on-mint" : "text-body ring-1 ring-edge hover:text-ink"
                }`}
              >
                <Sprite path={m.path || "sport"} stage={m.stage || "egg"} mood="idle" size={32} still className="-my-1" />
                {m.name}
              </button>
            ))}
          </div>
          <textarea id="nudge-text" className="field min-h-[80px]" value={text} maxLength={200} placeholder="Scrie un mesaj scurt…" onChange={(e) => setText(e.target.value)} aria-label="Mesajul reminderului" />
          <div className="flex flex-wrap gap-1.5">
            {NUDGE_TEMPLATES.map((t) => (
              <button key={t} type="button" onClick={() => setText(t)} className="rounded-full bg-violet/10 px-2.5 py-1 text-left text-xs font-bold text-violet-hi ring-1 ring-violet/25 hover:bg-violet/20">
                {t}
              </button>
            ))}
          </div>
          <Button id="nudge-send" variant="mint" icon={Send} busy={busy} disabled={!to.length || !text.trim()} onClick={send}>
            Trimite
          </Button>
        </>
      )}
    </Panel>
  );
}

function InboxPanel({ g, groups }) {
  const [tab, setTab] = useState("in");
  const names = Object.fromEntries(g.members.map((m) => [m.id, m]));
  const list = tab === "in" ? g.inbox : g.sent;
  const unread = g.inbox.filter((n) => !n.read).length;
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle icon={Inbox} tone="violet">
        Remindere
      </SectionTitle>
      <Tabs
        className="mb-3"
        size="sm"
        value={tab}
        onChange={setTab}
        items={[
          { value: "in", label: "Primite", count: unread },
          { value: "out", label: "Trimise" },
        ]}
      />
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm font-semibold text-dim">{tab === "in" ? "Niciun reminder primit." : "Nu ai trimis încă niciun reminder."}</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 20).map((n) => {
            const who = tab === "in" ? names[n.from] : null;
            const toNames = tab === "out" ? (n.to || []).map((id) => names[id]?.name || "membru").join(", ") : "";
            return (
              <li key={n.id} className={`flex items-start gap-3 rounded-xl p-3 ${tab === "in" && !n.read ? "bg-violet/10 ring-1 ring-violet/30" : "bg-well"}`}>
                {who ? (
                  <Sprite path={who.path || "sport"} stage={who.stage || "egg"} mood="idle" size={32} still />
                ) : (
                  <Send size={18} className="mt-1 text-mint" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-dim">
                    {tab === "in" ? <span className="font-extrabold text-ink">{who?.name || "Un membru"}</span> : <>către {toNames}</>} · {timeAgo(n.at)}
                  </div>
                  <p className="text-sm text-body">{n.text}</p>
                </div>
                {tab === "in" && !n.read && (
                  <button type="button" onClick={() => groups.markRead(g.id, n.id)} className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold text-violet-hi hover:bg-violet/15">
                    Citit
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function GroupView({ g, groups }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(g.info.code);
      toast({ title: "Cod copiat", text: g.info.code, icon: Copy, tone: "mint", ms: 2000 });
    } catch {
      toast({ title: "Copiază codul manual", text: g.info.code, icon: Copy });
    }
  };
  return (
    <div className="space-y-5">
      <Panel className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky/15 text-sky ring-1 ring-sky/30">
          {g.info.kind === "partner" ? <Handshake size={24} aria-hidden="true" /> : <Users size={24} aria-hidden="true" />}
        </span>
        <div className="min-w-[200px] flex-1">
          <h2 className="font-pixel text-2xl text-ink">{g.info.name || "Grup"}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-dim">
            <Chip tone="sky">{g.info.kind === "partner" ? "Partener de progres" : "Grup de self-improvement"}</Chip>
            <span>
              {g.members.length} {g.members.length === 1 ? "membru" : "membri"}
            </span>
            {g.demo && <Chip tone="violet">demonstrativ: membrii sunt simulați</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-well px-3 py-2 ring-1 ring-edge hover:ring-gold/60" aria-label={`Copiază codul ${g.info.code}`}>
            <span className="font-pixel text-lg tracking-[0.25em] text-gold-hi">{g.info.code}</span>
            <Copy size={15} className="text-dim" aria-hidden="true" />
          </button>
          {!g.demo && (
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => groups.leave(g.id)}>
              Ieși
            </Button>
          )}
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Leaderboard g={g} />
        </div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Composer g={g} groups={groups} />
          <InboxPanel g={g} groups={groups} />
        </div>
      </div>
    </div>
  );
}

export default function Group({ groups, mode }) {
  const real = groups.groups.real;
  const [active, setActive] = useState(null);
  const [adding, setAdding] = useState(false);
  const current = real.find((g) => g.id === active) || real[0] || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-ink">Grup</h1>
          <p className="text-sm font-semibold text-dim">Progres împreună: clasament săptămânal și remindere între prieteni.</p>
        </div>
        {groups.cloud && real.length > 0 && (
          <Button variant="ghost" size="sm" icon={UserPlus} onClick={() => setAdding((x) => !x)}>
            {adding ? "Închide" : "Grup nou sau cod"}
          </Button>
        )}
      </div>

      {groups.cloud ? (
        <>
          {(real.length === 0 || adding) && <CreateJoin groups={groups} />}
          {real.length > 1 && (
            <Tabs value={current?.id} onChange={setActive} items={real.map((g) => ({ value: g.id, label: g.info.name || "Grup" }))} />
          )}
          {current && <GroupView g={current} groups={groups} />}
          {real.length === 0 && (
            <>
              <p className="text-sm font-semibold text-dim">Până îți faci un grup, uite cum arată unul:</p>
              <GroupView g={groups.groups.demo} groups={groups} />
            </>
          )}
        </>
      ) : (
        <>
          <Panel className="flex flex-wrap items-center gap-4 p-4">
            <Users size={22} className="text-sky" aria-hidden="true" />
            <p className="min-w-[220px] flex-1 text-sm text-body">
              {mode === "loading"
                ? "Se încarcă…"
                : "Grupurile reale au nevoie de baza de date a aplicației publicate pe claude.ai, ca toți membrii să vadă același clasament. Aici vezi un grup demonstrativ."}
            </p>
          </Panel>
          <GroupView g={groups.groups.demo} groups={groups} />
        </>
      )}
    </div>
  );
}
