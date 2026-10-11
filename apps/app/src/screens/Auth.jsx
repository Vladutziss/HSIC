// Sign-in gate. The web build signs in with Clerk (ClerkGate.jsx). Where there is no backend
// (the claude.ai artifact, or no Clerk key configured) it renders the app straight away.

import React, { Suspense } from "react";
import { inViewer } from "../lib/platform.js";
import Splash from "./Splash.jsx";

// the condition is a literal after bundling, so the artifact build drops the import (and Clerk with it)
const ClerkGate = __SUPABASE__ ? React.lazy(() => import("./ClerkGate.jsx")) : null;

export default function AuthGate({ children }) {
  if (!ClerkGate || inViewer() || !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return children;
  return (
    <Suspense fallback={<Splash text="Se încarcă aventura…" />}>
      <ClerkGate>{children}</ClerkGate>
    </Suspense>
  );
}
