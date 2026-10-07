// Sign-in gate for the Supabase build: email + password, or Google.
// Where Supabase is off (the claude.ai artifact, or no env configured) it renders the app straight away.

import React, { useEffect, useRef, useState } from "react";
import { Leaf, LogIn, Mail, UserPlus } from "lucide-react";
import { getClient } from "../lib/supabase.js";
import { inViewer } from "../lib/platform.js";
import { Button, Field, Panel } from "../components/ui.jsx";

const ERRORS = {
  "Invalid login credentials": "Email sau parolă greșite.",
  "User already registered": "Există deja un cont cu acest email. Intră în cont.",
  "Email not confirmed": "Confirmă emailul din mesajul primit, apoi intră în cont.",
  "Password should be at least 6 characters.": "Parola trebuie să aibă cel puțin 8 caractere.",
};
const SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY || "";
const weakPassword = (p) => (p.length < 8 || !/[a-zA-Z]/.test(p) || !/\d/.test(p) ? "Parola trebuie să aibă cel puțin 8 caractere, cu litere și cifre." : "");

// Cloudflare Turnstile (bot check). Renders nothing when no site key is configured.
function Captcha({ onToken, resetKey }) {
  const box = useRef(null);
  const id = useRef(null);
  useEffect(() => {
    if (!SITE_KEY) return;
    let dead = false;
    const mount = () => {
      if (dead || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) mount();
    else {
      let s = document.getElementById("cf-turnstile");
      if (!s) {
        s = document.createElement("script");
        s.id = "cf-turnstile";
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", mount);
    }
    return () => {
      dead = true;
      if (id.current != null) window.turnstile?.remove(id.current);
    };
  }, []);
  useEffect(() => {
    if (id.current != null) window.turnstile?.reset(id.current); // tokens are single-use
  }, [resetKey]);
  return SITE_KEY ? <div ref={box} className="flex justify-center" /> : null;
}
const errorCopy = (e) => ERRORS[e?.message] || (e?.status === 429 ? "Prea multe încercări. Mai așteaptă puțin." : "Nu a mers. Încearcă din nou.");

function Splash({ text }) {
  return (
    <div className="app-bg grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-dim">
        <Leaf className="anim-flicker text-gold" size={28} aria-hidden="true" />
        <span className="font-pixel text-lg text-ink">{text}</span>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.3-3.9 7.1-9.7 7.1-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function SignIn({ client }) {
  const [mode, setMode] = useState("in"); // in | up | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    const address = email.trim();
    const captchaToken = captcha || undefined;
    if (mode === "up" && weakPassword(password)) {
      setError(weakPassword(password));
      setBusy(false);
      return;
    }
    if (mode === "in") {
      const { error: err } = await client.auth.signInWithPassword({ email: address, password, options: { captchaToken } });
      if (err) setError(errorCopy(err));
    } else if (mode === "up") {
      const { data, error: err } = await client.auth.signUp({ email: address, password, options: { emailRedirectTo: window.location.origin, captchaToken } });
      if (err) setError(errorCopy(err));
      else if (!data.session) setNote("Ți-am trimis un email de confirmare. Deschide linkul, apoi intră în cont.");
    } else {
      const { error: err } = await client.auth.resetPasswordForEmail(address, { redirectTo: window.location.origin, captchaToken });
      if (err) setError(errorCopy(err));
      else setNote("Dacă există un cont cu acest email, ai primit un link pentru parolă nouă.");
    }
    setCaptcha("");
    setAttempt((n) => n + 1);
    setBusy(false);
  }

  async function google() {
    setError("");
    const { error: err } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (err) setError(errorCopy(err));
  }

  const title = mode === "in" ? "Bine ai revenit" : mode === "up" ? "Cont nou" : "Parolă uitată";
  return (
    <div className="app-bg grid min-h-screen place-items-center p-4">
      <Panel tone="violet" corners className="w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center gap-3">
          <Leaf className="text-gold" size={28} aria-hidden="true" />
          <div>
            <div className="font-pixel text-2xl leading-none text-ink">Momentum</div>
            <h1 className="text-sm font-bold text-dim">{title}</h1>
          </div>
        </div>

        <p className="text-sm text-dim">
          Momentum este o aplicație de self-improvement gamificată: îți urmărești obiceiurile zilnice, personajul tău evoluează odată cu progresul, poți intra în grupuri cu prietenii și primești rapoarte AI. Te autentifici cu Google sau cu email ca să-ți sincronizezi progresul între dispozitive.
        </p>

        {mode !== "reset" && (
          <>
            <Button type="button" variant="ghost" className="w-full" onClick={google}>
              <GoogleMark /> Continuă cu Google
            </Button>
            <div className="flex items-center gap-3 text-xs font-bold text-faint">
              <span className="h-px flex-1 bg-edge" /> sau cu email <span className="h-px flex-1 bg-edge" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Email" htmlFor="auth-email">
            <input id="auth-email" className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== "reset" && (
            <Field label="Parolă" htmlFor="auth-pass">
              <input
                id="auth-pass"
                className="field"
                type="password"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                required
                minLength={mode === "up" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <Captcha onToken={setCaptcha} resetKey={attempt} />
          {error && (
            <p role="alert" className="text-sm font-bold text-rose">
              {error}
            </p>
          )}
          {note && (
            <p role="status" className="text-sm font-bold text-mint">
              {note}
            </p>
          )}
          <Button type="submit" busy={busy} disabled={!!SITE_KEY && !captcha} icon={mode === "in" ? LogIn : mode === "up" ? UserPlus : Mail} className="w-full">
            {mode === "in" ? "Intră în cont" : mode === "up" ? "Creează contul" : "Trimite linkul"}
          </Button>
        </form>

        <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-dim">
          {mode === "in" ? (
            <>
              <button type="button" className="focus-ring underline" onClick={() => setMode("up")}>
                Nu ai cont? Creează unul
              </button>
              <button type="button" className="focus-ring underline" onClick={() => setMode("reset")}>
                Ai uitat parola?
              </button>
            </>
          ) : (
            <button type="button" className="focus-ring underline" onClick={() => setMode("in")}>
              Înapoi la autentificare
            </button>
          )}
        </div>

        <div className="flex gap-4 text-xs font-bold text-faint">
          <a className="focus-ring underline" href="privacy.html">
            Confidențialitate
          </a>
          <a className="focus-ring underline" href="terms.html">
            Termeni
          </a>
        </div>
      </Panel>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [phase, setPhase] = useState("checking"); // checking | off | in | out
  const [client, setClient] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let sub = null;
    let cancelled = false;
    (async () => {
      let c = null;
      try {
        c = inViewer() ? null : await getClient();
      } catch (e) {
        console.warn("Supabase is unavailable, running without a backend:", e); // e.g. a dev server started before vite.config.js defined __SUPABASE__
      }
      if (cancelled) return;
      if (!c) return setPhase("off");
      setClient(c);
      const apply = (session) => {
        setUserId(session?.user?.id ?? null);
        setPhase(session ? "in" : "out");
      };
      const { data } = await c.auth.getSession();
      if (cancelled) return;
      apply(data.session);
      sub = c.auth.onAuthStateChange((_event, session) => apply(session)).data.subscription;
    })();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  if (phase === "checking") return <Splash text="Se încarcă aventura…" />;
  if (phase === "out") return <SignIn client={client} />;
  // a different account gets a fresh app (and a fresh store)
  return <React.Fragment key={userId || "local"}>{children}</React.Fragment>;
}
