// Settings → Integrări: a calendar subscription, Markdown notes for Obsidian, webhooks, Notion and AI agents (MCP).
// The files (calendar, notes) are made in the browser and work everywhere except inside a claude.ai artifact, which
// cannot save files; the rest needs the account (web build, signed in). Server side: docs/INTEGRATIONS.md.

import React, { useEffect, useState } from "react";
import { Bot, CalendarDays, Check, Copy, Download, FileText, KeyRound, Plug, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { Button, Chip, Field, Panel, SectionTitle, Toggle } from "./ui.jsx";
import { inViewer } from "../lib/platform.js";
import { getClient } from "../lib/supabase.js";
import { load as loadReflections } from "../lib/reflections.js";
import { monthKey, addDays } from "../lib/dates.js";
import { checkWebhookUrl, WEBHOOK_EVENTS } from "../lib/webhookUrl.js";
import * as I from "../lib/integrations.js";
import { intlTag, tr } from "../lib/i18n.js";

const EVENT_LABEL = {
  "habit.checked": tr("Obicei bifat"),
  "plan.applied": tr("Plan aplicat"),
  "report.created": tr("Raport de seară"),
  "reflection.created": tr("Reflecție săptămânală"),
};
const URL_PROBLEM = {
  format: tr("Nu e o adresă validă."),
  scheme: tr("Adresa trebuie să înceapă cu https://."),
  credentials: tr("Fără nume și parolă în adresă."),
  host: tr("Folosește un nume de domeniu (de exemplu hooks.zapier.com)."),
  private: tr("Adresele locale sau private nu sunt permise."),
};
const when = (iso) => (iso ? new Date(iso).toLocaleString(intlTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

function CopyField({ value, label, id }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      document.getElementById(id)?.select();
    }
  };
  return (
    <div className="flex gap-2">
      <input id={id} readOnly className="field min-w-0 flex-1 font-mono text-xs" value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <Button size="sm" variant="ghost" icon={done ? Check : Copy} onClick={copy} aria-label={tr("Copiază: {label}", { label })}>{done ? tr("Copiat") : tr("Copiază")}</Button>
    </div>
  );
}

function Block({ icon: Icon, title, hint, children }) {
  return (
    <section className="space-y-2.5 border-t border-edge pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-extrabold text-ink">{title}</h3>
          {hint && <p className="text-xs font-semibold text-dim">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const errText = (e) => (e?.code === "limit" ? tr("Ai atins limita.") : e?.code === "unavailable" ? tr("Funcția nu e disponibilă acum.") : tr("Nu s-a putut. Încearcă din nou."));

// ------------------------------------------------------------ files

function Files({ state, today, months, loadMonth }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [days, setDays] = useState(30);
  async function notes() {
    setBusy(true);
    setMsg("");
    try {
      const from = addDays(today, -(days - 1));
      const keys = [...new Set([monthKey(from), monthKey(addDays(from, 31)), monthKey(today)])].filter((k) => k <= monthKey(today));
      const docs = await Promise.all(keys.map((k) => (loadMonth ? loadMonth(k) : months?.[k])));
      const reviews = Object.assign({}, ...docs.map((d) => d?.reviews || {}));
      const reflections = await getClient()
        .then((c) => (c && window.Clerk?.session ? loadReflections(c, { limit: 20 }) : []))
        .catch(() => []);
      const { count, bytes } = I.notesZip(state, today, { days, reviews, reflections });
      if (!count) setMsg(tr("Nu ai încă nimic de exportat în perioada asta."));
      else {
        I.saveFile(`molted-notite-${today}.zip`, bytes, "application/zip");
        setMsg(count === 1 ? tr("O notiță salvată.") : tr("{n} notițe salvate.", { n: count }));
      }
    } catch {
      setMsg(tr("Nu s-a putut. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Block icon={FileText} title={tr("Notițe Markdown (Obsidian)")} hint={tr("Câte un fișier .md pe zi: raportul de seară, bifele, to-do-urile, Focus și reflecția. Dezarhivează-l în folderul tău Obsidian.")}>
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={tr("Perioada")}>
          {[7, 30, 90].map((n) => (
            <option key={n} value={n}>{n < 20 ? tr("Ultimele {n} zile", { n }) : tr("Ultimele {n} de zile", { n })}</option>
          ))}
        </select>
        <Button size="sm" variant="ghost" icon={Download} busy={busy} onClick={notes}>{tr("Descarcă notițele (.zip)")}</Button>
      </div>
      {msg && <p className="text-xs font-semibold text-dim" aria-live="polite">{msg}</p>}
    </Block>
  );
}

// ------------------------------------------------------------ calendar

function Calendar({ state, today }) {
  const [feed, setFeed] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    I.loadCalendarFeed().then(setFeed).catch(() => setFeed(null));
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block icon={CalendarDays} title={tr("Calendar (Google, Apple, Outlook)")} hint={tr("To-do-urile, temele, examenele și pașii din obiective apar în calendarul tău. Se actualizează singur; schimbările le faci tot în Molted.")}>
      {feed === undefined ? null : feed ? (
        <div className="space-y-2">
          <CopyField id="cal-url" label={tr("Linkul calendarului")} value={I.calendarUrl(feed.token)} />
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-ghost btn-sm focus-ring" href={I.googleCalendarUrl(feed.token)} target="_blank" rel="noopener">{tr("Adaugă în Google Calendar")}</a>
            <a className="btn btn-ghost btn-sm focus-ring" href={I.webcalUrl(feed.token)}>{tr("Apple Calendar / Outlook")}</a>
          </div>
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-dim" htmlFor="cal-habits">
            <span>{tr("Arată și obiceiurile care au oră")}</span>
            <Toggle id="cal-habits" checked={!!feed.habits} label={tr("Obiceiuri în calendar")} onChange={(v) => run(async () => setFeed({ ...feed, ...(await I.saveCalendarFeed({ habits: v })) }))} />
          </label>
          <p className="text-xs font-semibold text-dim">
            {tr("Linkul e secret: cine îl are îți vede planul.")} {feed.last_fetched_at ? tr("Citit ultima dată: {when}.", { when: when(feed.last_fetched_at) }) : tr("Niciun calendar nu l-a citit încă.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={RefreshCw} busy={busy} onClick={() => run(async () => setFeed(await I.saveCalendarFeed({ habits: feed.habits, rotate: true })))}>{tr("Link nou (cel vechi nu mai merge)")}</Button>
            <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => run(async () => (await I.removeCalendarFeed(), setFeed(null)))}>{tr("Oprește")}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" icon={CalendarDays} busy={busy} onClick={() => run(async () => setFeed(await I.saveCalendarFeed()))}>{tr("Creează linkul calendarului")}</Button>
      )}
      <Button size="sm" variant="ghost" icon={Download} onClick={() => I.saveFile("molted.ics", I.calendarFile(state, today), "text/calendar")}>{tr("Descarcă o dată (.ics)")}</Button>
      {err && <p role="alert" className="text-xs font-semibold text-rose-ink">{err}</p>}
    </Block>
  );
}

// ------------------------------------------------------------ webhooks

function Webhooks() {
  const [list, setList] = useState(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(["habit.checked", "report.created"]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(null); // id whose secret is shown
  const [tests, setTests] = useState({});
  const reload = () => I.loadWebhooks().then(setList).catch(() => setList([]));
  useEffect(() => {
    reload();
  }, []);
  const check = url.trim() ? checkWebhookUrl(url) : null;
  async function add(e) {
    e.preventDefault();
    if (!check?.ok || !events.length) return;
    setBusy("add");
    setErr("");
    try {
      const made = await I.createWebhook(check.url, events);
      setUrl("");
      setShown(made?.id ?? null);
      await reload();
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(null);
    }
  }
  const act = async (id, fn) => {
    setBusy(id);
    setErr("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Block icon={Webhook} title={tr("Webhook-uri")} hint={tr("Molted trimite un mesaj semnat (HMAC-SHA256) la adresa ta când se întâmplă ceva. Cu Zapier, Make sau n8n îl legi de Sheets, Todoist, Slack și altele.")}>
      {list?.map((w) => (
        <div key={w.id} className="space-y-1.5 rounded-xl bg-well p-2.5 ring-1 ring-edge">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{w.url}</span>
            {!w.active && <Chip tone="rose">{w.disabled_reason === "failures" ? tr("oprit după erori") : tr("pe pauză")}</Chip>}
          </div>
          <div className="flex flex-wrap gap-1">{w.events.map((e) => <Chip key={e}>{EVENT_LABEL[e]}</Chip>)}</div>
          <p className="text-[11px] font-semibold text-dim">
            {w.last_delivery_at ? tr("Ultima trimitere: {when} · {status}", { when: when(w.last_delivery_at), status: w.last_error || w.last_status || "" }) : tr("Nimic trimis încă.")}
            {tests[w.id] && ` · ${tests[w.id]}`}
          </p>
          {shown === w.id && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-dim">{tr("Cheia de semnare (verifici cu ea antetul webhook-signature):")}</p>
              <CopyField id={`wh-secret-${w.id}`} label={tr("Cheia de semnare")} value={w.secret} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" icon={Send} busy={busy === `t${w.id}`} onClick={() => act(`t${w.id}`, async () => {
              const r = await I.testWebhook(w.id);
              setTests((t) => ({ ...t, [w.id]: r.ok ? tr("Test reușit ({status})", { status: r.status }) : tr("Test eșuat: {error}", { error: r.error || r.status }) }));
            })}>{tr("Trimite un test")}</Button>
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setShown(shown === w.id ? null : w.id)}>{shown === w.id ? tr("Ascunde cheia") : tr("Arată cheia")}</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(w.id, () => I.updateWebhook(w.id, { active: !w.active }))}>{w.active ? tr("Pauză") : tr("Pornește")}</Button>
            <Button size="sm" variant="ghost" icon={Trash2} disabled={!!busy} onClick={() => act(w.id, () => I.deleteWebhook(w.id))} aria-label={tr("Șterge webhook-ul {url}", { url: w.url })}>{tr("Șterge")}</Button>
          </div>
        </div>
      ))}
      {list && list.length < 3 && (
        <form onSubmit={add} className="space-y-2">
          <Field label={tr("Adresă nouă")} htmlFor="wh-url" hint={check && !check.ok ? URL_PROBLEM[check.reason] : null}>
            <input id="wh-url" className="field font-mono text-xs" placeholder="https://hooks.zapier.com/..." value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("Evenimente")}>
            {WEBHOOK_EVENTS.map((e) => {
              const on = events.includes(e);
              return (
                <button key={e} type="button" aria-pressed={on} onClick={() => setEvents(on ? events.filter((x) => x !== e) : [...events, e])} className={`focus-ring rounded-lg px-2 py-1 text-xs font-bold ring-1 ${on ? "bg-gold/15 text-ink ring-gold/50" : "text-dim ring-edge"}`}>
                  {EVENT_LABEL[e]}
                </button>
              );
            })}
          </div>
          <Button type="submit" size="sm" icon={Plug} busy={busy === "add"} disabled={!check?.ok || !events.length}>{tr("Adaugă webhook")}</Button>
        </form>
      )}
      {err && <p role="alert" className="text-xs font-semibold text-rose-ink">{err}</p>}
    </Block>
  );
}

// ------------------------------------------------------------ Notion

function Notion() {
  const [conn, setConn] = useState(undefined);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const reload = () => I.loadNotion().then(setConn).catch(() => setConn(null));
  useEffect(() => {
    reload();
    // back from Notion: the app was opened with ?notion=...
    const back = new URLSearchParams(window.location.search).get("notion");
    if (back) {
      setMsg(
        { connected: tr("Notion e conectat."), needs_page: tr("Conectat, dar Molted nu are acces la nicio pagină. Dă-i acces la o pagină și apasă „Caută din nou”."), cancelled: tr("Conectarea a fost anulată."), error: tr("Conectarea la Notion n-a mers.") }[back] || ""
      );
      const u = new URL(window.location.href);
      u.searchParams.delete("notion");
      window.history.replaceState(window.history.state, "", u);
    }
  }, []);
  const act = async (key, fn) => {
    setBusy(key);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(null);
      reload();
    }
  };
  if (conn === undefined) return null;
  return (
    <Block icon={FileText} title="Notion" hint={tr("Fiecare raport de seară și fiecare reflecție devin o pagină într-o bază de date „Molted” din Notion-ul tău.")}>
      {conn ? (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-dim">
            <Chip tone={conn.ready ? "mint" : "gold"}>{conn.ready ? tr("Conectat") : tr("Așteaptă o pagină")}</Chip>
            {conn.workspace_name}
            {conn.database_url && <a className="underline hover:text-ink" href={conn.database_url} target="_blank" rel="noopener">{tr("Deschide baza de date")}</a>}
          </p>
          {conn.last_error === "reconnect" && <p className="text-xs font-semibold text-rose-ink">{tr("Notion nu mai acceptă conexiunea. Conectează din nou.")}</p>}
          {conn.last_error === "database_gone" && <p className="text-xs font-semibold text-rose-ink">{tr("Baza de date Molted nu mai e accesibilă. Apasă „Caută din nou”.")}</p>}
          {conn.ready && (
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-dim" htmlFor="notion-auto">
              <span>{tr("Scrie automat fiecare raport și reflecție nouă")}</span>
              <Toggle id="notion-auto" checked={!!conn.auto_sync} label={tr("Scriere automată în Notion")} onChange={(v) => act("auto", () => I.setNotionAutoSync(v))} />
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            {conn.ready ? (
              <Button size="sm" variant="ghost" icon={RefreshCw} busy={busy === "sync"} onClick={() => act("sync", async () => setMsg(tr("{n} pagini scrise.", { n: await I.syncNotion(30) })))}>{tr("Scrie ultimele 30 de zile")}</Button>
            ) : (
              <Button size="sm" variant="ghost" icon={RefreshCw} busy={busy === "setup"} onClick={() => act("setup", I.setupNotion)}>{tr("Caută din nou")}</Button>
            )}
            {conn.last_error === "reconnect" && <Button size="sm" icon={Plug} busy={busy === "start"} onClick={() => act("start", async () => (window.location.href = await I.startNotion()))}>{tr("Conectează din nou")}</Button>}
            <Button size="sm" variant="ghost" icon={Trash2} busy={busy === "off"} onClick={() => act("off", I.disconnectNotion)}>{tr("Deconectează")}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" icon={Plug} busy={busy === "start"} onClick={() => act("start", async () => (window.location.href = await I.startNotion()))}>{tr("Conectează Notion")}</Button>
      )}
      {msg && <p className="text-xs font-semibold text-dim" aria-live="polite">{msg}</p>}
    </Block>
  );
}

// ------------------------------------------------------------ MCP

function Agents() {
  const [list, setList] = useState(null);
  const [name, setName] = useState("Claude");
  const [canPropose, setCanPropose] = useState(true);
  const [made, setMade] = useState(null); // { id, token }, shown once
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const reload = () => I.loadMcpTokens().then(setList).catch(() => setList([]));
  useEffect(() => {
    reload();
  }, []);
  const act = async (key, fn) => {
    setBusy(key);
    setErr("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Block icon={Bot} title={tr("Agenți AI (MCP)")} hint={tr("Claude, ChatGPT și alți agenți îți pot citi datele și pot propune acțiuni. Nimic nu se schimbă până nu confirmi tu, în Molt → Ce a făcut Molt.")}>
      <CopyField id="mcp-url" label={tr("Adresa serverului MCP")} value={I.mcpUrl()} />
      {made && (
        <div className="space-y-1.5 rounded-xl bg-gold/10 p-2.5 ring-1 ring-gold/40">
          <p className="text-xs font-extrabold text-ink">{tr("Tokenul tău (îl vezi o singură dată):")}</p>
          <CopyField id="mcp-token" label={tr("Token")} value={made.token} />
          <p className="text-[11px] font-semibold text-dim">{tr("Pune-l în antetul Authorization: Bearer. Configurare gata de lipit (Claude Desktop, Cursor):")}</p>
          <textarea readOnly className="field h-28 font-mono text-[11px]" value={I.mcpConfig(made.token)} aria-label={tr("Configurare MCP")} onFocus={(e) => e.target.select()} />
          <Button size="sm" variant="ghost" onClick={() => setMade(null)}>{tr("Am salvat tokenul")}</Button>
        </div>
      )}
      {list?.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-well p-2 ring-1 ring-edge">
          <span className="min-w-0 flex-1 text-sm font-bold text-ink">
            {t.name} <span className="font-mono text-xs text-dim">…{t.hint}</span>
          </span>
          <Chip>{t.can_propose ? tr("citește și propune") : tr("doar citește")}</Chip>
          <span className="text-[11px] font-semibold text-dim">{t.last_used_at ? tr("Folosit: {when}", { when: when(t.last_used_at) }) : tr("Nefolosit încă")}</span>
          <Button size="sm" variant="ghost" icon={Trash2} disabled={!!busy} onClick={() => act(t.id, () => I.revokeMcpToken(t.id))} aria-label={tr("Revocă tokenul {name}", { name: t.name })}>{tr("Revocă")}</Button>
        </div>
      ))}
      {list && list.length < 5 && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) act("new", async () => setMade(await I.createMcpToken(name.trim(), canPropose)));
          }}
        >
          <div className="flex gap-2">
            <input className="field min-w-0 flex-1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label={tr("Numele conexiunii")} />
            <Button type="submit" size="sm" icon={KeyRound} busy={busy === "new"} disabled={!name.trim()}>{tr("Token nou")}</Button>
          </div>
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-dim" htmlFor="mcp-propose">
            <span>{tr("Poate propune acțiuni (le confirmi tu)")}</span>
            <Toggle id="mcp-propose" checked={canPropose} label={tr("Poate propune acțiuni")} onChange={setCanPropose} />
          </label>
        </form>
      )}
      {err && <p role="alert" className="text-xs font-semibold text-rose-ink">{err}</p>}
    </Block>
  );
}

export default function IntegrationsPanel({ state, today, months, loadMonth }) {
  const [account, setAccount] = useState(false);
  useEffect(() => {
    I.integrationsAvailable().then(setAccount);
  }, []);
  if (inViewer()) return null; // a claude.ai artifact can neither save files nor reach the account
  return (
    <Panel className="space-y-3 p-4 lg:col-span-2">
      <SectionTitle icon={Plug} tone="sky" sub={tr("Leagă Molted de calendarul, notițele și aplicațiile tale.")} className="!mb-1">{tr("Integrări")}</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-4">
          {account ? <Calendar state={state} today={today} /> : (
            <Block icon={CalendarDays} title={tr("Calendar (.ics)")} hint={tr("Planul tău ca fișier pentru Google Calendar, Apple Calendar sau Outlook. Cu cont, primești un link care se actualizează singur.")}>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => I.saveFile("molted.ics", I.calendarFile(state, today), "text/calendar")}>{tr("Descarcă o dată (.ics)")}</Button>
            </Block>
          )}
          <Files state={state} today={today} months={months} loadMonth={loadMonth} />
        </div>
        {account && (
          <div className="space-y-4">
            <Webhooks />
            <Notion />
            <Agents />
          </div>
        )}
      </div>
    </Panel>
  );
}
