import React, { memo } from "react";
import { spriteRuns } from "../lib/sprites.js";

const Pixels = memo(function Pixels({ runs, className }) {
  return (
    <svg viewBox="0 0 32 32" shapeRendering="crispEdges" className={className} aria-hidden="true">
      {runs.map(([x, y, w, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill={c} />
      ))}
    </svg>
  );
});

function Zzz({ size }) {
  const fs = Math.max(11, size / 6.5);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute" style={{ right: size * 0.04, top: size * 0.1 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="zzz font-pixel absolute font-bold text-violet-hi"
          style={{ fontSize: fs * (1 - i * 0.18), animationDelay: `${i * 0.9}s`, left: i * 3, top: -i * 2 }}
        >
          z
        </span>
      ))}
    </div>
  );
}

function Twinkles({ size }) {
  const spots = [
    [0.08, 0.18],
    [0.84, 0.12],
    [0.9, 0.6],
    [0.04, 0.62],
  ];
  return spots.map(([x, y], i) => (
    <svg
      key={i}
      aria-hidden="true"
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className="twinkle pointer-events-none absolute"
      style={{ left: x * size, top: y * size, width: size / 8, height: size / 8, animationDelay: `${i * 0.4}s` }}
    >
      <rect x="2" y="0" width="1" height="5" fill="#ffe08a" />
      <rect x="0" y="2" width="5" height="1" fill="#ffe08a" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" />
    </svg>
  ));
}

/** The companion. Sizes that are multiples of 32 keep the pixels crisp. */
export function Sprite({ path = "sport", stage = "egg", mood = "idle", size = 128, crack = 0, still = false, label, silhouette = false, className = "" }) {
  const runs = spriteRuns({ path, stage, mood, crack });
  const blink = !still && stage !== "egg" && mood === "idle" ? spriteRuns({ path, stage, mood, eyes: "closed", crack }) : null;
  const motion = still ? "" : stage === "egg" ? (mood === "joy" ? "anim-wobble-fast" : "anim-wobble") : mood === "sleep" ? "anim-breathe" : mood === "joy" ? "anim-hop" : "anim-bob";
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, filter: silhouette ? "brightness(0) opacity(0.45)" : undefined }}
    >
      <div className={`absolute inset-0 ${motion} ${stage === "legend" && !still ? "anim-glow" : ""}`} style={{ transformOrigin: "50% 92%" }}>
        <Pixels runs={runs} className="absolute inset-0 h-full w-full" />
        {blink && <Pixels runs={blink} className="anim-blink absolute inset-0 h-full w-full" />}
      </div>
      {mood === "sleep" && !still && <Zzz size={size} />}
      {(mood === "joy" || mood === "happy") && !still && <Twinkles size={size} />}
    </div>
  );
}

export function eggCrack(ep) {
  return ep >= 2 ? 2 : ep >= 1 ? 1 : 0;
}
