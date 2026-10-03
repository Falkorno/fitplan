import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/insights.css";
import "./styles/growth.css";
import "./styles/schedule.css";
import "./styles/history.css";
import "./styles/workout-library.css";
import "./styles/system.css";
import "./styles/overlays.css";
import "./styles/touch.css";
import "./styles/colors.css";
import "./styles/dashboard.css";
import "./styles/dashboard-chart.css";
import "./styles/typography.css";
import "./styles/navigation.css";
import "./styles/empty-states.css";
import "./styles/settings.css";
import "./styles/accessibility.css";
import "./styles/habit-orbit.css";
import "./styles/ui-next.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        return registration.update();
      })
      .catch((error) => console.warn("Offline mode unavailable", error)),
  );
}
if ("storage" in navigator && "persist" in navigator.storage) {
  navigator.storage.persist().catch(() => false);
}
