import React, { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Camera, FileText, ImagePlus, Mic, ScrollText, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, Square, Upload } from "lucide-react";
import { Button, Chip, Modal, Skeleton, Tabs, Typewriter } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { iconFor } from "./icons.js";
import { PROOF, VERDICT_CODE } from "../lib/engine.js";
import { checkInGain, VERDICT_LABEL } from "../lib/derive.js";
import { TEMPLATE_TITLES, aiErrorCopy, templateStory, verifyProof } from "../lib/ai.js";
import { audioDuration, canRecord, preparePhoto, startRecording, storableAudioType } from "../lib/media.js";
import { uploadAsset } from "../lib/store.js";
import { uid } from "../lib/catalog.js";

export const VERDICT_STYLE = {
  verified: { tone: "mint", icon: ShieldCheck, title: "Dovadă verificată" },
  plausible: { tone: "sky", icon: BadgeCheck, title: "Dovadă plauzibilă" },
  self: { tone: "violet", icon: ShieldQuestion, title: "Dovadă salvată, nevalidată" },
  rejected: { tone: "rose", icon: ShieldAlert, title: "Dovada nu se potrivește" },
};

export function ProofBadge({ verdict }) {
  const s = VERDICT_STYLE[verdict];
  if (!s) return null;
  return (
    <Chip tone={s.tone} icon={s.icon}>
      dovadă {VERDICT_LABEL[verdict]}
    </Chip>
  );
}

const MAX_SECONDS = 90;
const ICON_TONE = { mint: "text-mint", sky: "text-sky", rose: "text-rose", violet: "text-violet-hi" };

