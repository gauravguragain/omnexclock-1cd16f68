import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force clear all caches and hard reload
async function forceRefresh() {
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
  window.location.reload();
}

// On load: unregister any existing SW, clear caches, then re-register fresh
if ("serviceWorker" in navigator) {
  // Immediately check for updates and skip waiting
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    for (const reg of registrations) {
      // Force update check
      await reg.update().catch(() => {});
      // If there's a waiting worker, skip waiting immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  });

  navigator.serviceWorker.ready.then((registration) => {
    // Poll for updates every 10 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 10 * 1000);

    // Check immediately on load
    registration.update().catch(() => {});

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New content available — skip waiting and force refresh
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
          if (newWorker.state === "activated") {
            forceRefresh();
          }
        });
      }
    });
  });

  // Listen for controller change (covers skipWaiting path)
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      forceRefresh();
    }
  });

  // Check on every visibility change (user returns to tab/app)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }
      });
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
