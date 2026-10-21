// Clerk on the landing (same accounts as the app). Loaded on demand from the instance's own Frontend API, like admin.js.
export const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";

export const appearance = {
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
    socialButtonsBlockButton: { backgroundColor: "#221d45", border: "1px solid #2e2860" },
    dividerLine: { backgroundColor: "#2e2860" },
    headerTitle: { fontFamily: "Nunito, monospace" },
    formButtonPrimary: { fontWeight: 800 },
  },
};

let loading = null;
export function loadClerk() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const api = atob(CLERK_KEY.split("_").slice(2).join("_")).replace(/\$$/, "");
    const s = document.createElement("script");
    s.src = `https://${api}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.clerkPublishableKey = CLERK_KEY;
    s.onload = async () => {
      try {
        await window.Clerk.load({ appearance });
        resolve(window.Clerk);
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("Clerk nu s-a încărcat"));
    document.head.append(s);
  });
  return loading;
}
