// Procedural pixel art for the companion. Shapes are rasterized onto a
// 32×32 grid (no anti-aliasing), then a silhouette outline is added, so every
// class, stage and mood comes out in one consistent pixel style.

const S = 32;
const mirror = (x) => S - 1 - x;

const OUT = "#1a0f2e";
const GOLD_OUT = "#ffcf4a";
const EYE = "#1a0f2e";
const WHITE = "#ffffff";
const CHEEK = "#ff8fb1";
const MOUTH = "#6b1838";
const TONGUE = "#ff6f91";
const SHELL = { base: "#f7ecd9", hi: "#fffaf0", lo: "#d9c4a0" };
const WOOD = { base: "#a0612f", lo: "#6e3f1c", hi: "#c98a4f" };
const METAL = { base: "#aeb6c9", lo: "#6c7389", hi: "#e3e8f2", bar: "#4b4f66" };
const GOLD = { base: "#ffcf4a", lo: "#c8901a", hi: "#fff0b0" };

export const PALETTES = {
  sport: { body: "#ff8a4c", hi: "#ffc39a", lo: "#d6602a", belly: "#ffd9b8", accent: "#e8344e", accentHi: "#ff7387", cape: "#9e1f3a", capeHi: "#c9334f" },
  studiu: { body: "#5aa9ff", hi: "#a6d1ff", lo: "#3474d0", belly: "#d8eaff", accent: "#ffcf4a", accentHi: "#ffe79a", cape: "#22337a", capeHi: "#3a4fa8", book: "#c23b53", bookHi: "#e05d72" },
  bani: { body: "#f2b33d", hi: "#ffdc94", lo: "#c4831a", belly: "#fff2cf", accent: "#3a2a56", accentHi: "#5c4685", cape: "#5c2593", capeHi: "#7d3dbd" },
  minte: { body: "#3fd49e", hi: "#97f2cf", lo: "#21a072", belly: "#d9fcec", accent: "#79e05a", accentHi: "#b4f59c", cape: "#145c45", capeHi: "#22805f", orb: "#a6ffe0" },
  creativ: { body: "#c58bff", hi: "#e6c9ff", lo: "#9358d8", belly: "#f5e9ff", accent: "#ff6fae", accentHi: "#ffa3cd", cape: "#6e2382", capeHi: "#923aa8" },
};

// ------------------------------------------------------------ raster helpers

const grid = () => new Array(S * S).fill(null);
const at = (g, x, y) => (x >= 0 && y >= 0 && x < S && y < S ? g[y * S + x] : null);
function put(g, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < S && y < S) g[y * S + x] = c;
}
const putSym = (g, x, y, c) => {
  put(g, x, y, c);
  put(g, mirror(x), y, c);
};

function ellipse(g, cx, cy, rx, ry, paint) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(g, x, y, typeof paint === "function" ? paint(nx, ny) : paint);
    }
  }
}
// An ellipse with a one-pixel dark ring, so a limb reads as separate from the body.
function ellipseRing(g, cx, cy, rx, ry, paint, ring = OUT) {
  ellipse(g, cx, cy, rx + 1, ry + 1, ring);
  ellipse(g, cx, cy, rx, ry, paint);
}
function rect(g, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(g, x, y, c);
}
function line(g, x0, y0, x1, y1, c) {
  // Bresenham only stops on whole cells: round first, or a fractional end point would never be reached
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
function insidePoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function poly(g, pts, paint) {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = 0; x < S; x++) {
      if (insidePoly(pts, x + 0.5, y + 0.5)) put(g, x, y, typeof paint === "function" ? paint(x, y) : paint);
    }
  }
}
function ring(g, cx, cy, r, c) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r + 0.5 && d >= r - 0.5) put(g, x, y, c);
    }
  }
}
function outline(g, color) {
  const out = g.slice();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (g[y * S + x]) continue;
      if (at(g, x - 1, y) || at(g, x + 1, y) || at(g, x, y - 1) || at(g, x, y + 1)) out[y * S + x] = color;
    }
  }
  return out;
}

// ------------------------------------------------------------ parts

