// Plan: one place for what to do and where to go. Two tabs instead of two separate menu entries:
// the calendar with the to-dos, and the goals (big Obiective plus the week's and month's Scopuri).

import React from "react";
import { CalendarDays, Target } from "lucide-react";
import { Tabs } from "../components/ui.jsx";

export default function PlanHub({ view, go, goalsDue = 0, children }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-ink">Plan</h1>
          <p className="text-sm font-semibold text-dim">Ce ai de făcut și unde vrei să ajungi, într-un singur loc.</p>
        </div>
        <Tabs
          value={view === "goals" ? "goals" : "plan"}
          onChange={(v) => go(v)}
          items={[
            { value: "plan", label: "Calendar și to-do", icon: CalendarDays, id: "plan-tab-calendar" },
            { value: "goals", label: "Obiective și scopuri", icon: Target, count: goalsDue, id: "plan-tab-goals" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
