import React, { useState } from "react";
import { Check, ListTodo, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "./ui.jsx";
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
            <input id="todo-date" type="date" className="field" value={draft.date || ""} onChange={(e) => set("date")(e.target.value || null)} />
          </Field>
          <Field label="Ora" htmlFor="todo-time" hint="Opțional">
            <input id="todo-time" type="time" className="field" value={draft.time || ""} disabled={!draft.date} onChange={(e) => set("time")(e.target.value || null)} />
          </Field>
          <Field label="Durată" htmlFor="todo-dur">
            <select id="todo-dur" className="field" value={draft.dur || 30} onChange={(e) => set("dur")(Number(e.target.value))}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
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
          <select id="todo-habit" className="field" value={draft.habitId || ""} onChange={(e) => set("habitId")(e.target.value || null)}>
            <option value="">Niciunul</option>
            {habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
