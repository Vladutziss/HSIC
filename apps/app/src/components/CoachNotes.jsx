import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Choice, IconButton, Skeleton } from "./ui.jsx";
import { DateSelect } from "./Select.jsx";
import { tr } from "../lib/i18n.js";

const KINDS = [
  { id: "note", label: tr("Notă") },
  { id: "event", label: tr("Eveniment") },
  { id: "constraint", label: tr("Restricție") },
  { id: "preference", label: tr("Preferință") },
];
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || tr("Notă");

/**
 * What the player tells the coach: one line to write, the button beside it, the kind as pills. `notes` null = still
 * loading. `onAdd({kind, body, endsOn})`, `onRemove(id)`.
 */
export function CoachNotes({ notes, onAdd, onRemove, busy = false, error = "" }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("note");
  const [endsOn, setEndsOn] = useState(null);
  const can = body.trim().length > 0 && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!can) return;
    const ok = await onAdd({ kind, body: body.trim(), endsOn: endsOn || null });
    if (ok !== false) {
      setBody("");
      setEndsOn(null);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <input
            id="coach-note-body"
            className="field min-w-0 flex-1 basis-60"
            value={body}
            maxLength={300}
            placeholder={tr("ex.: Am examen pe 20 octombrie")}
            aria-label={tr("Nota ta")}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" variant="mint" icon={Plus} busy={busy} disabled={!can} className="max-sm:w-full sm:shrink-0">{tr("Adaugă nota")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Choice label={tr("Tipul notei")} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
          <div className="flex items-center gap-2">
            <label htmlFor="coach-note-ends" className="text-xs font-extrabold text-dim">{tr("Valabilă până la")}</label>
            <div className="w-44">
              <DateSelect id="coach-note-ends" value={endsOn} onChange={setEndsOn} placeholder={tr("Fără dată")} />
            </div>
          </div>
        </div>
      </form>

      <p className="mt-3 text-[11px] font-bold text-faint">{tr("Notele sunt trimise modelului AI când ceri un plan. Nu scrie date personale sensibile.")}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-dim">
          {error}
        </p>
      )}

      <div className="mt-4" aria-live="polite">
        {notes === null || notes === undefined ? (
          <Skeleton className="h-16" />
        ) : notes.length === 0 ? (
          <p className="text-sm font-semibold text-dim">{tr("Nicio notă activă. Scrie prima: un examen, o restricție sau ce îți place.")}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="inset flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-body">{n.body}</p>
                  <p className="text-xs font-bold text-dim">
                    {kindLabel(n.kind)}
                    {n.ends_on ? tr(" · până la {ends_on}", { ends_on: n.ends_on }) : ""}
                  </p>
                </div>
                <IconButton icon={Trash2} label={tr("Șterge nota: {body}", { body: n.body })} disabled={busy} onClick={() => onRemove(n.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
