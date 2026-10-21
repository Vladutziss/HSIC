import "./instrument.js";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./screens/Auth.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";
import { registerServiceWorker } from "./lib/pwa.js";
import { getLocale } from "./lib/i18n.js";
import "./lib/themes.js"; // applies the saved colour theme before the first render
import "./styles.css";

document.documentElement.lang = getLocale();

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
    <InstallPrompt />
  </AuthGate>
);

registerServiceWorker();
