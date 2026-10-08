import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./screens/Auth.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>
);
