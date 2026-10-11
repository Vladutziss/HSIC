// Molt as an inline SVG, from the same pixel sprites as the app (shared via @molted/ui).
import { spriteRuns } from "@molted/ui/sprites.js";

export const spriteSvg = (opts) =>
  `<svg viewBox="0 0 32 32" shape-rendering="crispEdges" class="block h-full w-full" aria-hidden="true">${spriteRuns(opts)
    .map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`)
    .join("")}</svg>`;
