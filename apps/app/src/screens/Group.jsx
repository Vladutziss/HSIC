import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Copy, Crown, Flame, Handshake, Inbox, LogOut, Medal, Send, UserPlus, Users, X } from "lucide-react";
import { Button, Chip, Confirm, DeleteButton, Empty, Field, LevelBadge, Panel, SectionTitle, Skeleton, Tabs, useToast } from "../components/ui.jsx";
import { dayKey, diffDays, fmt12, fmtDay, todayKey } from "../lib/dates.js";
import { Sprite } from "../components/Sprite.jsx";
import { MAX_GROUPS, MAX_PARTNERS, NUDGE_TEMPLATES } from "../lib/groups.js";
import { PATHS } from "../lib/catalog.js";
import { normalizeLook } from "../lib/cosmetics.js";
import { tr } from "../lib/i18n.js";

const timeAgo = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return tr("acum");
  if (min < 60) return tr("acum {min} min", { min });
  const h = Math.round(min / 60);
  if (h < 24) return tr("acum {h} h", { h });
  const d = Math.round(h / 24);
  return d === 1 ? tr("ieri") : tr("acum {d} zile", { d });
};

const limitText = (kind) =>
  kind === "partner"
    ? tr("Ai deja {MAX_PARTNERS} parteneri de progres. Părăsește un parteneriat ca să creezi altul.", { MAX_PARTNERS })
    : tr("Ai deja {MAX_GROUPS} grupuri. Părăsește un grup ca să creezi altul.", { MAX_GROUPS });

function RowsSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={tr("Se încarcă…")}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-2xl" />
      ))}
    </div>
  );
}

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
      const r = await groups.create(name || (kind === "partner" ? tr("Parteneri de progres") : tr("Grupul meu")), kind);
      toast({ title: kind === "partner" ? tr("Parteneriat creat") : tr("Grup creat"), text: tr("Codul de invitație: {code}", { code: r.code }), icon: Users, tone: "mint", ms: 5000 });
      setName("");
    } catch (e) {
      setError(
        e?.message === "group_limit"
          ? limitText(kind)
          : tr("Nu am putut crea grupul. Verifică dacă ai drept de editare în această pagină.")
      );
    }
    setBusy(null);
  }
  async function join() {
    setBusy("join");
    setError("");
    try {
      const r = await groups.join(code);
      if (!r.ok) setError(tr("Nu există niciun grup cu acest cod."));
      else {
        toast({ title: r.already ? tr("Ești deja în grup") : tr("Ai intrat în grup"), icon: Users, tone: "mint" });
        setCode("");
      }
    } catch (e) {
      setError(
        e?.message === "group_limit"
          ? tr("Ai atins limita pentru acest tip: părăsește un grup sau un partener ca să intri în altul.")
          : e?.message === "partner_full"
            ? tr("Acest parteneriat are deja două persoane.")
            : tr("Nu am putut intra în grup. Încearcă din nou.")
      );
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionTitle icon={Users}>{tr("Creează")}</SectionTitle>
        <Tabs
          value={kind}
          onChange={setKind}
          items={[
            { value: "group", label: tr("Grup"), icon: Users },
            { value: "partner", label: tr("Partener de progres"), icon: Handshake },
          ]}
        />
        <p className="text-xs font-bold text-dim" aria-live="polite">{tr("Grupuri: {used}/{max} · Parteneri de progres: {used2}/{max2}", { used: groups.limits.group.used, max: groups.limits.group.max, used2: groups.limits.partner.used, max2: groups.limits.partner.max })}</p>
        <Field label={tr("Nume")} htmlFor="group-name">
          <input id="group-name" className="field" value={name} maxLength={40} placeholder={kind === "partner" ? tr("ex.: Eu și Andrei") : tr("ex.: Clubul de dimineață")} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button id="group-create" icon={UserPlus} busy={busy === "create"} disabled={groups.limits[kind].used >= groups.limits[kind].max} onClick={create}>{tr("Creează și primește codul")}</Button>
        {groups.limits[kind].used >= groups.limits[kind].max && <p className="text-xs font-semibold text-ember">{limitText(kind)}</p>}
      </Panel>
      <Panel className="space-y-4 p-4 sm:p-5">
        <SectionTitle icon={UserPlus}>{tr("Intră cu un cod")}</SectionTitle>
        <p className="text-sm text-body">{tr("Cere codul de 6 caractere de la cineva din grup. Toți membrii trebuie să poată deschide această aplicație.")}</p>
        <Field label={tr("Cod")} htmlFor="group-code">
          <input id="group-code" className="field font-display text-lg uppercase tracking-[0.3em]" value={code} maxLength={6} placeholder="K7P2QX" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Button variant="violet" icon={Check} busy={busy === "join"} disabled={code.trim().length < 6} onClick={join}>{tr("Intră în grup")}</Button>
      </Panel>
      {error && <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30 md:col-span-2">{error}</p>}
    </div>
  );
}

function Leaderboard({ g, loading }) {
  const [by, setBy] = useState("weekGain");
  const ranked = useMemo(() => [...g.members].sort((a, b) => (b[by] || 0) - (a[by] || 0)), [g.members, by]);
  const unit = { weekGain: "momentum", momentum: tr("puncte"), streak: tr("zile") }[by];
  return (
    <Panel tone="gold" className="p-4 sm:p-5">
      <SectionTitle icon={Crown} sub={tr("Se resetează în fiecare luni")} action={null}>{tr("Clasament")}</SectionTitle>
      <Tabs
        className="mb-4"
        size="sm"
        value={by}
        onChange={setBy}
        items={[
          { value: "weekGain", label: tr("Săptămâna asta") },
          { value: "momentum", label: tr("Momentum") },
          { value: "streak", label: tr("Serie") },
        ]}
      />
      {loading ? (
        <RowsSkeleton />
      ) : ranked.length === 0 ? (
        <Empty icon={Users} title={tr("Încă nu are membri")}>{tr("Clasamentul apare imediat ce intră primul membru.")}</Empty>
      ) : (
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
                  <Crown size={20} className="text-gold" aria-label={tr("Locul 1")} />
                ) : rank <= 3 ? (
                  <Medal size={18} className={rank === 2 ? "text-body" : "text-ember"} aria-label={tr("Locul {rank}", { rank })} />
                ) : (
                  <span className="font-display text-lg text-dim">{rank}</span>
                )}
              </span>
              <span className="pedestal grid h-11 w-11 shrink-0 place-items-center rounded-xl">
                <Sprite path={m.path || "sport"} stage={m.stage || "egg"} mood={m.mood || "idle"} size={32} look={normalizeLook(m.look)} still />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-extrabold text-ink">{m.name}</span>
                  {m.isMe && <Chip tone="gold">{tr("tu")}</Chip>}
                  {m.mood === "sleep" && <Chip tone="violet">{tr("doarme")}</Chip>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-dim">
                  <span>{PATHS[m.path]?.cls || tr("Aventurier")}</span>
                  <span className="inline-flex items-center gap-1">
                    <Flame size={12} className="text-ember" aria-hidden="true" /> {m.streak || 0}
                  </span>
                  {m.todayTotal ? (
                    <span>{tr("azi {v}/{todayTotal}", { v: m.todayDone || 0, todayTotal: m.todayTotal })}</span>
                  ) : null}
                </div>
              </div>
              <LevelBadge lvl={m.level || 1} size={30} tone={m.isMe ? "gold" : "violet"} />
              <div className="w-16 shrink-0 text-right sm:w-20">
                <div className="font-display tabular text-xl leading-none text-ink">{m[by] || 0}</div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-dim">{unit}</div>
              </div>
            </li>
          );
        })}
      </ol>
      )}
    </Panel>
  );
}

