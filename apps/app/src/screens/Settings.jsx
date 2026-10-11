import React, { useState } from "react";
import { Bot, Check, ChevronDown, Database, Download, FlaskConical, LogOut, Moon, Palette, Shield, Sun, Trash2, User, UserX } from "lucide-react";
import { Button, Chip, Field, LevelBadge, Panel, SectionTitle, Toggle } from "../components/ui.jsx";
import { Select } from "../components/Select.jsx";
import { PATHS } from "../lib/catalog.js";
import { LEVELS, RULES } from "../lib/engine.js";
import { exportData, signOut } from "../lib/account.js";
import { THEMES, setTheme, useTheme } from "../lib/themes.js";
import { fmt12 } from "../lib/dates.js";
import NotificationsPanel from "../components/NotificationsPanel.jsx";

const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];

// Each card carries data-theme/data-mode, so it paints itself with that theme's real colours
// even while another theme is active.
function ThemePicker() {
  const active = useTheme();
  return (
    <div role="radiogroup" aria-label="Temă de culori" className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {THEMES.map((t) => {
        const on = t.id === active;
        const ModeIcon = t.mode === "dark" ? Moon : Sun;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${t.name}, ${t.mode === "dark" ? "întunecat" : "luminos"}. ${t.blurb}`}
            title={t.blurb}
            onClick={() => setTheme(t.id)}
            data-theme={t.id}
            data-mode={t.mode}
            className={`focus-ring flex flex-col rounded-xl bg-night p-1.5 text-left ring-2 transition ${on ? "ring-gold-deep" : "ring-edge hover:ring-edge-hi"}`}
          >
            <div className="flex h-9 overflow-hidden rounded-lg ring-1 ring-edge">
              <div className="flex w-1/3 flex-col gap-0.5 bg-deep p-1">
                <span className="h-1 w-full rounded-full bg-gold" />
                <span className="h-1 w-2/3 rounded-full bg-edge" />
              </div>
              <div className="flex flex-1 flex-col justify-between bg-night p-1">
                <span className="block h-1 w-3/4 rounded-full bg-ink" />
                <div className="flex gap-0.5">
                  <span className="h-2 w-4 rounded-sm bg-violet" />
                  <span className="h-2 w-3 rounded-sm bg-gold" />
                  <span className="h-2 w-2 rounded-sm bg-mint" />
                </div>
              </div>
            </div>
            <span className="mt-1 flex items-center justify-between gap-1 px-0.5">
              <span className="truncate text-xs font-extrabold text-ink">{t.name}</span>
              {on ? (
                <Check size={12} strokeWidth={3} className="shrink-0 text-ink" aria-hidden="true" />
              ) : (
                <ModeIcon size={11} className="shrink-0 text-dim" aria-hidden="true" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// a switch row: title and a short explanation on the left, the toggle on the right
function SwitchRow({ id, title, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4" htmlFor={id}>
      <span>
        <span className="block text-sm font-extrabold text-ink">{title}</span>
        <span className="block text-xs font-semibold text-dim">{hint}</span>
      </span>
      <Toggle id={id} checked={checked} onChange={onChange} label={title} />
    </label>
  );
}

// a folded block inside a card, opened from its summary line
function Fold({ title, tone = "text-dim", children }) {
  return (
    <details className="group rounded-xl bg-well ring-1 ring-edge">
      <summary className={`focus-ring flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wider hover:text-ink ${tone}`}>
        {title}
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
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

  const storage =
    mode === "cloud"
      ? "Datele se salvează în contul tău de claude.ai, într-o zonă privată a aplicației pe care nu o vede nimeni altcineva."
      : mode === "supabase"
        ? "Datele se salvează în contul tău și se sincronizează pe toate dispozitivele."
        : mode === "local"
          ? "Datele se salvează în browserul acestui dispozitiv."
          : "Stocarea nu e disponibilă: datele se pierd când închizi pagina.";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-3xl text-ink">Setări</h1>
        <p className="text-sm font-semibold text-dim">Profilul, raportul de seară, aspectul, notificările și datele tale.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* who you are */}
        <Panel className="space-y-3 p-4">
          <SectionTitle icon={User} tone="gold" className="!mb-1">
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
              className="field min-h-[64px]"
              rows={2}
              value={goal}
              maxLength={160}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={() => goal.trim() && onChange((s) => ({ ...s, profile: { ...s.profile, goal: goal.trim() } }))}
            />
          </Field>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-dim">
            <Chip tone="gold">{path.label}</Chip>
            <span>
              Personajul tău e <span className="font-extrabold text-ink">{path.cls}</span>. Drumul se alege o singură dată, la ou.
            </span>
          </p>
        </Panel>

        {/* the evening report */}
        <Panel className="space-y-3 p-4">
          <SectionTitle icon={Moon} tone="violet" className="!mb-1">
            Raportul de seară
          </SectionTitle>
          <Field label="Ora raportului" htmlFor="set-time">
            <Select id="set-time" value={settings.reviewTime || "21:00"} onChange={(v) => set({ reviewTime: v })} options={TIMES.map((t) => ({ value: t, label: fmt12(t) }))} />
          </Field>
          <SwitchRow
            id="set-auto"
            title="Generează automat"
            hint="Dacă AI-ul are deja permisiune și aplicația e deschisă la ora raportului."
            checked={settings.autoReview !== false}
            onChange={(v) => set({ autoReview: v })}
          />
          {ai.server && (
            <SwitchRow
              id="set-weekly"
              title="Coach săptămânal"
              hint="Duminică seara coach-ul îți pregătește săptămâna: adaugă singur memento-uri (le poți anula) și îți propune schimbări, pe care le confirmi tu."
              checked={!!settings.agentWeekly}
              onChange={(v) => set({ agentWeekly: v })}
            />
          )}
          <p className="flex items-start gap-2 text-xs font-semibold text-dim">
            <Bot size={15} className={`shrink-0 ${ai.available ? "text-mint" : "text-faint"}`} aria-hidden="true" />
            <span>
              {ai.available ? (
                <>
                  <span className="font-extrabold text-mint">AI disponibil.</span> Scrie rapoartele de seară, citatele personalizate și capitolele poveștii.
                </>
              ) : (
                <>
                  <span className="font-extrabold text-ink">AI indisponibil aici.</span> Rapoartele, citatele personalizate și capitolele nu se
                  generează fără AI, iar aplicația nu le înlocuiește cu text scris.
                </>
              )}
            </span>
          </p>
        </Panel>

        {/* how it looks */}
        <Panel className="space-y-3 p-4 lg:col-span-2">
          <SectionTitle icon={Palette} tone="violet" sub="Se păstrează pe acest dispozitiv." className="!mb-1">
            Aspect
          </SectionTitle>
          <ThemePicker />
        </Panel>

        {/* the rules: the one setting up front, the explanations folded */}
        <Panel className="space-y-3 p-4">
          <SectionTitle icon={Shield} tone="ember" className="!mb-1">
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
          <p className="flex items-center gap-1.5 text-xs font-semibold text-dim">
            <FlaskConical size={14} className="text-mint" aria-hidden="true" /> Seria: {RULES.revivesPerMonth} revive-uri pe lună (ai folosit {d.revive.used} luna aceasta).
          </p>
          <Fold title="Cum câștigi momentum">
            <ul className="space-y-1 text-xs font-semibold leading-relaxed text-body">
              <li>· Bifă: +10 / +20 / +30 momentum după dificultate, plus 1 / 2 / 3 puncte de evoluție pentru personaj.</li>
              <li>· Zile active la rând: până la +40% la tot ce câștigi.</li>
              <li>· Toate misiunile programate bifate: cufărul zilei, +{RULES.chestXp}.</li>
              <li>· Raportul de seară: jumătate din scorul zilei devine momentum.</li>
              <li>
                · Focus: o sesiune încheiată de cel puțin {RULES.focusMinMinutes} minute aduce 1 momentum la 2 minute (+{RULES.focusCycleBonus} pentru fiecare pomodoro
                terminat), maximum {RULES.focusDayCap} pe zi.
              </li>
              <li>· O zi fără nimic păstrează 85% din momentum; una incompletă, cel puțin 92%.</li>
            </ul>
          </Fold>
          <Fold title="Nivelurile">
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((l) => (
                <span key={l.lvl} className="inline-flex items-center gap-1 rounded-full bg-panel py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-dim ring-1 ring-edge">
                  <LevelBadge lvl={l.lvl} size={20} tone={l.lvl <= d.level.lvl ? "gold" : "dim"} /> {l.name} · {l.min}
                </span>
              ))}
            </div>
          </Fold>
        </Panel>

        {/* account, notifications and data, with the destructive actions folded away */}
        <Panel className="space-y-3 p-4">
          <SectionTitle icon={Database} tone="sky" className="!mb-1">
            Cont, notificări și date
          </SectionTitle>
          <p className="text-sm text-body">
            {storage}
            {(mode === "cloud" || mode === "supabase") && " Grupurile văd doar nivelul, seria, momentum-ul și personajul."}
          </p>
          <NotificationsPanel settings={settings} set={set} />
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
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-dim">
            <a className="focus-ring underline hover:text-ink" href="https://molted.eu/terms.html" target="_blank" rel="noopener">
              Termeni și condiții
            </a>
            <a className="focus-ring underline hover:text-ink" href="https://molted.eu/privacy.html" target="_blank" rel="noopener">
              Politica de confidențialitate
            </a>
          </p>
          <Fold title="Zona periculoasă" tone="text-rose">
            <p className="mb-2 text-xs font-semibold text-dim">Ștergerea nu se poate anula.</p>
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
          </Fold>
        </Panel>
      </div>
    </div>
  );
}
