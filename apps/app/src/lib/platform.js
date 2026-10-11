// Access to the Claude artifact runtime. Inside a claude.ai viewer,
// window.claude.use(name) resolves a capability (or null); anywhere else the
// app runs on local fallbacks.

const memo = new Map();

export const inViewer = () => typeof window !== "undefined" && !!window.claude && typeof window.claude.use === "function";

export function capability(name) {
  if (!memo.has(name)) {
    memo.set(name, inViewer() ? Promise.resolve(window.claude.use(name)).catch(() => null) : Promise.resolve(null));
  }
  return memo.get(name);
}

/** Reads a capability's consent state without prompting. */
export async function permissionState(name) {
  const perms = await capability("permissions");
  if (!perms) return "unavailable";
  try {
    return await perms.state(name);
  } catch {
    return "unavailable";
  }
}