// "azi" / "ieri" / the date, as a divider between days in the chat
const dayLabel = (key) => {
  const n = diffDays(key, todayKey());
  return n === 0 ? tr("Azi") : n === 1 ? tr("Ieri") : fmtDay(key);
};
const clock = (iso) => {
  const d = new Date(iso);
  return fmt12(d.getHours() * 60 + d.getMinutes());
};

/** The reminders as a chat: what friends sent you on the left, what you sent on the right, oldest first. */
function ChatPanel({ g, groups, loading }) {
  const toast = useToast();
  const names = Object.fromEntries(g.members.map((m) => [m.id, m]));
  const others = g.members.filter((m) => !m.isMe);
  const othersKey = others.map((m) => m.id).join();
  // the message goes to everyone unless you pick people
  const [to, setTo] = useState(() => others.map((m) => m.id));
  useEffect(() => setTo(others.map((m) => m.id)), [g.id, othersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const all = others.length > 0 && to.length === others.length;
  const toggle = (id) => setTo((x) => (all ? [id] : x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const canSend = to.length > 0 && text.trim().length > 0 && !busy;
  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      await groups.send(g.id, to, text.trim());
      setText("");
    } catch {
      toast({ title: tr("Nu am putut trimite mesajul"), tone: "rose", icon: Bell });
    }
    setBusy(false);
  }
  const unread = g.inbox.filter((n) => !n.read).length;
  const [markingAll, setMarkingAll] = useState(false);
  async function markAll() {
    setMarkingAll(true);
    try {
      await groups.markAllRead(g.id);
    } catch {
      toast({ title: tr("Nu am putut marca mesajele"), tone: "rose", icon: Bell });
    }
    setMarkingAll(false);
  }
  const thread = useMemo(
    () =>
      [...g.inbox.map((n) => ({ ...n, mine: false })), ...g.sent.map((n) => ({ ...n, mine: true }))]
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .slice(-40),
    [g.inbox, g.sent]
  );
  const scroller = useRef(null);
  // the newest message sits at the bottom, like in any chat; only this list scrolls, not the page. It follows the last
  // message, not the count: the thread is cut to 40, so the count stops changing once the chat is that long
  const last = thread.at(-1);
  const lastKey = last ? `${last.mine ? "o" : "i"}-${last.id}` : "";
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [g.id, lastKey, loading]);

  let lastDay = null;
  return (
    <Panel className="p-4 sm:p-5">
      <SectionTitle
        icon={Inbox}
        className="flex-wrap gap-y-2"
        sub={tr("Încurajări între voi, ca într-un chat")}
        action={
          unread ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Chip>{tr("{unread} necitite", { unread })}</Chip>
              <Button size="sm" variant="ghost" icon={CheckCheck} busy={markingAll} disabled={markingAll} onClick={markAll}>{tr("Marchează toate citite")}</Button>
            </div>
          ) : null
        }
      >{tr("Chat-ul grupului")}</SectionTitle>
      {loading ? (
        <RowsSkeleton rows={3} />
      ) : thread.length === 0 ? (
        <Empty icon={Inbox} title={tr("Niciun mesaj încă")}>
          {others.length ? tr("Scrie primul mesaj mai jos: o încurajare sau un „hai, azi!”.") : tr("Trimite codul de invitație prietenilor tăi, apoi vă puteți scrie aici.")}
        </Empty>
      ) : (
        <div ref={scroller} className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-2xl bg-well/60 p-3 ring-1 ring-edge" role="log" aria-live="polite" aria-label={tr("Conversația din grup")}>
          {thread.map((n) => {
            const day = dayKey(new Date(n.at));
            const divider = day !== lastDay;
            lastDay = day;
            const who = n.mine ? null : names[n.from];
            const toNames = n.mine ? (n.to || []).map((id) => names[id]?.name || tr("membru")).join(", ") : "";
            return (
              <React.Fragment key={`${n.mine ? "o" : "i"}-${n.id}`}>
                {divider && (
                  <div className="flex justify-center py-1.5">
                    <span className="rounded-full bg-panel px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-dim ring-1 ring-edge">{dayLabel(day)}</span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${n.mine ? "justify-end" : "justify-start"}`}>
                  {!n.mine && <Sprite path={who?.path || "sport"} stage={who?.stage || "egg"} mood="idle" size={36} look={normalizeLook(who?.look)} still className="-mb-1 shrink-0" />}
                  <div className={`flex min-w-0 max-w-[82%] flex-col ${n.mine ? "items-end" : "items-start"}`}>
                    {!n.mine && <span className="mb-0.5 px-1 text-xs font-extrabold text-ink">{who?.name || tr("Un membru")}</span>}
                    <p
                      className={`break-words px-3.5 py-2 text-sm leading-snug ${
                        n.mine
                          ? "rounded-2xl rounded-br-md bg-mint/20 text-ink ring-1 ring-mint/40"
                          : `rounded-2xl rounded-bl-md bg-panel text-body ring-1 ${n.read ? "ring-edge" : "ring-violet/50"}`
                      }`}
                    >
                      {n.text}
                    </p>
                    <span className="mt-0.5 flex items-center gap-2 px-1 text-xs font-semibold text-faint">
                      {n.mine && toNames && <span className="truncate">{tr("către {toNames} ·", { toNames })}</span>}
                      {clock(n.at)}
                      {!n.mine && !n.read && (
                        <button type="button" onClick={() => groups.markRead(g.id, n.id)} className="focus-ring rounded px-1 font-extrabold text-violet-hi hover:underline">{tr("Marchează citit")}</button>
                      )}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {!loading && others.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-extrabold text-dim">{tr("Către:")}</span>
            <button
              type="button"
              aria-pressed={all}
              onClick={() => setTo(others.map((m) => m.id))}
              className={`focus-ring rounded-full px-3 py-1 text-xs font-extrabold transition ${all ? "bg-mint text-on-mint" : "text-dim ring-1 ring-edge hover:text-ink"}`}
            >{tr("Toți")}</button>
            {others.map((m) => {
              const on = !all && to.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                  className={`focus-ring inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-extrabold transition ${on ? "bg-mint text-on-mint" : "text-body ring-1 ring-edge hover:text-ink"}`}
                >
                  <Sprite path={m.path || "sport"} stage={m.stage || "egg"} mood="idle" size={24} look={normalizeLook(m.look)} still />
                  {m.name}
                </button>
              );
            })}
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NUDGE_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setText(t)}
                className="shrink-0 whitespace-nowrap rounded-full bg-violet/10 px-2.5 py-1 text-xs font-bold text-violet-hi ring-1 ring-violet/25 hover:bg-violet/20"
              >
                {t}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              id="nudge-text"
              rows={1}
              className="field max-h-32 min-h-[46px] flex-1 resize-none"
              value={text}
              maxLength={200}
              placeholder={all ? tr("Scrie grupului…") : tr("Scrie lui {v}", { v: to.map((id) => names[id]?.name).filter(Boolean).join(", ") || "…" })}
              aria-label={tr("Mesaj")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button id="nudge-send" type="submit" variant="mint" icon={Send} busy={busy} disabled={!canSend} aria-label={tr("Trimite")}>
              <span className="hidden sm:inline">{tr("Trimite")}</span>
            </Button>
          </form>
        </div>
      )}
    </Panel>
  );
}

function GroupView({ g, groups, loading }) {
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(g.info.code);
      toast({ title: tr("Cod copiat"), text: g.info.code, icon: Copy, tone: "mint", ms: 2000 });
    } catch {
      toast({ title: tr("Copiază codul manual"), text: g.info.code, icon: Copy });
    }
  };
  return (
    <div className="space-y-5">
      <Panel className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky/15 text-sky ring-1 ring-sky/30">
          {g.info.kind === "partner" ? <Handshake size={24} aria-hidden="true" /> : <Users size={24} aria-hidden="true" />}
        </span>
        <div className="min-w-[200px] flex-1">
          <h2 className="font-display text-2xl text-ink">{g.info.name || tr("Grup")}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-dim">
            <Chip tone="sky">{g.info.kind === "partner" ? tr("Partener de progres") : tr("Grup de self-improvement")}</Chip>
            <span>
              {g.members.length} {g.members.length === 1 ? tr("membru") : tr("membri")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-well px-3 py-2 ring-1 ring-edge hover:ring-gold/60" aria-label={tr("Copiază codul {code}", { code: g.info.code })}>
            <span className="font-display text-lg tracking-[0.25em] text-gold-hi">{g.info.code}</span>
            <Copy size={15} className="text-dim" aria-hidden="true" />
          </button>
          <DeleteButton icon={LogOut} title={tr("Ieși din grup")} label={tr("Ieși din grupul {v}", { v: g.info.name || "" }).trim()} onClick={() => setLeaving(true)} />
        </div>
      </Panel>
      <Confirm
        open={leaving}
        title={tr("Ieși din grup?")}
        confirmLabel={tr("Ieși din grup")}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          groups.leave(g.id);
        }}
      >{tr("Nu vei mai vedea clasamentul și mesajele grupului „{v}”. Poți reveni mai târziu cu codul de invitație ({code}).", { v: g.info.name || tr("Grup"), code: g.info.code })}</Confirm>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <ChatPanel g={g} groups={groups} loading={loading} />
        </div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Leaderboard g={g} loading={loading} />
        </div>
      </div>
    </div>
  );
}

export default function Group({ groups }) {
  const list = groups.groups;
  const [active, setActive] = useState(null);
  const [adding, setAdding] = useState(false);
  const current = list.find((g) => g.id === active) || list[0] || null;
  const { status } = groups;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div />
        {groups.cloud && list.length > 0 && (
          <Button variant="ghost" size="sm" icon={adding ? X : UserPlus} onClick={() => setAdding((x) => !x)}>
            {adding ? tr("Anulează") : tr("Grup nou sau cod")}
          </Button>
        )}
      </div>

      {!groups.cloud ? (
        <Panel>
          <Empty icon={Users} title={tr("Grupurile au nevoie de cont")}>{tr("Intră în cont, ca tu și prietenii tăi să vedeți același clasament și aceleași remindere.")}</Empty>
        </Panel>
      ) : (
        <>
          {status === "error" && (
            <p role="alert" className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">{tr("Nu am putut citi datele grupului. Se reîncearcă automat.")}</p>
          )}
          {(list.length === 0 || adding) && <CreateJoin groups={groups} />}
          {list.length > 1 && <Tabs value={current?.id} onChange={setActive} items={list.map((g) => ({ value: g.id, label: g.info.name || tr("Grup") }))} />}
          {current && <GroupView g={current} groups={groups} loading={status === "loading"} />}
        </>
      )}
    </div>
  );
}