function drawEgg(g, pal, crack) {
  const cx = 16;
  const cy = 17;
  ellipse(g, cx, cy, 8.5, 10.5, (nx, ny) => (nx * 0.55 + ny * 0.8 > 0.62 ? SHELL.lo : SHELL.base));
  ellipse(g, 12.4, 11.5, 2, 2.6, SHELL.hi);
  ellipse(g, 11.5, 14.5, 2.2, 1.7, pal.body);
  ellipse(g, 20.5, 18.5, 2.6, 2.1, pal.body);
  ellipse(g, 14, 23.2, 1.8, 1.4, pal.lo);
  ellipse(g, 19.2, 10.4, 1.3, 1.1, pal.lo);
  ellipse(g, 21.2, 24, 1.1, 1, pal.body);
  if (crack > 0) {
    const pts = [
      [8, 16],
      [10, 14],
      [12, 17],
      [14, 14],
      [16, 17],
      [18, 14],
      [20, 17],
      [22, 14],
      [24, 16],
    ];
    const n = crack >= 2 ? pts.length - 1 : 4;
    for (let i = 0; i < n; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], OUT);
  }
}

function face(g, { eyeY, eyeX, mouthY, mood, eyes }) {
  const closed = eyes === "closed" || mood === "sleep";
  if (mood === "joy" || mood === "happy") {
    // ^ ^
    putSym(g, eyeX - 1, eyeY + 2, EYE);
    putSym(g, eyeX, eyeY + 1, EYE);
    putSym(g, eyeX + 1, eyeY + 1, EYE);
    putSym(g, eyeX + 2, eyeY + 2, EYE);
  } else if (closed) {
    for (let x = eyeX - 1; x <= eyeX + 2; x++) putSym(g, x, eyeY + 2, EYE);
  } else {
    rect(g, eyeX, eyeY, 2, 3, EYE);
    rect(g, mirror(eyeX + 1), eyeY, 2, 3, EYE);
    putSym(g, eyeX, eyeY, WHITE);
  }
  putSym(g, eyeX - 2, mouthY - 1, CHEEK);
  putSym(g, eyeX - 1, mouthY - 1, CHEEK);
  if (mood === "joy") {
    rect(g, 14, mouthY, 4, 2, MOUTH);
    put(g, 15, mouthY + 1, TONGUE);
    put(g, 16, mouthY + 1, TONGUE);
  } else if (mood === "sleep") {
    put(g, 15, mouthY + 1, MOUTH);
    put(g, 16, mouthY + 1, MOUTH);
  } else {
    putSym(g, 14, mouthY, MOUTH);
    putSym(g, 15, mouthY + 1, MOUTH);
  }
}

function drawHatchling(g, pal, mood, eyes) {
  const cx = 16;
  const cy = 20;
  ellipseRing(g, cx - 4.6, cy - 5, 1.7, 2.2, pal.lo);
  ellipseRing(g, cx + 4.6, cy - 5, 1.7, 2.2, pal.lo);
  ellipse(g, cx, cy, 7.5, 6.5, (nx, ny) => (nx * 0.5 + ny * 0.8 > 0.6 ? pal.lo : pal.body));
  ellipse(g, cx - 3.6, cy - 3.2, 1.4, 1, pal.hi);
  face(g, { eyeY: 17, eyeX: 12, mouthY: 21, mood, eyes });
  // the bottom half of the shell it hatched from
  const shell = [
    [7, 24],
    [9, 22],
    [11, 24],
    [13, 22],
    [15, 24],
    [17, 22],
    [19, 24],
    [21, 22],
    [23, 24],
    [25, 22],
    [24.6, 27],
    [21, 29.5],
    [11, 29.5],
    [7.4, 27],
  ];
  poly(g, shell, (x, y) => (x > 19 || y > 27 ? SHELL.lo : SHELL.base));
  put(g, 10, 25, SHELL.hi);
  put(g, 11, 25, SHELL.hi);
  put(g, 10, 26, SHELL.hi);
  ellipse(g, 20.5, 26.5, 1.2, 0.9, pal.body);
}

function drawCape(g, pal) {
  poly(
    g,
    [
      [7, 12],
      [25, 12],
      [30.5, 29.5],
      [1.5, 29.5],
    ],
    (x, y) => ((x + y) % 7 === 0 ? pal.capeHi : x < 11 ? pal.capeHi : pal.cape)
  );
}

function drawMedal(g) {
  rect(g, 15, 24, 2, 2, GOLD.base);
  put(g, 15, 24, GOLD.hi);
  put(g, 16, 25, GOLD.lo);
}

