// Builds the app as one self-contained HTML page for a claude.ai artifact:
// Tailwind CSS and the app bundle are inlined; React, ReactDOM and Recharts
// load from the jsDelivr CDN (an allowed host) as UMD globals.
//
//   node scripts/build-artifact.mjs            -> dist/momentum.html
//   node scripts/build-artifact.mjs --local    -> dist/momentum.local.html (libraries from /node_modules, for tests
//                                                 served from the repository root)

import { build, transform } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindConfig from "../tailwind.config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = process.argv.includes("--local");
const outDir = path.join(root, "dist");
await fs.mkdir(outDir, { recursive: true });

// 1. CSS
const cssPath = path.join(root, "src/styles.css");
const cssIn = await fs.readFile(cssPath, "utf8");
const processed = await postcss([
  tailwindcss({ ...tailwindConfig, content: [path.join(root, "src/**/*.{js,jsx}")] }),
  autoprefixer(),
]).process(cssIn, { from: cssPath });
const css = (await transform(processed.css, { loader: "css", minify: true })).code;

// 2. JS
const GLOBALS = { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM", recharts: "Recharts" };
const globals = {
  name: "globals",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client|recharts)$/ }, (a) => ({ path: a.path, namespace: "global" }));
    b.onLoad({ filter: /.*/, namespace: "global" }, (a) => ({ contents: `module.exports = window.${GLOBALS[a.path]};`, loader: "js" }));
  },
};
const result = await build({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"', __SUPABASE__: "false" },
  plugins: [globals],
  logLevel: "warning",
  logOverride: { "empty-import-meta": "silent" }, // import.meta only appears in code the artifact build removes
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 3. Page
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const v = (name) => pkg.dependencies[name].replace(/^[^\d]*/, "");
const libs = [
  ["react", `react@${v("react")}/umd/react.production.min.js`],
  ["react-dom", `react-dom@${v("react-dom")}/umd/react-dom.production.min.js`],
  ["prop-types", "prop-types@15.8.1/prop-types.min.js"],
  ["recharts", `recharts@${v("recharts")}/umd/Recharts.js`],
];
const src = ([name, cdn]) =>
  local ? `/node_modules/${name}/${cdn.split("/").slice(1).join("/")}` : `https://cdn.jsdelivr.net/npm/${cdn}`;

const html = `<title>Molted</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pixelify+Sans:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
${libs.map((l) => `<script src="${src(l)}"></script>`).join("\n")}
<script>${js}</script>
`;
const file = path.join(outDir, local ? "momentum.local.html" : "momentum.html");
await fs.writeFile(file, local ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${html}` : html);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${path.relative(root, file)}  ${kb(Buffer.byteLength(html))}  (css ${kb(css.length)}, js ${kb(js.length)})`);
