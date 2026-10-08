import React, { useState } from "react";
import { Bot, Check, Database, Download, FlaskConical, LogOut, Moon, Palette, Shield, Trash2, User, UserX } from "lucide-react";
import { Button, Chip, Field, LevelBadge, Panel, SectionTitle, Toggle } from "../components/ui.jsx";
import { Select } from "../components/Select.jsx";
import { PATHS } from "../lib/catalog.js";
import { LEVELS, RULES } from "../lib/engine.js";
import { exportData, signOut } from "../lib/account.js";
import { THEMES, setTheme, useTheme } from "../lib/themes.js";

const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];

// Each card carries data-theme/data-mode, so it paints itself with that theme's real colours
// even while another theme is active.
function ThemePicker() {
  const active = useTheme();
  return (
    <div role="radiogroup" aria-label="Temă de culori" className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(t.id)}
            data-theme={t.id}
            data-mode={t.mode}
            className={`focus-ring flex flex-col rounded-2xl bg-night p-3 text-left ring-2 transition ${on ? "ring-gold-deep" : "ring-edge hover:ring-edge-hi"}`}
          >
            <div className="flex h-16 overflow-hidden rounded-xl ring-1 ring-edge">
              <div className="flex w-1/3 flex-col gap-1 bg-deep p-1.5">
                <span className="h-1.5 w-full rounded-full bg-gold" />
                <span className="h-1.5 w-2/3 rounded-full bg-edge" />
                <span className="h-1.5 w-3/4 rounded-full bg-edge" />
              </div>
              <div className="flex flex-1 flex-col justify-between bg-night p-1.5">
                <div className="rounded-md bg-panel p-1 ring-1 ring-edge">
                  <span className="block h-1.5 w-1/2 rounded-full bg-ink" />
                  <span className="mt-1 block h-1 w-3/4 rounded-full bg-dim" />
                </div>
                <div className="flex gap-1">
                  <span className="h-3 w-8 rounded-md bg-violet" />
                  <span className="h-3 w-6 rounded-md bg-gold" />
                  <span className="h-3 w-4 rounded-md bg-mint" />
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-pixel text-lg text-ink">{t.name}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-dim">
                {on && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                {t.mode === "dark" ? "Întunecat" : "Luminos"}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-dim">{t.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

export default function Settings({ state, d, ai, mode, env, onChange, onWipe, onDeleteAccount }) {
  const [exporting, setExporting] = useState(false);
  const [nick, setNick] = useState(state.profile?.nick || "");
  const [goal, setGoal] = useState(state.profile?.goal || "");
  const settings = state.settings || {};
  const set = (patch) => onChange((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const path = PATHS[state.profile?.path] || PATHS.sport;

  async function download() {
    setExporting(true);
    try {
      const blob = new Blob([JSON.stringify(await exportData(env), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "momentum-datele-mele.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pixel text-3xl text-ink">Setări</h1>
        <p className="text-sm font-semibold text-dim">Profil, ritualul de seară, regulile jocului și datele tale.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel className="space-y-4 p-4 sm:p-5 lg:col-span-2">
          <SectionTitle icon={Palette} tone="violet">
            Aspect
          </SectionTitle>
          <ThemePicker />
          <p className="text-xs font-semibold text-dim">Se păstrează pe acest dispozitiv.</p>
        </Panel>
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
            <Select id="set-time" value={settings.reviewTime || "21:00"} onChange={(v) => set({ reviewTime: v })} options={TIMES.map((t) => ({ value: t, label: t }))} />
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
            <Select
              id="set-reset"
              value={settings.resetAfter || RULES.resetAfter}
              onChange={(v) => set({ resetAfter: v })}
              options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n} zile la rând fără activitate` }))}
            />
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
              <span key={l.lvl} className="inline-flex items-center gap-1 rounded-full bg-well py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-dim ring-1 ring-edge">
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
              : mode === "supabase"
                ? "Datele se salvează în contul tău și se sincronizează pe toate dispozitivele. Poze și note vocale sunt private. Grupurile văd doar statisticile publice: nivelul, seria, momentum-ul și personajul."
                : mode === "local"
                ? "Datele se salvează în browserul acestui dispozitiv."
                : "Stocarea nu e disponibilă: datele se pierd când închizi pagina."}
          </p>
          {mode === "supabase" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" icon={Download} busy={exporting} onClick={download}>
                Descarcă datele mele
              </Button>
              <Button variant="ghost" size="sm" icon={LogOut} onClick={signOut}>
                Deconectare
              </Button>
            </div>
          )}
          <div className="rounded-xl bg-rose/10 p-3 ring-1 ring-rose/30">
            <div className="mb-2 text-sm font-extrabold text-rose">Zona periculoasă</div>
            <div className="flex flex-wrap gap-2">
              <Button id="wipe-all" variant="rose" size="sm" icon={Trash2} onClick={onWipe}>
                Șterge toate datele
              </Button>
              {mode === "supabase" && (
                <Button id="delete-account" variant="rose" size="sm" icon={UserX} onClick={onDeleteAccount}>
                  Șterge contul
                </Button>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