function drawCreature(g, pal, mood, eyes) {
  const cx = 16;
  const cy = 19;
  const rx = 9;
  const ry = 8.5;
  // ears behind the head
  ellipseRing(g, cx - 5.6, cy - ry + 0.8, 2.2, 2.8, pal.lo);
  ellipseRing(g, cx + 5.6, cy - ry + 0.8, 2.2, 2.8, pal.lo);
  ellipse(g, cx - 5.6, cy - ry + 1.4, 1, 1.4, pal.belly);
  ellipse(g, cx + 5.6, cy - ry + 1.4, 1, 1.4, pal.belly);
  // feet
  ellipseRing(g, cx - 4.2, cy + ry - 0.3, 2.6, 1.5, pal.lo);
  ellipseRing(g, cx + 4.2, cy + ry - 0.3, 2.6, 1.5, pal.lo);
  // body with shading, belly and a highlight
  ellipse(g, cx, cy, rx, ry, (nx, ny) => (nx * 0.5 + ny * 0.8 > 0.62 ? pal.lo : pal.body));
  ellipse(g, cx, cy + 3.4, rx * 0.52, ry * 0.42, pal.belly);
  ellipse(g, cx - rx * 0.52, cy - ry * 0.5, 1.6, 1.1, pal.hi);
  put(g, cx - rx * 0.52 - 2, cy - ry * 0.5 + 1, pal.hi);
  // arms
  ellipseRing(g, cx - rx + 0.3, cy + 2, 1.7, 2.3, pal.body);
  ellipseRing(g, cx + rx - 0.3, cy + 2, 1.7, 2.3, pal.body);
  face(g, { eyeY: 16, eyeX: 11, mouthY: 21, mood, eyes });
}

// Head items from Ucenic (apprentice) on.
const HEAD = {
  sport(g, pal) {
    for (let x = 6; x <= 25; x++) {
      if (at(g, x, 12)) put(g, x, 12, pal.accentHi);
      if (at(g, x, 13)) put(g, x, 13, pal.accent);
    }
    put(g, 26, 12, pal.accent);
    put(g, 27, 13, pal.accent);
    put(g, 26, 14, pal.accent);
    put(g, 27, 15, pal.accentHi);
    put(g, 28, 14, pal.accent);
  },
  studiu(g, pal) {
    ring(g, 11.5, 17.5, 2.6, pal.accent);
    ring(g, 20.5, 17.5, 2.6, pal.accent);
    put(g, 15, 16, pal.accent);
    put(g, 16, 16, pal.accent);
  },
  bani(g, pal) {
    rect(g, 13, 4, 6, 6, pal.accent);
    rect(g, 13, 4, 1, 6, pal.accentHi);
    rect(g, 13, 8, 6, 1, GOLD.base);
    rect(g, 10, 10, 12, 1, pal.accent);
    rect(g, 10, 10, 2, 1, pal.accentHi);
  },
  minte(g, pal) {
    line(g, 16, 10, 16, 6, "#2f8a3e");
    ellipse(g, 13.2, 6.4, 2.4, 1.2, pal.accent);
    ellipse(g, 18.8, 5.2, 2.4, 1.2, pal.accent);
    put(g, 12, 6, pal.accentHi);
    put(g, 18, 5, pal.accentHi);
  },
  creativ(g, pal) {
    ellipse(g, 15, 10.2, 7.2, 2.4, (nx) => (nx < -0.3 ? pal.accentHi : pal.accent));
    put(g, 15, 7, pal.accent);
    line(g, 19, 9, 24, 3, "#fff3c4");
    line(g, 20, 9, 25, 4, "#ffe08a");
  },
};

