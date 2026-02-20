import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aggressive PWA update: poll for new SW every 30 seconds + reload instantly
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Poll for updates every 30 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 30 * 1000);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            window.location.reload();
          }
        });
      }
    });
  });

  // Also listen for controller change (covers skipWaiting path)
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // Check on every visibility change (user returns to tab/app)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {}));
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
