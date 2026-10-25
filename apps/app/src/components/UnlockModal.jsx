import React from "react";
import { Shirt } from "lucide-react";
import { Button, Chip, Modal } from "./ui.jsx";
import { Sprite, eggCrack } from "./Sprite.jsx";
import { RARITY_LABEL, SLOT_LABEL, itemById } from "../lib/cosmetics.js";
import { tr } from "../lib/i18n.js";

const RARITY_TONE = { common: "dim", rare: "sky", epic: "violet", legendary: "gold" };

/**
 * "Ai deblocat…": shown once per new item (App records them in `state.unlocked`). One item can be worn on the spot; several are
 * looked at in the Garderobă. Molt is drawn wearing the first one, so the reward is seen and not only read about.
 */
export function UnlockModal({ ids, state, d, onWear, onOpen, onClose }) {
  const items = ids.map((id) => itemById(id)).filter(Boolean);
  if (!items.length) return null;
  const first = items[0];
  const one = items.length === 1;
  const path = state.profile?.path || "sport";
  const c = d.companion;
  return (
    <Modal
      open
      onClose={onClose}
      title={one ? tr("Ai deblocat ceva nou") : tr("Ai deblocat {length} obiecte", { length: items.length })}
      icon={Shirt}
      tone="gold"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tr("Mai târziu")}</Button>
          {one ? (
            <Button
              onClick={() => {
                onWear(first.slot, first.id);
                onClose();
              }}
              data-autofocus
            >{tr("Îmbracă acum")}</Button>
          ) : (
            <Button
              onClick={() => {
                onOpen();
                onClose();
              }}
              data-autofocus
            >{tr("Deschide Garderoba")}</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="pedestal flex justify-center rounded-3xl px-10 pt-2">
          <Sprite path={path} stage={c.stage.id} mood="joy" size={160} crack={eggCrack(c.ep)} look={{ ...d.look, [first.slot]: first.id }} label={tr("{v} purtând {name}", { v: c.name || tr("Moltul tău"), name: first.name })} />
        </div>
        <ul className="w-full space-y-2 text-left">
          {items.map((i) => (
            <li key={i.id} className="inset flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-tight text-ink">{i.name}</p>
                <p className="text-xs font-semibold text-dim">{SLOT_LABEL[i.slot]}</p>
              </div>
              <Chip tone={RARITY_TONE[i.rarity]}>{RARITY_LABEL[i.rarity]}</Chip>
            </li>
          ))}
        </ul>
        <p className="text-sm font-semibold text-body">{tr("Le-ai câștigat din ce ai făcut. Rămân ale tale, orice s-ar întâmpla cu momentum-ul.")}</p>
      </div>
    </Modal>
  );
}
