// Tu: your settings and your group, side by side in one place.

import React from "react";
import { Tabs } from "../components/ui.jsx";
import { tr } from "../lib/i18n.js";

export default function TuHub({ view, go, unread = 0, children }) {
  return (
    <div className="space-y-5">
      <Tabs
        value={view === "group" ? "group" : "settings"}
        onChange={(v) => go(v)}
        items={[
          { value: "settings", label: tr("Setări") },
          { value: "group", label: tr("Grup"), count: unread },
        ]}
      />
      {children}
    </div>
  );
}
