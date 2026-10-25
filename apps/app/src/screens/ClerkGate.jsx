// Sign-in gate for the web build: Clerk handles email, Google and the account UI.
// Loaded lazily from Auth.jsx, so the artifact build (no backend) never bundles Clerk.

import LanguageSwitch from "../components/LanguageSwitch.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/clerk-react";
import { Leaf, ShieldCheck } from "lucide-react";
import Splash from "./Splash.jsx";
import { Button } from "../components/ui.jsx";
import { useTheme } from "../lib/themes.js";
import { LEGAL_VERSION, LegalChecks, clearTicked, legalOk, rememberTicked, tickedEmails, wasTicked } from "../components/LegalChecks.jsx";
import { tr, legalUrl } from "../lib/i18n.js";
import { identify, resetIfIdentified } from "../lib/analytics.js";

// Clerk wants real colours, not CSS variables, so the card is painted from the theme that is active right now
// (read off the page) and rebuilt when the theme changes: a light theme gets a light card, a dark one a dark card.
const token = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().split(/\s+/);
  return v.length === 3 ? `rgb(${v[0]}, ${v[1]}, ${v[2]})` : undefined;
};

function appearanceFor() {
  return {
    variables: {
      colorPrimary: token("gold"),
      colorTextOnPrimaryBackground: token("on-gold"),
      colorBackground: token("panel"),
      colorInputBackground: token("well"),
      colorInputText: token("ink"),
      colorText: token("ink"),
      colorTextSecondary: token("dim"),
      colorNeutral: token("ink"),
      colorDanger: token("rose"),
      colorSuccess: token("mint"),
      fontFamily: "Nunito, ui-rounded, system-ui, sans-serif",
      borderRadius: "0.75rem",
    },
    elements: {
      card: { boxShadow: "none", border: `1px solid ${token("edge")}` },
      footerAction: { display: "none" }, // its link would leave the page; the toggle below keeps both forms here
      socialButtonsBlockButton: { backgroundColor: token("well"), border: `1px solid ${token("edge")}` },
      dividerLine: { backgroundColor: token("edge") },
      headerTitle: { fontFamily: 'Nunito, monospace' },
      formButtonPrimary: { fontWeight: 800 },
    },
  };
}


const accepted = (user) => user?.unsafeMetadata?.legal?.version === LEGAL_VERSION;

// Whoever is signed in has to have accepted the current terms: new accounts (email, Google, or an OAuth sign-in
// that turned into a sign-up) and existing ones alike. The acceptance, its version and its time are kept on the
// Clerk user. Players who ticked the boxes on the sign-up form are recorded without being asked again.
function Consent({ children }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [checks, setChecks] = useState({ terms: false, age: false, emails: true });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function record() {
    setBusy(true);
    setFailed(false);
    try {
      // `emails` is the optional box of the sign-up form (from the form itself when the player ticked it before the account existed)
      const emails = wasTicked() ? tickedEmails() : checks.emails !== false;
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, legal: { version: LEGAL_VERSION, at: new Date().toISOString(), age16: true, emails } } });
      clearTicked();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  const ticked = isLoaded && user && !accepted(user) && wasTicked();
  useEffect(() => {
    if (ticked) record();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticked]);

  if (!isLoaded || !user) return <Splash text={tr("Se încarcă aventura…")} />;
  if (accepted(user)) return children;
  if (ticked && !failed) return <Splash text={tr("Se încarcă aventura…")} />;

  return (
    <div className="app-bg grid min-h-screen place-items-center p-4">
      <div className="panel w-full max-w-md space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/30">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl leading-tight text-ink">{tr("Un ultim pas")}</h1>
            <p className="text-xs font-semibold text-dim">{tr("Înainte să intri în Molted")}</p>
          </div>
        </div>
        <p className="text-sm text-body">{tr("Ca să folosești aplicația, confirmă mai jos. Documentele se deschid într-o pagină nouă, ca să le poți citi pe îndelete.")}</p>
        <LegalChecks value={checks} onChange={setChecks} />
        {failed && (
          <p role="alert" className="rounded-xl bg-rose/10 p-3 text-sm font-semibold text-rose ring-1 ring-rose/30">{tr("Nu am putut salva confirmarea. Verifică conexiunea și încearcă din nou.")}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="focus-ring rounded-lg px-1 text-xs font-bold text-dim underline hover:text-ink" onClick={() => signOut()}>{tr("Ieși din cont")}</button>
          <Button id="legal-continue" busy={busy} disabled={!legalOk(checks)} onClick={record}>{tr("Continuă")}</Button>
        </div>
      </div>
    </div>
  );
}

function Gate({ children }) {
  const [mode, setMode] = useState("in"); // in | up
  const [signupChecks, setSignupChecks] = useState({ terms: false, age: false, emails: true });
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) identify(userId);
    else resetIfIdentified();
  }, [isLoaded, isSignedIn, userId]);
  if (!isLoaded) return <Splash text={tr("Se încarcă aventura…")} />;
  if (!isSignedIn) {
    return (
      <div className="app-bg grid min-h-screen place-items-center p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
          <LanguageSwitch />
          <div className="flex items-center gap-3">
            <Leaf className="text-gold" size={28} aria-hidden="true" />
            <div className="font-display text-2xl leading-none text-ink">Molted</div>
          </div>
          <p className="text-center text-sm text-dim">{tr("Molted este un coach pentru elevi: îți planifici temele și examenele, îți urmărești obiceiurile, personajul tău evoluează odată cu progresul, poți intra în grupuri cu colegii și primești rapoarte AI.")}</p>
          {mode === "in" ? (
            <SignIn key="in" routing="hash" />
          ) : (
            <>
              <div className="w-full">
                <LegalChecks
                  value={signupChecks}
                  onChange={(v) => {
                    setSignupChecks(v);
                    if (legalOk(v)) rememberTicked(v.emails);
                    else clearTicked();
                  }}
                />
              </div>
              {legalOk(signupChecks) ? (
                <SignUp key="up" routing="hash" />
              ) : (
                <p className="w-full rounded-xl border border-dashed border-edge-hi p-4 text-center text-sm font-semibold text-dim">{tr("Bifează căsuțele de mai sus ca să-ți poți crea contul.")}</p>
              )}
            </>
          )}
          <button type="button" className="focus-ring text-xs font-bold text-dim underline" onClick={() => {
              if (mode === "up") clearTicked(); // going back to sign-in: the ticks of the sign-up form no longer count
              setMode(mode === "in" ? "up" : "in");
            }}>
            {mode === "in" ? tr("Nu ai cont? Creează unul") : tr("Ai deja cont? Intră în cont")}
          </button>
          <div className="flex gap-4 text-xs font-bold text-faint">
            <a className="focus-ring underline" href={legalUrl("privacy")}>{tr("Confidențialitate")}</a>
            <a className="focus-ring underline" href={legalUrl("terms")}>{tr("Termeni")}</a>
          </div>
        </div>
      </div>
    );
  }
  // a different account gets a fresh app (and a fresh store)
  return (
    <React.Fragment key={userId}>
      <Consent>{children}</Consent>
    </React.Fragment>
  );
}

export default function ClerkGate({ children }) {
  const theme = useTheme();
  const appearance = useMemo(appearanceFor, [theme]);
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} appearance={appearance}>
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}
