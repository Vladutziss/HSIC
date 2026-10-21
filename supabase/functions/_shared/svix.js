// Verifies a Svix-signed webhook (Resend signs its webhooks this way). Pure Web Crypto, so Deno and Node both run it.
// https://docs.svix.com/receiving/verifying-payloads/how-manual

const enc = new TextEncoder();

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes) => btoa(String.fromCharCode(...bytes));

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The `svix-signature` value ("v1,<base64>") for a payload; used by the verifier and by the tests. */
export async function sign(secret, id, timestamp, body) {
  const key = await crypto.subtle.importKey("raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${timestamp}.${body}`)));
  return `v1,${bytesToB64(mac)}`;
}

/**
 * headers: anything with .get(name). Returns true only for a fresh (within `toleranceSec`), correctly signed payload.
 * `body` must be the raw request text, not parsed JSON.
 */
export async function verifySvix(headers, body, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures || !secret) return false;
  if (!Number.isFinite(Number(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > toleranceSec) return false;
  let expected;
  try {
    expected = await sign(secret, id, timestamp, body);
  } catch {
    return false;
  }
  return signatures.split(" ").some((s) => sameString(s, expected));
}