// Held items from Adept on.
const HELD = {
  sport(g, pal) {
    // a torch
    rect(g, 26, 18, 2, 10, WOOD.base);
    rect(g, 26, 18, 1, 10, WOOD.hi);
    rect(g, 25, 16, 4, 2, GOLD.base);
    put(g, 25, 16, GOLD.hi);
    ellipse(g, 27, 12.6, 2.2, 3.2, "#ff9b3d");
    ellipse(g, 27, 13.6, 1.2, 1.8, "#ffe27a");
    put(g, 27, 9, pal.accentHi);
  },
  studiu(g, pal) {
    // a book
    rect(g, 1, 19, 7, 8, pal.book);
    rect(g, 1, 19, 1, 8, pal.bookHi);
    rect(g, 3, 20, 4, 6, "#fff6e3");
    rect(g, 3, 22, 4, 1, "#c9b9a0");
    rect(g, 3, 24, 3, 1, "#c9b9a0");
    put(g, 7, 20, GOLD.base);
  },
  bani(g) {
    // a coin pouch and a coin
    ellipse(g, 27.5, 24, 2.8, 3.2, (nx) => (nx < -0.2 ? WOOD.hi : WOOD.base));
    rect(g, 26, 20, 3, 1, GOLD.base);
    ellipse(g, 28.2, 16.6, 1.8, 1.8, GOLD.base);
    put(g, 27, 16, GOLD.hi);
    put(g, 28, 17, GOLD.lo);
  },
  minte(g, pal) {
    // a staff with a glowing orb
    rect(g, 3, 9, 2, 20, WOOD.base);
    rect(g, 3, 9, 1, 20, WOOD.hi);
    ellipse(g, 4, 6.6, 2.4, 2.4, pal.orb);
    put(g, 3, 6, WHITE);
  },
  creativ(g) {
    // a lute
    line(g, 27, 20, 30, 11, WOOD.lo);
    line(g, 28, 20, 31, 11, WOOD.base);
    ellipse(g, 27, 24.4, 3.2, 3.6, (nx) => (nx < -0.25 ? WOOD.hi : "#c47b3a"));
    ellipse(g, 27, 24, 0.9, 0.9, "#3b1e0c");
    put(g, 30, 11, GOLD.base);
  },
};

// Drawn after the outline pass so it floats as a thin ring.
function drawHalo(g) {
  for (let x = 12; x <= 19; x++) {
    put(g, x, 0, GOLD.hi);
    put(g, x, 3, GOLD.base);
  }
  putSym(g, 11, 1, GOLD.base);
  putSym(g, 11, 2, GOLD.base);
  putSym(g, 10, 2, GOLD.lo);
}

// ------------------------------------------------------------ hats

// All hats sit on a head whose top is at y~10.5 (ears reach y~8.5), for every stage from Ucenic on.
function drawHeadphones(g, pal) {
  const BAND = "#3b3f58";
  for (let t = 0; t <= 40; t++) {
    const a = (Math.PI * t) / 40;
    const x = 16 - 9.8 * Math.cos(a);
    const y = 15 - 5.4 * Math.sin(a);
    put(g, x, y, "#5a5f80");
    put(g, x, y + 1, BAND);
  }
  for (const x of [5, 24]) {
    rect(g, x, 15, 3, 7, pal.accent);
    rect(g, x, 15, 3, 1, pal.accentHi);
  }
}

function drawGradCap(g) {
  rect(g, 11, 10, 10, 2, "#1f2033");
  poly(g, [[16, 5], [28, 8.5], [16, 12], [4, 8.5]], (x, y) => (y < 8.5 ? "#4a4e6d" : "#2b2d42"));
  put(g, 16, 8, GOLD.base);
  line(g, 27, 9, 27, 14, GOLD.base);
  put(g, 27, 15, GOLD.lo);
  put(g, 26, 15, GOLD.base);
  put(g, 28, 15, GOLD.base);
}

function drawNightCap(g) {
  // a soft dome over the head, a white band, and a long tip that falls to the right with a pom-pom
  for (let y = 4; y <= 11; y++) {
    const half = 8.6 * Math.sqrt(Math.max(0, 1 - ((11 - y) / 7) ** 2));
    for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) put(g, x, y, (x + y) % 5 === 0 ? "#8c7bff" : "#4b3b9e");
  }
  poly(g, [[19, 5], [24, 4.5], [29, 7.5], [30.5, 12], [28, 12.5], [26.5, 9], [22, 8]], (x, y) => ((x + y) % 5 === 0 ? "#8c7bff" : "#4b3b9e"));
  rect(g, 8, 10, 16, 2, "#f1ecff");
  rect(g, 8, 11, 16, 1, "#cfc6f0");
  ellipse(g, 29.2, 14, 2, 2, WHITE);
  put(g, 28, 13, "#cfc6f0");
}

