// Generates public/og.png (1200x630): Molt in five stages on the night background.
// Run once with `node apps/web/scripts/og.mjs`; the PNG is committed. No image libraries: PNG is written by hand.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { spriteRuns } from "@molted/ui/sprites.js";

const W = 1200, H = 630, SCALE = 6, SIZE = 32 * SCALE, GAP = 30;
const px = Buffer.alloc(W * H * 4);
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const put = (x, y, [r, g, b], a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
};

// night gradient + a few stars (deterministic)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / H, glow = Math.max(0, 1 - Math.hypot(x - W * 0.85, y + 90) / 700);
  put(x, y, [12 + 30 * glow + 6 * t, 10 + 14 * glow, 29 + 70 * glow + 10 * t]);
}
let s = 7;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 90; i++) put(Math.floor(rnd() * W), Math.floor(rnd() * H), [255, 255, 255], 255 * (0.3 + rnd() * 0.5) | 0);

// gold ground line + the five stages
const total = 5 * SIZE + 4 * GAP, x0 = (W - total) / 2, y0 = 215;
for (let x = x0; x < x0 + total; x++) for (let k = 0; k < 6; k++) put(Math.round(x), y0 + SIZE + 14 + k, hex("#ffc542"));
["egg", "hatchling", "apprentice", "adept", "master"].forEach((stage, i) => {
  for (const [rx, ry, rw, c] of spriteRuns({ path: "sport", stage, mood: "idle" })) {
    const col = hex(c);
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < rw * SCALE; dx++) put(Math.round(x0 + i * (SIZE + GAP) + rx * SCALE + dx), y0 + ry * SCALE + dy, col);
  }
});

// PNG encoding
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(new URL("../public/og.png", import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("og.png written");
