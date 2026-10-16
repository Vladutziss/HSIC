import React, { useState } from "react";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Panel, SectionTitle, Skeleton } from "./ui.jsx";
import { DateSelect, Select } from "./Select.jsx";

const KINDS = [
  { id: "event", label: "Eveniment" },
  { id: "constraint", label: "Restricție" },
  { id: "preference", label: "Preferință" },
  { id: "note", label: "Notă" },
];
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || "Notă";

/** What the player tells the coach. `notes` null = still loading. `onAdd({kind, body, endsOn})`, `onRemove(id)`. */
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
    <Panel tone="violet" className="p-4 sm:p-5">
      <SectionTitle icon={NotebookPen} tone="violet" sub="Spune-i lui Molt ce nu se vede în bifări: examene, restricții, preferințe">
        Ce știe Molt despre tine
      </SectionTitle>

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="sm:col-span-2">
          <label htmlFor="coach-note-body" className="mb-1 block text-xs font-extrabold text-dim">
            Nota ta
          </label>
          <input
            id="coach-note-body"
            className="field"
            value={body}
            maxLength={300}
            placeholder="ex.: Am examen pe 20 octombrie"
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <div className="w-44">
            <label htmlFor="coach-note-kind" className="mb-1 block text-xs font-extrabold text-dim">
              Tip
            </label>
            <Select id="coach-note-kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
          </div>
          <div className="w-56">
            <label htmlFor="coach-note-ends" className="mb-1 block text-xs font-extrabold text-dim">
              Valabilă până la (opțional)
            </label>
            <DateSelect id="coach-note-ends" value={endsOn} onChange={setEndsOn} placeholder="Fără dată" />
          </div>
          <Button type="submit" variant="mint" icon={Plus} busy={busy} disabled={!can}>
            Adaugă
          </Button>
        </div>
      </form>

      <p className="mt-2 text-[11px] font-bold text-faint">Notele sunt trimise modelului AI când ceri un plan. Nu scrie date personale sensibile.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-dim">
          {error}
        </p>
      )}

      <div className="mt-3" aria-live="polite">
        {notes === null || notes === undefined ? (
          <Skeleton className="h-16" />
        ) : notes.length === 0 ? (
          <p className="text-sm font-semibold text-dim">Nicio notă activă.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="inset flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-body break-words">{n.body}</p>
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
    </Panel>
  );
}
