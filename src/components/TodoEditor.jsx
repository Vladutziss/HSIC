import React, { useState } from "react";
import { Check, ListTodo, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "./ui.jsx";
import { DateSelect, Select, TimeSelect } from "./Select.jsx";
import { fmtDuration } from "../lib/dates.js";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function TodoEditor({ todo, state, today, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState({ ...todo });
  const set = (k) => (v) => setDraft((x) => ({ ...x, [k]: v }));
  const valid = draft.title.trim().length > 0;
  const habits = (state.habits || []).filter((h) => !h.archivedAt);
  const save = () => {
    if (!valid) return;
    const { isNew, ...rest } = draft;
    onSave({ ...rest, title: rest.title.trim(), time: rest.date ? rest.time : null });
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
          <Button id="todo-save" icon={Check} onClick={save} disabled={!valid}>
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
          <button type="button" className="rounded-full px-3 py-1 text-xs font-extrabold text-dim ring-1 ring-edge hover:text-ink" onClick={() => setDraft((x) => ({ ...x, date: null, time: null }))}>
            Fără dată
          </button>
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
