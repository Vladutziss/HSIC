// Web Push on the client: permission, subscription, and keeping the server row in step with the settings.
// The server side is supabase/functions/push (+ migration 0011). Nothing here runs in the artifact build.

import { getClient } from "./supabase.js";
import { isStandalone } from "./pwa.js";

const KEY = __SUPABASE__ ? import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() : "";

const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

async function registration() {
  return "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistration()) || null : null;
}

/** unsupported | install (iPhone, not added to the home screen yet) | denied | off | on */
export async function pushStatus() {
  if (!__SUPABASE__ || !KEY) return "unsupported";
  if (isIos() && !isStandalone() && !("PushManager" in window)) return "install";
  if (!("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const reg = await registration();
  if (!reg) return "unsupported"; // dev server: no service worker
  if (Notification.permission === "denied") return "denied";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** The row the server keeps for this device: who is due at what local time, and for what. */
async function save(sub, { reviewTime, report, nudges }) {
  const client = await getClient();
  if (!client) throw new Error("offline");
  const k = sub.toJSON().keys;
  const { error } = await client.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: k.p256dh,
    p_auth: k.auth,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    p_report_time: reviewTime || "21:00",
    p_daily: report !== false,
    p_nudges: nudges !== false,
  });
  if (error) throw error;
}

/** Call it from a tap: the permission prompt must follow a user gesture (iOS refuses it otherwise). */
export async function enablePush(prefs) {
  const reg = await registration();
  if (!reg) throw new Error("no service worker");
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(KEY) }));
  await save(sub, prefs);
  return "on";
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const client = await getClient();
  await client?.rpc("remove_push_subscription", { p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Re-sends the prefs of an existing subscription (report time or toggles changed). */
export async function syncPush(prefs) {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub, prefs);
}

/** Tells the server a nudge was just sent, so it can push to the recipients. Best effort. */
export async function notifyNudge(client, id) {
  try {
    await client.functions.invoke("push", { body: { action: "nudge", id } });
  } catch {
    /* the nudge itself is saved; the push is a bonus */
  }
}
