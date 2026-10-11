// PWA plumbing for the web build: service worker registration and the install prompt.
// The artifact build (no backend, runs inside claude.ai) skips all of it.

const DISMISS_KEY = "molted.installDismissed";

export function registerServiceWorker() {
  if (!__SUPABASE__ || !import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // after load, so it never competes with the first paint; a new version takes over on the next open
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

// Safari on iPhone/iPad (iPadOS reports itself as a Mac with touch); other iOS browsers cannot add to the home screen
export const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
};

export const installDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

export const dismissInstall = () => {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
};
