// Sign-in gate for the web build: Clerk handles email, Google and the account UI.
// Loaded lazily from Auth.jsx, so the artifact build (no backend) never bundles Clerk.

import React from "react";
import { ClerkProvider, SignIn, useAuth } from "@clerk/clerk-react";
import { Leaf } from "lucide-react";
import Splash from "./Splash.jsx";

const appearance = { variables: { colorPrimary: "#ffc542", colorTextOnPrimaryBackground: "#2a1b00" } };

function Gate({ children }) {
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
          <SignIn routing="hash" />
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
