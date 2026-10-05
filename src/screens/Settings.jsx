import React, { useState } from "react";
import { Bot, Database, FlaskConical, Moon, RotateCcw, Shield, Trash2, User } from "lucide-react";
import { Button, Chip, Field, LevelBadge, Panel, SectionTitle, Toggle } from "../components/ui.jsx";
import { PATHS } from "../lib/catalog.js";
import { LEVELS, RULES } from "../lib/engine.js";

const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];

export default function Settings({ state, d, ai, mode, onChange, onRemoveDemo, onWipe }) {
  const [nick, setNick] = useState(state.profile?.nick || "");
  const [goal, setGoal] = useState(state.profile?.goal || "");
  const settings = state.settings || {};
  const set = (patch) => onChange((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const path = PATHS[state.profile?.path] || PATHS.sport;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-3xl text-ink">Setări</h1>
        <p className="text-sm font-semibold text-dim">Profil, ritualul de seară, regulile jocului și datele tale.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel className="space-y-4 p-4 sm:p-5">
          <SectionTitle icon={User} tone="gold">
            Profil
          </SectionTitle>
          <Field label="Nume" htmlFor="set-nick" hint="Apare în grup, lângă personajul tău.">
            <input
              id="set-nick"
              className="field"
              value={nick}
              maxLength={24}
              onChange={(e) => setNick(e.target.value)}
              onBlur={() => nick.trim() && onChange((s) => ({ ...s, profile: { ...s.profile, nick: nick.trim() } }))}
            />
          </Field>
          <Field label="Obiectiv" htmlFor="set-goal" hint="AI-ul îl folosește în rapoarte și în poveste.">
            <textarea
              id="set-goal"
              className="field min-h-[80px]"
              value={goal}
              maxLength={160}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={() => goal.trim() && onChange((s) => ({ ...s, profile: { ...s.profile, goal: goal.trim() } }))}
            />
          </Field>
          <div className="inset flex items-center gap-3 p-3 text-sm">
            <Chip tone="gold">{path.label}</Chip>
            <span className="text-body">
              Drumul tău: personajul este <span className="font-extrabold text-ink">{path.cls}</span>. Drumul se alege o singură dată, la ou.
            </span>
          </div>
        </Panel>

        <Panel className="space-y-4 p-4 sm:p-5">
          <SectionTitle icon={Moon} tone="violet">
            Ritualul de seară
          </SectionTitle>
          <Field label="Ora raportului" htmlFor="set-time">
            <select id="set-time" className="field" value={settings.reviewTime || "21:00"} onChange={(e) => set({ reviewTime: e.target.value })}>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center justify-between gap-4" htmlFor="set-auto">
            <span>
              <span className="block font-extrabold text-ink">Generează automat</span>
              <span className="block text-xs font-semibold text-dim">Dacă AI-ul are deja permisiune și aplicația e deschisă la ora raportului.</span>
            </span>
            <Toggle id="set-auto" checked={settings.autoReview !== false} onChange={(v) => set({ autoReview: v })} label="Raport automat" />
          </label>
          <div className="inset flex items-start gap-3 p-3 text-sm text-body">
            <Bot size={18} className={`mt-0.5 shrink-0 ${ai.available ? "text-mint" : "text-faint"}`} aria-hidden="true" />
            <span>
              {ai.available ? (
                <>
                  <span className="font-extrabold text-mint">AI disponibil{ai.images ? ", inclusiv pentru poze" : ""}.</span> Verifică dovezile, scrie povestea și rapoartele de seară
                  folosind Claude din contul tău de claude.ai.
                </>
              ) : (
                <>
                  <span className="font-extrabold text-ink">AI indisponibil aici.</span> Rapoartele și poveștile vin din șabloane, iar dovezile se salvează nevalidate.
                  În aplicația publicată pe claude.ai, AI-ul funcționează după ce îi dai permisiunea.
                </>
              )}
            </span>
          </div>
        </Panel>

        <Panel className="space-y-4 p-4 sm:p-5">
          <SectionTitle icon={Shield} tone="ember">
            Regulile jocului
          </SectionTitle>
          <Field label="Momentum-ul se resetează după" htmlFor="set-reset">
            <select id="set-reset" className="field" value={settings.resetAfter || RULES.resetAfter} onChange={(e) => set({ resetAfter: Number(e.target.value) })}>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} zile la rând fără activitate
                </option>
              ))}
            </select>
          </Field>
          <ul className="space-y-1.5 text-sm text-body">
            <li>· Bifă: +10 / +20 / +30 după dificultate; dovada verificată de AI dă ×1,5.</li>
            <li>· Zile active la rând: până la +40% la tot ce câștigi.</li>
            <li>· Toate misiunile programate bifate: cufărul zilei, +{RULES.chestXp}.</li>
            <li>· Raportul de seară: jumătate din scorul zilei devine momentum.</li>
            <li>· O zi fără nimic păstrează 85% din momentum; una incompletă, cel puțin 92%.</li>
            <li className="flex items-center gap-1.5">
              <FlaskConical size={14} className="text-mint" aria-hidden="true" /> Seria: {RULES.revivesPerMonth} revive-uri pe lună (ai folosit {d.revive.used} luna aceasta).
            </li>
          </ul>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <span key={l.lvl} className="inline-flex items-center gap-1 rounded-full bg-[#120f29] py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-dim ring-1 ring-edge">
                <LevelBadge lvl={l.lvl} size={20} tone={l.lvl <= d.level.lvl ? "gold" : "dim"} /> {l.name} · {l.min}
              </span>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-4 p-4 sm:p-5">
          <SectionTitle icon={Database} tone="sky">
            Datele tale
          </SectionTitle>
          <p className="text-sm text-body">
            {mode === "cloud"
              ? "Datele se salvează în contul tău de claude.ai, într-o zonă privată a aplicației pe care nu o vede nimeni altcineva. Grupurile văd doar statisticile publice: nivelul, seria, momentum-ul și personajul."
              : mode === "local"
                ? "Datele se salvează în browserul acestui dispozitiv."
                : "Stocarea nu e disponibilă: datele se pierd când închizi pagina."}
          </p>
          {state.meta?.demo && (
            <div className="inset flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-[180px] flex-1 text-sm text-body">Ai pornit cu 3 săptămâni de date demonstrative.</span>
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onRemoveDemo}>
                Șterge datele demo
              </Button>
            </div>
          )}
          <div className="rounded-xl bg-rose/10 p-3 ring-1 ring-rose/30">
            <div className="mb-2 text-sm font-extrabold text-rose">Zona periculoasă</div>
            <Button id="wipe-all" variant="rose" size="sm" icon={Trash2} onClick={onWipe}>
              Șterge toate datele
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
