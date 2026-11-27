// Garderobă: what Molt wears. The big picture on the left is the live look; the items are the same character shown
// wearing each one, so a hat is judged on Molt and not on an icon. Unlocked items are worn with one tap; a locked one
// is previewed on Molt and says what is missing (nothing is hidden, nothing is random).

import React, { useMemo, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Bar, Button, Chip } from "../components/ui.jsx";
import { Sprite, eggCrack } from "../components/Sprite.jsx";
import { RARITY_LABEL, SLOT_LABEL, SLOTS, findItem, hintFor, itemsFor, nextReward, unlockedIds } from "../lib/cosmetics.js";
import { tr } from "../lib/i18n.js";

const RARITY_TONE = { common: "dim", rare: "sky", epic: "violet", legendary: "gold" };
const RARITY_RING = { common: "ring-edge", rare: "ring-sky/50", epic: "ring-violet/60", legendary: "ring-gold/60" };

// slots that have something to choose from
const SLOTS_SHOWN = SLOTS.filter((s) => itemsFor(s).length > 1);
// the stage index from which a slot is worn (the renderer decides the same, see `wearable` in sprites.js)
const WORN_FROM = { hat: 2, held: 3 };
const STAGE_NAME = { 2: tr("Ucenic"), 3: tr("Adept") };

export default function Wardrobe({ state, d, onLook }) {
  const c = d.companion;
  const path = state.profile?.path || "sport";
  const [slot, setSlot] = useState(SLOTS_SHOWN[0]);
  const [picked, setPicked] = useState(null); // a locked item being previewed
  const have = useMemo(() => unlockedIds(d.facts, state.unlocked), [d.facts, state.unlocked]);
  const items = itemsFor(slot);
  const worn = d.look[slot];
  const wornItem = findItem(slot, worn);
  const shown = picked ? { ...d.look, [slot]: picked.id } : d.look;
  const detail = picked || wornItem;
  const detailHint = detail ? hintFor(detail, d.facts) : null;
  const next = useMemo(() => nextReward(d.facts, state.unlocked), [d.facts, state.unlocked]);
  const tooYoung = WORN_FROM[slot] != null && c.stageIndex < WORN_FROM[slot];

  const choose = (item) => {
    if (have.has(item.id)) {
      setPicked(null);
      onLook(slot, item.id);
    } else setPicked(picked?.id === item.id ? null : item);
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px),minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="pedestal flex justify-center rounded-2xl px-4 pb-2 pt-5 ring-1 ring-edge">
          <Sprite path={path} stage={c.stage.id} mood={c.mood} size={160} crack={eggCrack(c.ep)} look={shown} label={tr("{v} cu ținuta aleasă", { v: c.name || tr("Moltul tău") })} />
        </div>
        <div className="inset space-y-2 p-3" aria-live="polite">
          {detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg leading-tight text-ink">{detail.name}</p>
                <Chip tone={RARITY_TONE[detail.rarity]}>{RARITY_LABEL[detail.rarity]}</Chip>
              </div>
              {picked ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-extrabold text-body">
                    <Lock size={14} className="shrink-0 text-violet-hi" aria-hidden="true" /> {detailHint?.text}
                  </p>
                  {detailHint?.progress && <Bar value={detailHint.progress.ratio} tone="violet" label={tr("Progres spre {name}", { name: picked.name })} />}
                  <p className="text-xs font-semibold text-dim">{tr("Previzualizare: îl porți când îl câștigi.")}</p>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-mint">
                  <Check size={14} className="shrink-0" aria-hidden="true" />{" "}{tr("Îl porți acum")}</p>
              )}
            </>
          ) : null}
          {tooYoung && <p className="text-xs font-semibold text-dim">{tr("Se vede de la {v}: {v2} se poartă după ce Molt iese din ou și crește.", { v: STAGE_NAME[WORN_FROM[slot]], v2: slot === "hat" ? tr("pălăriile") : "uneltele" })}</p>}
        </div>
        {next && (
          <div className="rounded-2xl bg-violet/10 p-3 ring-1 ring-violet/30">
            <p className="text-xs font-extrabold text-violet-hi">{tr("Cea mai apropiată recompensă")}</p>
            <p className="mt-0.5 text-sm font-extrabold text-ink">{next.item.name}</p>
            <p className="text-xs font-semibold text-body">{hintFor(next.item, d.facts).text}</p>
            <Bar className="mt-2" value={next.progress.ratio} tone="violet" label={tr("Progres spre {name}", { name: next.item.name })} />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label={tr("Ce porți")} className="mb-3 flex flex-wrap gap-1.5">
          {SLOTS_SHOWN.map((s) => {
            const list = itemsFor(s);
            const on = s === slot;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setSlot(s);
                  setPicked(null);
                }}
                className={`focus-ring rounded-full px-3 py-1.5 text-sm font-extrabold ring-1 transition ${on ? "bg-violet text-on-violet ring-violet-hi" : "bg-well text-dim ring-edge hover:text-ink"}`}
              >
                {SLOT_LABEL[s]} <span className="text-xs opacity-80">{list.filter((i) => have.has(i.id)).length}/{list.length}</span>
              </button>
            );
          })}
        </div>
        <ul role="radiogroup" aria-label={SLOT_LABEL[slot]} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => {
            const owned = have.has(item.id);
            const isWorn = item.id === worn;
            const isPicked = picked?.id === item.id;
            const hint = owned ? "" : hintFor(item, d.facts).text;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isWorn}
                  aria-label={`${item.name}${isWorn ? tr(", îl porți") : owned ? "" : tr(", blocat: {hint}", { hint })}`}
                  onClick={() => choose(item)}
                  className={`focus-ring relative flex w-full flex-col items-center gap-1 rounded-2xl bg-well p-2 text-center ring-2 transition hover:bg-panel-hi ${
                    isWorn ? "ring-gold" : isPicked ? "ring-violet" : `${RARITY_RING[item.rarity]} ring-1`
                  }`}
                >
                  <span className="pedestal flex h-[72px] w-[72px] items-end justify-center rounded-xl">
                    <Sprite path={path} stage={c.stage.id} mood="idle" size={64} crack={eggCrack(c.ep)} look={{ ...d.look, [slot]: item.id }} still silhouette={!owned} />
                  </span>
                  <span className={`line-clamp-2 min-h-[2.1em] text-xs font-extrabold leading-tight ${owned ? "text-ink" : "text-dim"}`}>{item.name}</span>
                  {isWorn && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold text-on-gold" aria-hidden="true">
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                  )}
                  {!owned && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-panel-hi text-dim ring-1 ring-edge" aria-hidden="true">
                      <Lock size={11} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {worn !== "none" && SLOTS_SHOWN.includes(slot) && itemsFor(slot).some((i) => i.id === "none") && (
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => onLook(slot, "none")}>{tr("Scoate {v}", { v: slot === "hat" ? tr("pălăria") : slot === "aura" ? tr("aura") : tr("unealta") })}</Button>
        )}
      </div>
    </div>
  );
}
