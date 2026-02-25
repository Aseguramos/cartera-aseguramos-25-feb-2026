




// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx"; // Asegúrate de tener App.jsx
import "./index.css"; // Opcional, si tienes estilos

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registrar Service Worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(reg => console.log("✅ SW activo:", reg.scope))
      .catch(err => console.log("❌ Error SW:", err));
  });
}