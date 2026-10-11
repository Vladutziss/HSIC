import React from "react";
import { Leaf } from "lucide-react";

export default function Splash({ text }) {
  return (
    <div className="app-bg grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-dim">
        <Leaf className="anim-flicker text-gold" size={28} aria-hidden="true" />
        <span className="font-pixel text-lg text-ink">{text}</span>
      </div>
    </div>
  );
}
