// May Molted send a webhook to this address? The server calls addresses that players type in, so an address must
// not be a way to reach machines that are not on the public internet (the function's own host, a private network, a
// cloud metadata service). This file is the rule; supabase/functions/webhooks applies it again to every address a
// name resolves to, at the moment of sending. The Settings form uses it to say what is wrong before saving.
// Pure, tested in tests/webhooks.test.mjs.

/** [a, b, c, d] of a dotted IPv4 address, or null. */
function ipv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

function privateV4([a, b, c]) {
  return (
    a === 0 || // "this network"
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol assignments, documentation
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast and reserved
  );
}

/** The 8 groups of an IPv6 address as numbers, or null. Handles "::" and a dotted IPv4 tail. */
function ipv6(text) {
  let s = String(text).toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(":")) return null;
  const tail = s.lastIndexOf(":");
  const last = s.slice(tail + 1);
  if (last.includes(".")) {
    const v4 = ipv4(last);
    if (!v4) return null;
    s = `${s.slice(0, tail + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** true for an address that is not a public one (IPv4 or IPv6, as text). Anything that is not an address is true too. */
export function isPrivateIp(ip) {
  const v4 = ipv4(String(ip));
  if (v4) return privateV4(v4);
  const g = ipv6(ip);
  if (!g) return true;
  const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8];
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return g[5] === 0xffff ? privateV4(embedded) : true; // ::ffff:a.b.c.d, and ::, ::1, ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(embedded); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  return false;
}

const INTERNAL_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion)$|\.home\.arpa$|\.in-addr\.arpa$|\.ip6\.arpa$/;

/**
 * { ok: true, url, host } for an address a webhook may go to, else { ok: false, reason }:
 *   format (not an address) · scheme (not https) · credentials (user:password@) · host (an IPv6 literal, a bare
 *   name) · private (this machine, a private network, a reserved name).
 */
export function checkWebhookUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 500 || /\s/.test(text)) return { ok: false, reason: "format" };
  let u;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: "format" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || host.includes(":")) return { ok: false, reason: "host" };
  const v4 = ipv4(host);
  if (v4) return privateV4(v4) ? { ok: false, reason: "private" } : { ok: true, url: u.toString(), host };
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || /^\d+$/.test(host.split(".").pop())) return { ok: false, reason: "host" };
  if (INTERNAL_NAME.test(host)) return { ok: false, reason: "private" };
  return { ok: true, url: u.toString(), host };
}

export const WEBHOOK_EVENTS = ["habit.checked", "plan.applied", "report.created", "reflection.created"];
