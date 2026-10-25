// Plan: what to do and where to go. One row of tabs, no page title (the menu already says where you are).

import React from "react";
import { Tabs } from "../components/ui.jsx";
import { tr } from "../lib/i18n.js";

export default function PlanHub({ view, go, goalsDue = 0, children }) {
  const here = view === "goals" ? "goals" : view === "habits" ? "habits" : "plan";
  return (
    <div className="space-y-5">
      <Tabs
        value={here}
        onChange={(v) => go(v)}
        items={[
          { value: "habits", label: tr("Obiceiuri") },
          { value: "plan", label: tr("Calendar") },
          { value: "goals", label: tr("Obiective"), count: goalsDue },
        ]}
      />
      {children}
    </div>
  );
}
