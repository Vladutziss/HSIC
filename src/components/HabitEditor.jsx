import React, { useMemo, useState } from "react";
import { Archive, Check, Plus, ScrollText, Wand2 } from "lucide-react";
import { Button, Chip, Field, Gems, Modal, Tabs } from "./ui.jsx";
import { HABIT_ICONS, iconFor } from "./icons.js";
import { CATALOG, ICON_KEYS, MAX_HABITS, PATHS, PATH_LIST, habitFromCatalog, nextColor, uid } from "../lib/catalog.js";
import { DIFF } from "../lib/engine.js";
import { RO_DAYS_MIN } from "../lib/dates.js";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function scheduleLabel(days) {
  const set = [...days].sort();
  if (set.length === 7) return "Zilnic";
  if (set.join() === "1,2,3,4,5") return "Zile lucrătoare";
  if (set.join() === "0,6") return "Weekend";
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => RO_DAYS_MIN[d])
    .join(", ");
}

export function DayPicker({ value, onChange, idPrefix = "day" }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  const presets = [
    ["Zilnic", [0, 1, 2, 3, 4, 5, 6]],
    ["Lucrătoare", [1, 2, 3, 4, 5]],
    ["Weekend", [0, 6]],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {WEEK_ORDER.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              id={`${idPrefix}-${d}`}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={`focus-ring h-10 w-10 rounded-xl text-sm font-black transition ${
                on ? "bg-gold text-on-gold shadow-key-gold" : "bg-well text-dim ring-1 ring-edge hover:text-ink"
              }`}
            >
              {RO_DAYS_MIN[d]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, days]) => (
          <button key={label} type="button" onClick={() => onChange(days)} className="rounded-full px-2.5 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DifficultyPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`focus-ring flex flex-col items-center gap-1 rounded-xl p-2.5 transition ${
            value === n ? "bg-sky/15 ring-2 ring-sky" : "bg-well ring-1 ring-edge hover:ring-edge-hi"
          }`}
        >
          <Gems n={n} size={13} />
          <span className="text-sm font-extrabold text-ink">{DIFF[n].label}</span>
          <span className="text-[11px] font-bold text-gold-hi">+{DIFF[n].xp} momentum</span>
        </button>
      ))}
    </div>
  );
}

function CatalogTab({ state, today, onAdd }) {
  const active = (state.habits || []).filter((h) => !h.archivedAt);
  const [cat, setCat] = useState(state.profile?.path || "all");
  const taken = new Set(active.map((h) => h.catalogId).filter(Boolean));
  const full = active.length >= MAX_HABITS;
  const list = CATALOG.filter((c) => cat === "all" || c.cat === cat);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[{ id: "all", label: "Toate" }, ...PATH_LIST].map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={cat === p.id}
            onClick={() => setCat(p.id)}
            className={`focus-ring rounded-full px-3 py-1.5 text-xs font-extrabold transition ${cat === p.id ? "bg-gold text-on-gold" : "text-dim ring-1 ring-edge hover:text-ink"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {full && <p className="rounded-xl bg-ember/10 p-3 text-sm font-semibold text-ember ring-1 ring-ember/30">Ai deja {MAX_HABITS} obiceiuri active. Arhivează unul ca să adaugi altul.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((c) => {
          const Icon = iconFor(c.icon);
          const has = taken.has(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-edge bg-panel-hi/60 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${PATHS[c.cat].color}22`, color: PATHS[c.cat].color }}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-ink">{c.name}</div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-dim">
                  <Gems n={c.diff} size={10} />
                  <span className="truncate">{scheduleLabel(c.days)}</span>
                </div>
              </div>
              <Button
                size="sm"
                variant={has ? "ghost" : "gold"}
                icon={has ? Check : Plus}
                disabled={has || full}
                onClick={() => onAdd(habitFromCatalog(c, state.habits || [], today))}
                aria-label={has ? `${c.name} e deja adăugat` : `Adaugă ${c.name}`}
              >
                {has ? "Adăugat" : "Adaugă"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HabitForm({ draft, setDraft }) {
  const set = (k) => (v) => setDraft((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <Field label="Nume" htmlFor="habit-name">
        <input id="habit-name" className="field" value={draft.name} maxLength={40} placeholder="ex.: Înot" onChange={(e) => set("name")(e.target.value)} />
      </Field>
      <div>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">Iconiță</span>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {ICON_KEYS.map((k) => {
            const Icon = HABIT_ICONS[k];
            const on = draft.icon === k;
            return (
              <button
                key={k}
                type="button"
                aria-label={k}
                aria-pressed={on}
                onClick={() => set("icon")(k)}
                className={`focus-ring grid h-10 place-items-center rounded-lg transition ${on ? "bg-gold text-on-gold" : "bg-well text-dim ring-1 ring-edge hover:text-ink"}`}
              >
                <Icon size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categorie" htmlFor="habit-cat">
          <select id="habit-cat" className="field" value={draft.cat} onChange={(e) => set("cat")(e.target.value)}>
            {PATH_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ora (opțional)" htmlFor="habit-time" hint="Apare în calendar.">
          <input id="habit-time" type="time" className="field" value={draft.time || ""} onChange={(e) => set("time")(e.target.value || null)} />
        </Field>
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">Dificultate</span>
        <DifficultyPicker value={draft.diff} onChange={set("diff")} />
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">Zile</span>
        <DayPicker value={draft.days} onChange={set("days")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Țintă" htmlFor="habit-target">
          <input id="habit-target" className="field" value={draft.target} maxLength={60} placeholder="ex.: 30 de minute" onChange={(e) => set("target")(e.target.value)} />
        </Field>
        <Field label="Ce dovadă trimiți" htmlFor="habit-proof">
          <input id="habit-proof" className="field" value={draft.proofHint || ""} maxLength={60} placeholder="ex.: o poză de la bazin" onChange={(e) => set("proofHint")(e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

export function HabitEditor({ open, initial, tab: initialTab = "catalog", state, today, onSave, onArchive, onClose }) {
  const editing = !!initial;
  const [tab, setTab] = useState(editing ? "custom" : initialTab);
  const blank = useMemo(
    () => ({
      id: uid("h"),
      name: "",
      icon: "target",
      cat: state.profile?.path || "sport",
      diff: 2,
      days: [0, 1, 2, 3, 4, 5, 6],
      time: null,
      target: "",
      proofHint: "",
      color: nextColor(state.habits || []),
      createdAt: today,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [draft, setDraft] = useState(initial ? { ...initial } : blank);
  const active = (state.habits || []).filter((h) => !h.archivedAt);
  const full = !editing && active.length >= MAX_HABITS;
  const valid = draft.name.trim().length > 1 && draft.days.length > 0 && !full;

  const save = () => valid && onSave({ ...draft, name: draft.name.trim(), target: draft.target.trim() || "o dată pe zi" });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      tone="gold"
      icon={ScrollText}
      title={editing ? "Editează obiceiul" : "Adaugă un obicei"}
      footer={
        tab === "custom" ? (
          <>
            {editing && (
              <Button variant="ghost" icon={Archive} className="mr-auto" onClick={() => onArchive(initial.id, true)}>
                Arhivează
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Renunță
            </Button>
            <Button id="habit-save" onClick={save} disabled={!valid} icon={Check}>
              {editing ? "Salvează" : "Creează obiceiul"}
            </Button>
          </>
        ) : null
      }
    >
      {!editing && (
        <Tabs
          className="mb-5"
          value={tab}
          onChange={setTab}
          items={[
            { value: "catalog", label: "Din catalog", icon: ScrollText, id: "tab-catalog" },
            { value: "custom", label: "Personalizat", icon: Wand2, id: "tab-custom" },
          ]}
        />
      )}
      {tab === "catalog" && !editing ? (
        <CatalogTab state={state} today={today} onAdd={(h) => onSave(h, { keepOpen: true })} />
      ) : (
        <>
          {full && <p className="mb-4 rounded-xl bg-ember/10 p-3 text-sm font-semibold text-ember ring-1 ring-ember/30">Ai deja {MAX_HABITS} obiceiuri active.</p>}
          <HabitForm draft={draft} setDraft={setDraft} />
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-dim">
            <Chip tone="gold">+{DIFF[draft.diff].xp} momentum pe bifă</Chip>
            <span>× 1,5 cu dovadă verificată</span>
          </div>
        </>
      )}
    </Modal>
  );
}