function drawWizardHat(g) {
  poly(g, [[10, 10.5], [22, 10.5], [19, 3], [18, 0.5], [15, 1], [14, 3]], (x) => (x < 14 ? "#7d3dbd" : "#5c2593"));
  ellipse(g, 16, 11, 9.8, 1.8, (nx) => (nx < -0.3 ? "#7d3dbd" : "#4a1d7a"));
  rect(g, 11, 9, 10, 1.5, GOLD.base);
  put(g, 16, 6, GOLD.hi);
  put(g, 15, 6, GOLD.base);
  put(g, 17, 6, GOLD.base);
  put(g, 16, 5, GOLD.base);
  put(g, 16, 7, GOLD.base);
}

function drawLaurel(g) {
  for (let i = 0; i <= 9; i++) {
    const a = Math.PI + (Math.PI * (0.06 + 0.88 * i)) / 9 - Math.PI * 0.06;
    const x = 16 + 9.4 * Math.cos(a);
    const y = 15.6 + 6.2 * Math.sin(a);
    ellipse(g, x, y, 1.9, 1.2, i % 2 ? "#6ed66f" : "#3fa34d");
  }
  put(g, 16, 9, "#ff6f91");
}

function drawCrown(g) {
  poly(g, [[10, 11.5], [10, 6.5], [13, 8.8], [16, 4], [19, 8.8], [22, 6.5], [22, 11.5]], (x, y) => (y > 9 || x < 13 ? GOLD.base : GOLD.hi));
  rect(g, 10, 10, 12, 2, GOLD.base);
  rect(g, 10, 11, 12, 1, GOLD.lo);
  put(g, 16, 8, "#e8344e");
  put(g, 12, 10, "#5aa9ff");
  put(g, 20, 10, "#3fd49e");
}

// ------------------------------------------------------------ auras
// An aura is its own layer, drawn behind the body (so it can animate on its own): draw(g, mask, tier), where `mask` is
// the finished body (cells that are not null). `anim` is the class the screen gives the layer (see styles.css).

