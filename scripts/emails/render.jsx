// Renders every campaign x language x subject variant to HTML and plain text. Bundled by build.mjs (esbuild, JSX) and
// imported there; nothing here ships to the app.

import React from "react";
import { render } from "@react-email/render";
import Email from "./Email.jsx";
import { COPY } from "./copy.js";

export async function renderAll() {
  const out = {};
  for (const [type, langs] of Object.entries(COPY)) {
    out[type] = {};
    for (const [lang, copy] of Object.entries(langs)) {
      const el = <Email lang={lang} copy={copy} preheader={copy.preheader} />;
      out[type][lang] = {
        subjects: copy.subjects,
        html: await render(el),
        text: await render(el, { plainText: true }),
      };
    }
  }
  return out;
}
