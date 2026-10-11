// Draws the Molted egg (brand board: 14 x 16 px, scaled only by whole numbers) into the PWA icons.
// No dependencies: a PNG is a few chunks and Node ships zlib.
//
//   node scripts/build-icons.mjs   -> public/icons/*.png (committed; re-run only when the logo changes)

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");

const COLOR = { ".": null, G: [255, 197, 66], H: [255, 231, 163], S: [217, 154, 30], K: [12, 10, 29] }; // gold, glint, shade, crack
const EGG = [
  "....GGGGGG....",
  "..GGGGGGGGGG..",
  ".GHHGGGGGGGGG.",
  ".GHGGGGGGGGGG.",
  "GGHGGGGGGGGGGG",
  "GHHGGGGGGGGGGG",
  "GHGGGGGGGGGGGG",
  "GGGGGGGGGGGGGG",
  "GGGKGGGKGGGKGG",
  "GGKGKGKGKGKGKG",
  "GKGGGKGGGKGGGK",
  "GGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGS",
  ".GGGGGGGGGGGSS",
  "..GGGGGGGGGSS.",
  "....GGGGSSSS..",
];
const BG = [12, 10, 29]; // Noapte #0c0a1d

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size, cell) {
  const w = EGG[0].length * cell;
  const h = EGG.length * cell;
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - ox) / cell);
      const gy = Math.floor((y - oy) / cell);
      const ch = gx >= 0 && gy >= 0 && gx < EGG[0].length && gy < EGG.length ? EGG[gy][gx] : ".";
      const rgb = COLOR[ch] || BG;
      raw.set(rgb, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// maskable: the OS may crop to a circle of 80% of the side, so the egg stays well inside it
const ICONS = [
  ["icon-192.png", 192, 8],
  ["icon-512.png", 512, 20],
  ["icon-maskable-512.png", 512, 16],
  ["apple-touch-icon.png", 180, 7],
  ["favicon-32.png", 32, 2],
  ["favicon-16.png", 16, 1],
];
fs.mkdirSync(out, { recursive: true });
for (const [name, size, cell] of ICONS) fs.writeFileSync(path.join(out, name), png(size, cell));
console.log("icons ->", out);