// Manhattan distance from the body, up to `max` (0 inside the body).
function distance(mask, max = 4) {
  const d = new Array(S * S).fill(99);
  const queue = [];
  for (let i = 0; i < S * S; i++) {
    if (mask[i]) {
      d[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (d[i] >= max) continue;
    const x = i % S;
    const y = Math.floor(i / S);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const j = ny * S + nx;
      if (d[j] > d[i] + 1) {
        d[j] = d[i] + 1;
        queue.push(j);
      }
    }
  }
  return d;
}

function flame(g, x, base, k = 1) {
  ellipse(g, x, base - 2 * k, 1.7 * k, 2.7 * k, "#ff6b2d");
  ellipse(g, x, base - 1.5 * k, 0.9 * k, 1.6 * k, "#ffd24a");
  put(g, x, base - 5 * k, "#ff6b2d");
}

const RAINBOW = ["#ff5f87", "#ff9b3d", "#ffd24a", "#3fe0a5", "#5cb8ff", "#8f6bff", "#ff6fae", "#ffe08a"];

export const AURAS = {
  none: null,
  embers: {
    name: "licurici",
    anim: "anim-flicker",
    draw(g) {
      [[3, 22, "#ff7a3d"], [28, 20, "#ffb347"], [5, 27, "#ffb347"], [26, 27, "#ff7a3d"], [2, 14, "#ff7a3d"], [29, 12, "#ffb347"], [24, 30, "#ff7a3d"]].forEach(([x, y, c]) => put(g, x, y, c));
    },
  },
  warm: {
    name: "contur cald",
    anim: "anim-aura-pulse",
    draw(g, mask) {
      const d = distance(mask, 2);
      for (let i = 0; i < S * S; i++) {
        if (d[i] === 1) g[i] = "#ff9b3dcc";
        else if (d[i] === 2) g[i] = "#ffcf4a55";
      }
    },
  },
  torch: {
    name: "flăcărui la picioare",
    anim: "anim-flicker",
    draw(g) {
      flame(g, 3, 29);
      flame(g, 28, 29);
      flame(g, 7, 31, 0.7);
      flame(g, 24, 31, 0.7);
    },
  },
  sparks: {
    name: "scântei care urcă",
    anim: "anim-aura-rise",
    draw(g) {
      [[4, 24, "#ffd24a"], [3, 17, "#ff9b3d"], [6, 10, "#ffd24a"], [27, 25, "#ff9b3d"], [29, 18, "#ffd24a"], [26, 9, "#ff9b3d"], [9, 29, "#ffd24a"], [22, 29, "#ff9b3d"], [4, 5, "#ffe27a"], [28, 4, "#ffe27a"]].forEach(([x, y, c]) => {
        put(g, x, y, c);
        put(g, x, y - 1, c + "88");
      });
    },
  },
  beam: {
    name: "fascicul de far",
    anim: "anim-aura-spin",
    draw(g) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x + 0.5 - 16;
          const dy = y + 0.5 - 16;
          const r = Math.hypot(dx, dy);
          if (r < 9 || r > 22) continue;
          const a = (Math.atan2(dy, dx) + Math.PI * 2) % Math.PI; // two opposite beams
          if (a > 0.1 && a < 0.42) put(g, x, y, r > 17 ? "#fff3b066" : "#fff0a0b3");
        }
      }
    },
  },
  blaze: {
    name: "aură roșu-aurie",
    anim: "anim-aura-pulse",
    draw(g, mask) {
      const d = distance(mask, 3);
      for (let i = 0; i < S * S; i++) {
        if (d[i] === 1) g[i] = "#ff4d4dcc";
        else if (d[i] === 2) g[i] = "#ff9b3d88";
        else if (d[i] === 3) g[i] = "#ffd24a44";
      }
    },
  },
  comet: {
    name: "coadă de cometă",
    anim: "anim-aura-comet",
    draw(g) {
      const tail = ["#bfe3ff", "#8fc9ff99", "#5cb8ff66", "#5cb8ff33"];
      for (let k = 0; k < 4; k++) {
        line(g, 26 + k * 1.3, 8 - k * 1.7, 30, 4 - k, tail[k]);
        put(g, 26 + k * 1.2, 8 - k * 1.5 + 1, tail[k]);
      }
      ellipse(g, 25.5, 8.5, 1.7, 1.7, WHITE);
      put(g, 3, 25, "#bfe3ff");
      put(g, 29, 27, "#bfe3ff");
      put(g, 5, 6, "#8fc9ff");
    },
  },
  constellation: {
    name: "constelație",
    anim: "anim-aura-pulse",
    draw(g) {
      const pts = [[3, 6], [10, 2], [22, 3], [29, 8], [29, 23], [3, 22]];
      for (let i = 0; i < pts.length - 1; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], "#b9d4ff55");
      for (const [x, y] of pts) {
        put(g, x, y, WHITE);
        put(g, x - 1, y, "#b9d4ffaa");
        put(g, x + 1, y, "#b9d4ffaa");
        put(g, x, y - 1, "#b9d4ffaa");
        put(g, x, y + 1, "#b9d4ffaa");
      }
    },
  },
  nova: {
    name: "explozie de culori",
    anim: "anim-aura-spin-slow",
    draw(g) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        const c = RAINBOW[k];
        line(g, 16 + 10 * Math.cos(a), 16 + 10 * Math.sin(a), 16 + 15.5 * Math.cos(a), 16 + 15.5 * Math.sin(a), c);
        line(g, 16 + 10 * Math.cos(a) + 1, 16 + 10 * Math.sin(a), 16 + 15.5 * Math.cos(a) + 1, 16 + 15.5 * Math.sin(a), c + "99");
      }
    },
  },
};

// ------------------------------------------------------------ look (what the player chose to wear)

// Each slot is a registry id -> drawer. "signature" is what the class wears on its own (the pieces above), "none" leaves
// the slot empty; an id that is not in the registry falls back to the default, so a look that came from elsewhere
// (a group member's published stats, an older app version) can never break the drawing.
// More entries are added here as items are introduced (see lib/cosmetics.js in the app for the catalog and the rules).
export const HATS = {
  signature: (g, pal, path) => HEAD[path]?.(g, pal),
  none: null,
  "focus-cap": drawHeadphones,
  "grad-cap": drawGradCap,
  "night-cap": drawNightCap,
  wizard: drawWizardHat,
  laurel: drawLaurel,
  crown: drawCrown,
};
export const HELD_ITEMS = { signature: (g, pal, path) => HELD[path]?.(g, pal), none: null };
// palette variants: (pal) => pal
export const DYES = { none: null };

