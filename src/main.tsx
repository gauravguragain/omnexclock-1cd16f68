import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force clear all caches and hard reload
async function forceRefresh() {
  // Clear all Cache Storage entries
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
  window.location.reload();
}

// Aggressive PWA update: poll for new SW + force reload with cache bust
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Poll for updates every 15 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 15 * 1000);

    // Check immediately on load
    registration.update().catch(() => {});

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            forceRefresh();
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
      forceRefresh();
    }
  });

  // Check on every visibility change (user returns to tab/app)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {}));
    }
  });

  // On first load, check immediately for waiting worker and skip
  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
