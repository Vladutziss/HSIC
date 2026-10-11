// Sign-in gate for the web build: Clerk handles email, Google and the account UI.
// Loaded lazily from Auth.jsx, so the artifact build (no backend) never bundles Clerk.

import React, { useState } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { Leaf } from "lucide-react";
import Splash from "./Splash.jsx";

// the Noapte palette (packages/ui/base.css) as hex: Clerk's variables want real colours
const appearance = {
  variables: {
    colorPrimary: "#ffc542",
    colorTextOnPrimaryBackground: "#2a1b00",
    colorBackground: "#1a1636",
    colorInputBackground: "#120f29",
    colorInputText: "#f3efff",
    colorText: "#f3efff",
    colorTextSecondary: "#9a91c9",
    colorNeutral: "#cfc8f0",
    colorDanger: "#ff5f87",
    colorSuccess: "#3fe0a5",
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid #2e2860" },
    footerAction: { display: "none" }, // its link would leave the page; the toggle below keeps both forms here
    socialButtonsBlockButton: { backgroundColor: "#221d45", border: "1px solid #2e2860" },
    dividerLine: { backgroundColor: "#2e2860" },
    headerTitle: { fontFamily: '"Pixelify Sans", Nunito, monospace' },
    formButtonPrimary: { fontWeight: 800 },
  },
};

function Gate({ children }) {
  const [mode, setMode] = useState("in"); // in | up
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <Splash text="Se încarcă aventura…" />;
  if (!isSignedIn) {
    return (
      <div className="app-bg grid min-h-screen place-items-center p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
          <div className="flex items-center gap-3">
            <Leaf className="text-gold" size={28} aria-hidden="true" />
            <div className="font-pixel text-2xl leading-none text-ink">Molted</div>
          </div>
          <p className="text-center text-sm text-dim">
            Molted este o aplicație de self-improvement gamificată: îți urmărești obiceiurile zilnice, personajul tău evoluează odată cu progresul, poți intra în grupuri cu prietenii și primești rapoarte AI.
          </p>
          {mode === "in" ? <SignIn key="in" routing="hash" /> : <SignUp key="up" routing="hash" />}
          <button type="button" className="focus-ring text-xs font-bold text-dim underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Nu ai cont? Creează unul" : "Ai deja cont? Intră în cont"}
          </button>
          <div className="flex gap-4 text-xs font-bold text-faint">
            <a className="focus-ring underline" href="https://molted.eu/privacy.html">
              Confidențialitate
            </a>
            <a className="focus-ring underline" href="https://molted.eu/terms.html">
              Termeni
            </a>
          </div>
        </div>
      </div>
    );
  }
  // a different account gets a fresh app (and a fresh store)
  return <React.Fragment key={userId}>{children}</React.Fragment>;
}

export default function ClerkGate({ children }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} appearance={appearance}>
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}