export const DEFAULT_LOOK = { hat: "signature", held: "signature", aura: "none", dye: "none" };

/** The slots the renderer draws, each with a registry id that exists (anything else becomes the default). */
export function resolveLook(look) {
  const pick = (reg, id, fallback) => (typeof id === "string" && Object.hasOwn(reg, id) ? id : fallback);
  return {
    hat: pick(HATS, look?.hat, DEFAULT_LOOK.hat),
    held: pick(HELD_ITEMS, look?.held, DEFAULT_LOOK.held),
    aura: pick(AURAS, look?.aura, DEFAULT_LOOK.aura),
    dye: pick(DYES, look?.dye, DEFAULT_LOOK.dye),
  };
}

// Stage -> what it can wear. Tiers: 0 egg, 1 hatchling, 2 apprentice, 3 adept, 4 master, 5 legend.
export const STAGE_TIER = ["egg", "hatchling", "apprentice", "adept", "master", "legend"];
export const wearable = { hat: 2, held: 3, aura: 0, dye: 0 };

// ------------------------------------------------------------ public API

const frames = new Map();

// The finished body frame (outline and halo included): one grid, cached. The aura layer reads it as its mask.
function bodyFrame({ path = "sport", stage = "egg", mood = "idle", eyes = "open", crack = 0, look }) {
  const L = resolveLook(look);
  const key = `${path}|${stage}|${mood}|${eyes}|${crack}|${L.hat}|${L.held}|${L.dye}`;
  if (frames.has(key)) return frames.get(key);
  const base = PALETTES[path] || PALETTES.sport;
  const pal = DYES[L.dye] ? DYES[L.dye](base) : base;
  let g = grid();
  const tier = STAGE_TIER.indexOf(stage);

  if (tier <= 0) drawEgg(g, pal, crack);
  else if (tier === 1) drawHatchling(g, pal, mood, eyes);
  else {
    if (tier >= 4) drawCape(g, pal);
    drawCreature(g, pal, mood, eyes);
    if (tier >= wearable.hat) HATS[L.hat]?.(g, pal, path);
    if (tier >= wearable.held) HELD_ITEMS[L.held]?.(g, pal, path);
    if (tier >= 4) drawMedal(g);
  }
  g = outline(g, tier >= 5 ? GOLD_OUT : OUT);
  if (tier >= 5) drawHalo(g);
  frames.set(key, g);
  return g;
}

function toRuns(g) {
  const runs = [];
  for (let y = 0; y < S; y++) {
    let x = 0;
    while (x < S) {
      const c = g[y * S + x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < S && g[y * S + x + w] === c) w++;
      runs.push([x, y, w, c]);
      x += w;
    }
  }
  return runs;
}

const cache = new Map();

/**
 * Returns pixel runs [x, y, width, color] for one frame.
 * stage: egg | hatchling | apprentice | adept | master | legend
 * mood: idle | happy | joy | sleep;  eyes: open | closed (blink frame)
 * look: optional {hat, held, dye} (see resolveLook); without it the class wears its own items, as always.
 * The aura is a separate layer: see auraRuns.
 */
export function spriteRuns(args) {
  const { path = "sport", stage = "egg", mood = "idle", eyes = "open", crack = 0 } = args;
  const L = resolveLook(args.look);
  const key = `${path}|${stage}|${mood}|${eyes}|${crack}|${L.hat}|${L.held}|${L.dye}`;
  if (cache.has(key)) return cache.get(key);
  const runs = toRuns(bodyFrame(args));
  cache.set(key, runs);
  return runs;
}

const auraCache = new Map();

/** The aura behind the body: { runs, anim } (anim = class for the layer), or null when there is none. */
export function auraRuns(args) {
  const { path = "sport", stage = "egg", crack = 0 } = args;
  const L = resolveLook(args.look);
  const aura = AURAS[L.aura];
  if (!aura) return null;
  const key = `${path}|${stage}|${crack}|${L.hat}|${L.held}|${L.dye}|${L.aura}`;
  if (auraCache.has(key)) return auraCache.get(key);
  const g = grid();
  aura.draw(g, bodyFrame({ ...args, mood: "idle", eyes: "open" }), STAGE_TIER.indexOf(stage));
  const out = { runs: toRuns(g), anim: aura.anim };
  auraCache.set(key, out);
  return out;
}

export const SPRITE_SIZE = S;
