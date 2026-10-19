import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Choice, IconButton, Skeleton } from "./ui.jsx";
import { DateSelect } from "./Select.jsx";

const KINDS = [
  { id: "note", label: "Notă" },
  { id: "event", label: "Eveniment" },
  { id: "constraint", label: "Restricție" },
  { id: "preference", label: "Preferință" },
];
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || "Notă";

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
            placeholder="ex.: Am examen pe 20 octombrie"
            aria-label="Nota ta"
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" variant="mint" icon={Plus} busy={busy} disabled={!can} className="max-sm:w-full sm:shrink-0">
            Adaugă nota
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Choice label="Tipul notei" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
          <div className="flex items-center gap-2">
            <label htmlFor="coach-note-ends" className="text-xs font-extrabold text-dim">
              Valabilă până la
            </label>
            <div className="w-44">
              <DateSelect id="coach-note-ends" value={endsOn} onChange={setEndsOn} placeholder="Fără dată" />
            </div>
          </div>
        </div>
      </form>

      <p className="mt-3 text-[11px] font-bold text-faint">Notele sunt trimise modelului AI când ceri un plan. Nu scrie date personale sensibile.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-dim">
          {error}
        </p>
      )}

      <div className="mt-4" aria-live="polite">
        {notes === null || notes === undefined ? (
          <Skeleton className="h-16" />
        ) : notes.length === 0 ? (
          <p className="text-sm font-semibold text-dim">Nicio notă activă. Scrie prima: un examen, o restricție sau ce îți place.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="inset flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-body">{n.body}</p>
                  <p className="text-xs font-bold text-dim">
                    {kindLabel(n.kind)}
                    {n.ends_on ? ` · până la ${n.ends_on}` : ""}
                  </p>
                </div>
                <IconButton icon={Trash2} label={`Șterge nota: ${n.body}`} disabled={busy} onClick={() => onRemove(n.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
