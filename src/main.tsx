import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Silently check for SW updates without forcing reload
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates every 60 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 1000);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Skip waiting so the new SW activates on next navigation
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
