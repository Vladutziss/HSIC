import React, { useState } from "react";
import { Check, ListTodo, Repeat, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "./ui.jsx";
import { DateSelect, Select, TimeSelect } from "./Select.jsx";
import { DayPicker } from "./HabitEditor.jsx";
import { RO_DAYS, fmtDuration, weekday } from "../lib/dates.js";
import { makeRepeat } from "../lib/todos.js";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function TodoEditor({ todo, state, today, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState({ ...todo });
  // the repeat settings are edited as flat fields and put together on save
  const [kind, setKind] = useState(todo.repeat?.kind || "none");
  const [picked, setPicked] = useState(todo.repeat?.kind === "days" ? todo.repeat.days : [1, 2, 3, 4, 5]);
  const [until, setUntil] = useState(todo.repeat?.until || null);
  const set = (k) => (v) => setDraft((x) => ({ ...x, [k]: v }));
  const repeating = kind !== "none";
  const canSave = draft.title.trim().length > 0 && (kind !== "days" || picked.length > 0);
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const save = () => {
    if (!canSave) return;
    const { isNew, ...rest } = draft;
    const repeat = makeRepeat(kind, rest.date, picked, until);
    // a series keeps its ticked days; a single to-do keeps done / doneOn
    const done = repeat ? { done: false, doneOn: null, doneDays: rest.doneDays || [] } : { doneDays: undefined };
    onSave({ ...rest, ...done, repeat, title: rest.title.trim(), time: rest.date ? rest.time : null });
  };
  return (
    <Modal
      open
      onClose={onClose}
      tone="violet"
      icon={ListTodo}
      title={todo.isNew ? "To-do nou" : "Editează to-do"}
      footer={
        <>
          {!todo.isNew && (
            <Button variant="ghost" icon={Trash2} className="mr-auto" onClick={() => onDelete(todo.id)}>
              Șterge
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button id="todo-save" icon={Check} onClick={save} disabled={!canSave}>
            Salvează
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Ce ai de făcut" htmlFor="todo-title">
          <input id="todo-title" className="field" value={draft.title} maxLength={80} placeholder="ex.: Trimite tema la fizică" onChange={(e) => set("title")(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Zi" htmlFor="todo-date">
            <DateSelect id="todo-date" value={draft.date || null} onChange={(v) => setDraft((x) => ({ ...x, date: v, time: v ? x.time : null }))} />
          </Field>
          <Field label="Ora" htmlFor="todo-time" hint="Opțional">
            <TimeSelect id="todo-time" value={draft.time || null} disabled={!draft.date} onChange={set("time")} />
          </Field>
          <Field label="Durată" htmlFor="todo-dur">
            <Select id="todo-dur" value={draft.dur || 30} onChange={set("dur")} options={DURATIONS.map((m) => ({ value: m, label: fmtDuration(m) }))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full px-3 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink" onClick={() => set("date")(today)}>
            Azi
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink"
            onClick={() => {
              setDraft((x) => ({ ...x, date: null, time: null }));
              setKind("none");
            }}
          >
            Fără dată
          </button>
        </div>
        <div className="space-y-3 rounded-xl bg-well p-3 ring-1 ring-edge">
          <Field label="Se repetă" htmlFor="todo-repeat">
            <Select
              id="todo-repeat"
              value={kind}
              onChange={(v) => {
                setKind(v);
                if (v !== "none" && !draft.date) set("date")(today); // a series needs a first day
              }}
              options={[
                { value: "none", label: "Nu se repetă" },
                { value: "daily", label: "În fiecare zi" },
                { value: "weekly", label: draft.date ? `În fiecare săptămână, ${RO_DAYS[weekday(draft.date)]}` : "În fiecare săptămână" },
                { value: "days", label: "În anumite zile ale săptămânii" },
              ]}
            />
          </Field>
          {kind === "days" && (
            <div>
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">În zilele</span>
              <DayPicker value={picked} onChange={setPicked} idPrefix="todo-day" />
            </div>
          )}
          {repeating && (
            <Field label="Se oprește" htmlFor="todo-until" hint={until ? undefined : "Fără sfârșit: se repetă până o ștergi."}>
              <DateSelect id="todo-until" value={until} onChange={setUntil} placeholder="Niciodată" />
            </Field>
          )}
          {repeating && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-dim">
              <Repeat size={13} aria-hidden="true" /> Fiecare zi se bifează separat: bifa de azi nu o atinge pe cea de mâine.
            </p>
          )}
        </div>
        <Field label="Legat de un obicei" htmlFor="todo-habit" hint="Pregătirile pentru un obicei apar lângă el în calendar.">
          <Select
            id="todo-habit"
            value={draft.habitId || null}
            onChange={set("habitId")}
            options={[{ value: null, label: "Niciunul" }, ...habits.map((h) => ({ value: h.id, label: h.name }))]}
          />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