export function ProofModal({ open, habitId, state, d, today, ai, env, recentStories, onSave, onClose }) {
  const [picked, setPicked] = useState(null);
  const [type, setType] = useState("photo");
  const [photo, setPhoto] = useState(null);
  const [audio, setAudio] = useState(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState("capture"); // capture | working | done
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState("");
  const [rec, setRec] = useState(null);
  const [recSec, setRecSec] = useState(0);
  const ctl = useRef(null);

  // reset whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setPicked(habitId || null);
    setType("photo");
    setPhoto(null);
    setAudio(null);
    setNote("");
    setPhase("capture");
    setResult(null);
    setProblem("");
    setRec(null);
  }, [open, habitId]);

  useEffect(() => {
    if (!rec) return undefined;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      setRecSec(s);
      if (s >= MAX_SECONDS) stopRec();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  useEffect(() => () => ctl.current?.abort(), []);

  const candidates = useMemo(() => d.plan.filter((p) => (p.code || 0) <= 1), [d.plan]);
  const habit = state.habits.find((h) => h.id === picked);
  const code = habit ? state.log?.[today]?.[habit.id] || 0 : 0;
  const c = d.companion;

  if (!open) return null;

  const close = () => {
    ctl.current?.abort();
    if (rec) rec.cancel();
    onClose();
  };

  async function pickPhoto(file) {
    if (!file) return;
    setProblem("");
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ ...prepared, url: prepared.thumb, name: file.name });
    } catch {
      setProblem("Nu am putut citi imaginea. Încearcă o poză JPEG sau PNG.");
    }
  }

  async function pickAudio(file) {
    if (!file) return;
    const seconds = await audioDuration(file);
    setAudio({ blob: file, url: URL.createObjectURL(file), seconds, storeType: storableAudioType(file, file.name) });
  }

  async function startRec() {
    setProblem("");
    try {
      const r = await startRecording();
      setRecSec(0);
      setRec(r);
    } catch {
      setProblem("Microfonul nu e disponibil aici. Poți încărca o notă vocală înregistrată pe telefon.");
    }
  }
  async function stopRec() {
    if (!rec) return;
    const r = rec;
    setRec(null);
    const { blob, seconds } = await r.stop();
    setAudio({ blob, url: URL.createObjectURL(blob), seconds, storeType: storableAudioType(blob) });
  }

  const valid =
    !!habit &&
    ((type === "photo" && photo) || (type === "voice" && audio && note.trim().length >= 3) || (type === "note" && note.trim().length >= 10));

  async function submit() {
    if (!valid) return;
    setPhase("working");
    setProblem("");
    ctl.current = new AbortController();
    const upload =
      type === "photo"
        ? uploadAsset(env, photo.blob, "image/jpeg")
        : type === "voice" && audio.storeType
          ? uploadAsset(env, audio.blob, audio.storeType)
          : Promise.resolve(null);
    const stageName = c.stage.name;
    let verdict = null;
    let aiNote = "";
    if (ai.available) {
      try {
        verdict = await verifyProof(
          {
            habit,
            type,
            note,
            image: photo?.blob,
            seconds: audio?.seconds,
            companion: { name: c.name, stage: stageName },
            recent: recentStories.slice(-3).map((s) => s.story),
            pathId: state.profile.path,
            canSeeImage: ai.images,
          },
          ctl.current.signal
        );
      } catch (e) {
        if (e?.code === "cancelled") return;
        aiNote = aiErrorCopy(e?.code);
      }
    }
    if (!verdict) {
      verdict = {
        verdict: "self",
        reason: ai.available
          ? `${aiNote || "AI-ul nu a putut verifica dovada acum."} Am salvat-o ca nevalidată.`
          : "Verificarea AI nu e disponibilă aici, așa că dovada se salvează ca nevalidată.",
        title: TEMPLATE_TITLES[Math.floor(Math.random() * TEMPLATE_TITLES.length)],
        story: templateStory({ pathId: state.profile.path, name: c.name, habitName: habit.name, verdict: "self", stage: stageName }),
        ai: false,
      };
    }
    const assetId = await upload;
    const record = {
      id: uid("p"),
      day: today,
      habitId: habit.id,
      type,
      note: note.trim().slice(0, 500),
      verdict: verdict.verdict,
      reason: verdict.reason,
      title: verdict.title,
      story: verdict.story,
      ai: !!verdict.ai,
      at: new Date().toISOString(),
      assetId: assetId || null,
      // in Supabase mode the small thumbnail stays in the row, so lists need no signed URL
      thumb: type === "photo" && (!assetId || env?.current?.kind === "supabase") ? photo.thumb : null,
      seconds: type === "voice" ? audio.seconds || null : null,
    };
    onSave(record);
    const newCode = VERDICT_CODE[record.verdict];
    setResult({
      ...record,
      ep: PROOF[newCode]?.ep || 0,
      gain: Math.max(0, checkInGain(habit, newCode, d.runMult) - (code ? checkInGain(habit, code, d.runMult) : 0)),
      preview: type === "photo" ? photo.thumb : null,
    });
    setPhase("done");
  }

  // ------------------------------------------------------------ views

  const HabitIcon = habit ? iconFor(habit.icon) : null;

  let body;
  if (!habit) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-body">Pentru ce misiune trimiți dovada?</p>
        {candidates.length === 0 && <p className="inset p-3 text-sm text-dim">Toate misiunile de azi au deja o dovadă. Revino mâine!</p>}
        {candidates.map(({ h, scheduled }) => {
          const Icon = iconFor(h.icon);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setPicked(h.id)}
              className="focus-ring flex w-full items-center gap-3 rounded-xl border border-edge bg-panel-hi/60 p-3 text-left hover:border-gold/60"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${h.color}26`, color: h.color }}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold text-ink">{h.name}</span>
                <span className="block text-xs font-semibold text-dim">{h.target}</span>
              </span>
              {!scheduled && <Chip>opțional azi</Chip>}
            </button>
          );
        })}
      </div>
    );
  } else if (phase === "capture") {
    body = (
      <div className="space-y-4">
        <div className="inset flex items-center gap-3 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `${habit.color}26`, color: habit.color }}>
            <HabitIcon size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-ink">{habit.name}</div>
            <div className="text-xs font-semibold text-dim">
              {habit.target}
              {habit.proofHint ? ` · sugestie: ${habit.proofHint}` : ""}
            </div>
          </div>
          {!habitId && (
            <button type="button" className="text-xs font-bold text-dim underline hover:text-ink" onClick={() => setPicked(null)}>
              Schimbă
            </button>
          )}
        </div>

        <Tabs
          value={type}
          onChange={(t) => {
            setType(t);
            setProblem("");
          }}
          items={[
            { value: "photo", label: "Foto", icon: Camera, id: "proof-photo" },
            { value: "voice", label: "Notă vocală", icon: Mic, id: "proof-voice" },
            { value: "note", label: "Text", icon: FileText, id: "proof-note" },
          ]}
        />

        {type === "photo" && (
          <div className="space-y-3">
            <label htmlFor="proof-file" className="focus-ring block cursor-pointer rounded-2xl border-2 border-dashed border-edge-hi bg-well p-4 text-center transition hover:border-gold/70">
              {photo ? (
                <img src={photo.url} alt="Previzualizarea dovezii" className="mx-auto max-h-56 rounded-xl object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 py-6 text-dim">
                  <ImagePlus size={28} className="text-gold" aria-hidden="true" />
                  <span className="font-extrabold text-ink">Alege sau fă o poză</span>
                  <span className="text-xs font-semibold">Pe telefon se deschide camera.</span>
                </span>
              )}
              <input id="proof-file" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {photo && <p className="text-center text-xs font-semibold text-dim">Atinge imaginea ca să alegi alta.</p>}
            <textarea
              className="field min-h-[72px]"
              placeholder="Un comentariu, dacă vrei (ex.: 5 km în 28 de minute)"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Comentariu la poză"
            />
          </div>
        )}

        {type === "voice" && (
          <div className="space-y-3">
            <div className="inset flex flex-wrap items-center gap-3 p-3">
              {canRecord() &&
                (rec ? (
                  <Button variant="rose" size="sm" icon={Square} onClick={stopRec}>
                    Oprește · {recSec}s
                  </Button>
                ) : (
                  <Button variant="violet" size="sm" icon={Mic} onClick={startRec}>
                    Înregistrează
                  </Button>
                ))}
              <label htmlFor="proof-audio" className="btn btn-ghost btn-sm cursor-pointer">
                <Upload size={15} aria-hidden="true" /> Încarcă audio
                <input id="proof-audio" type="file" accept="audio/*" className="sr-only" onChange={(e) => pickAudio(e.target.files?.[0])} />
              </label>
              {audio && <audio controls src={audio.url} className="h-9 max-w-full flex-1" />}
            </div>
            <textarea
              className="field min-h-[72px]"
              placeholder="Ce spui în notă? (AI-ul citește doar descrierea)"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Descrierea notei vocale"
            />
            {audio && !audio.storeType && (
              <p className="text-xs font-semibold text-faint">Formatul acesta nu poate fi păstrat; salvăm descrierea și durata.</p>
            )}
          </div>
        )}

        {type === "note" && (
          <textarea
            className="field min-h-[120px]"
            placeholder="Ce ai făcut azi pentru misiunea asta? Fii concret (minim 10 caractere)."
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Nota ta"
          />
        )}

        {problem && <p className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">{problem}</p>}

        <p className="flex items-start gap-2 text-xs font-semibold text-dim">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
          {ai.available
            ? "AI-ul verifică dovada și scrie următorul capitol din povestea personajului tău."
            : "AI-ul nu e disponibil aici: dovada se salvează ca nevalidată (+1 PE), iar povestea vine dintr-un șablon."}
        </p>
      </div>
    );
  } else if (phase === "working") {
    body = (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="pedestal rounded-full p-2">
          <Sprite path={state.profile.path} stage={c.stage.id} mood="idle" size={128} crack={eggCrack(c.ep)} />
        </div>
        <div className="font-pixel text-lg text-ink">{ai.available ? "AI-ul analizează dovada…" : "Salvăm dovada…"}</div>
        <div className="w-full max-w-sm space-y-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    );
  } else if (result) {
    const s = VERDICT_STYLE[result.verdict];
    const VIcon = s.icon;
    body = (
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-2xl p-4 ring-1 ${s.tone === "mint" ? "bg-mint/10 ring-mint/30" : s.tone === "sky" ? "bg-sky/10 ring-sky/30" : s.tone === "rose" ? "bg-rose/10 ring-rose/30" : "bg-violet/10 ring-violet/30"}`}>
          <VIcon size={26} className={`shrink-0 ${ICON_TONE[s.tone]}`} aria-hidden="true" />
          <div>
            <div className="font-extrabold text-ink">{s.title}</div>
            <p className="text-sm text-body">{result.reason}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.ep > 0 && (
            <Chip tone="violet" icon={Sparkles}>
              +{result.ep} PE
            </Chip>
          )}
          {result.gain > 0 && <Chip tone="gold">+{result.gain} momentum</Chip>}
          {!result.ai && <Chip>poveste din șablon</Chip>}
        </div>
        <div className="panel panel-gold relative overflow-hidden p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gold">
            <ScrollText size={14} aria-hidden="true" /> Capitol nou · {result.title}
          </div>
          <div className="flex gap-3">
            {result.preview && <img src={result.preview} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-edge" />}
            <Typewriter text={result.story} className="text-[15px] leading-relaxed text-ink" />
          </div>
        </div>
      </div>
    );
  }

  const footer =
    habit && phase === "capture" ? (
      <>
        <Button variant="ghost" onClick={close}>
          Renunță
        </Button>
        <Button id="proof-submit" onClick={submit} disabled={!valid} icon={Sparkles}>
          Trimite dovada
        </Button>
      </>
    ) : phase === "working" ? (
      <Button variant="ghost" onClick={close}>
        Oprește
      </Button>
    ) : phase === "done" ? (
      <Button id="proof-done" onClick={close} data-autofocus>
        Gata
      </Button>
    ) : null;

  return (
    <Modal open={open} onClose={close} title="Trimite o dovadă" icon={Camera} tone="violet" dismissable={phase !== "working"} footer={footer}>
      {body}
    </Modal>
  );
}
